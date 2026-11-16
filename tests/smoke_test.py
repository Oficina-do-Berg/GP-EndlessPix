"""Teste de fumaça da interface e da fila em modo DRY_RUN."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import time
import uuid
from pathlib import Path
from subprocess import CompletedProcess

import pytest

TEST_PASSWORD = "senha-de-teste"
TEST_DATA_DIR = Path(tempfile.mkdtemp(prefix="photosweb-test-"))

os.environ["DATA_DIR"] = str(TEST_DATA_DIR)
os.environ["TMP_DIR"] = str(TEST_DATA_DIR / "tmp")
os.environ["DB_PATH"] = str(TEST_DATA_DIR / "app.db")
os.environ["GOTOHP_CONFIG"] = str(TEST_DATA_DIR / "gotohp.config")
os.environ["APP_PASSWORD"] = TEST_PASSWORD
os.environ["SECRET_KEY"] = "chave-de-teste-nao-use-em-producao"
os.environ["DRY_RUN"] = "1"
os.environ["VERIFY_BINARY"] = "0"
os.environ["MAX_UPLOAD_MB"] = "1"

from fastapi.testclient import TestClient  # noqa: E402

from app import db  # noqa: E402
from app.gotohp import _parse_upload_output  # noqa: E402
from app.main import app  # noqa: E402

JPEG_BYTES = b"\xff\xd8\xff\xe0" + (b"photos-web-test" * 200)


@pytest.fixture()
def anon_client():
    with TestClient(app) as client:
        yield client


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        response = test_client.post(
            "/login",
            data={"password": TEST_PASSWORD},
            follow_redirects=False,
        )
        assert response.status_code == 303
        yield test_client


def wait_for_status(client: TestClient, job_id: str, expected: str, timeout: float = 20.0) -> dict:
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        response = client.get(f"/api/jobs/{job_id}")
        assert response.status_code == 200
        job = response.json()["job"]
        last = job
        if job["status"] == expected:
            return job
        if job["status"] in {"error", "cancelled"} and expected not in {"error", "cancelled"}:
            raise AssertionError(f"Job terminou como {job['status']}: {job['error']}")
        time.sleep(0.25)
    raise AssertionError(f"Tempo esgotado esperando {expected}. Último estado: {last}")


def test_public_pages_and_login(anon_client: TestClient) -> None:
    health = anon_client.get("/healthz")
    assert health.status_code == 200
    assert health.json()["dry_run"] is True
    assert health.json()["max_upload_mb"] == 1

    assert anon_client.get("/robots.txt").status_code == 200

    root = anon_client.get("/", follow_redirects=False)
    assert root.status_code == 303
    assert root.headers["location"] == "/login"

    login_page = anon_client.get("/login")
    assert login_page.status_code == 200
    assert "Senha de acesso" in login_page.text

    wrong = anon_client.post(
        "/login",
        data={"password": "senha-errada"},
        follow_redirects=False,
    )
    assert wrong.status_code == 401

    good = anon_client.post(
        "/login",
        data={"password": TEST_PASSWORD},
        follow_redirects=False,
    )
    assert good.status_code == 303
    assert good.headers["location"] == "/"

    home = anon_client.get("/")
    assert home.status_code == 200
    assert 'id="root"' in home.text
    assert "/static/ui/" in home.text
    assert "fonts.googleapis.com" in home.headers["content-security-policy"]

    script = home.text.split('src="', 1)[1].split('"', 1)[0]
    asset = anon_client.get(script)
    assert asset.status_code == 200
    assert "javascript" in asset.headers["content-type"]


def test_api_requires_login(anon_client: TestClient) -> None:
    assert anon_client.get("/api/jobs").status_code == 401
    assert anon_client.get("/api/accounts").status_code == 401
    assert anon_client.get("/api/jobs/nao-existe").status_code == 401
    assert anon_client.delete("/api/accounts/a@b.com").status_code == 401
    assert anon_client.delete("/api/history").status_code == 401


def test_upload_dry_run_and_history(client: TestClient) -> None:
    response = client.post(
        "/api/jobs",
        files={"file": ("../../foto de teste.jpg", JPEG_BYTES, "image/jpeg")},
        data={"last_modified": "1700000000000"},
    )
    assert response.status_code == 201, response.text
    job = response.json()["job"]
    assert job["status"] == "queued"
    assert job["original_name"] == "foto de teste.jpg"

    done = wait_for_status(client, job["id"], "success")
    assert done["media_key"] == "DRY_RUN"
    assert done["attempts"] == 0

    job_dir = TEST_DATA_DIR / "tmp" / job["id"]
    assert not job_dir.exists(), "a pasta temporária deveria ter sido apagada"

    listing = client.get("/api/jobs").json()
    assert any(item["id"] == job["id"] for item in listing["jobs"])
    assert listing["stats"]["uploaded"] >= 1
    assert listing["stats"]["total"] >= 1
    assert listing["server"]["dry_run"] is True


def test_reject_unsupported_extension(client: TestClient) -> None:
    response = client.post(
        "/api/jobs",
        files={"file": ("nota.txt", b"texto", "text/plain")},
        data={"last_modified": "0"},
    )
    assert response.status_code == 400
    assert "Formato não suportado" in response.json()["detail"]


def test_reject_oversized_upload(client: TestClient) -> None:
    big = b"\xff\xd8\xff\xe0" + (b"x" * (4 * 1024 * 1024))
    response = client.post(
        "/api/jobs",
        files={"file": ("grande.jpg", big, "image/jpeg")},
        data={"last_modified": "0"},
    )
    assert response.status_code == 413


def test_cancel_only_queued_jobs(client: TestClient) -> None:
    assert client.delete("/api/jobs/nao-existe").status_code == 404

    response = client.post(
        "/api/jobs",
        files={"file": ("cancelar.jpg", JPEG_BYTES, "image/jpeg")},
        data={"last_modified": "0"},
    )
    assert response.status_code == 201
    job_id = response.json()["job"]["id"]

    wait_for_status(client, job_id, "success")
    denied = client.delete(f"/api/jobs/{job_id}")
    assert denied.status_code == 409


def test_history_delete_and_clear(client: TestClient) -> None:
    response = client.post(
        "/api/jobs",
        files={"file": ("historico.jpg", JPEG_BYTES, "image/jpeg")},
        data={"last_modified": "0"},
    )
    assert response.status_code == 201
    job_id = response.json()["job"]["id"]
    wait_for_status(client, job_id, "success")

    removed = client.delete(f"/api/history/{job_id}")
    assert removed.status_code == 200
    assert client.get(f"/api/jobs/{job_id}").status_code == 404

    cleared = client.delete("/api/history")
    assert cleared.status_code == 200
    assert cleared.json()["deleted"] >= 1
    assert client.get("/api/jobs").json()["jobs"] == []


def test_active_jobs_are_listed_even_with_small_limit(client: TestClient) -> None:
    ids: list[str] = []
    now = db.utc_now()
    with db.get_conn() as conn:
        for index in range(3):
            job_id = uuid.uuid4().hex
            temp_file = TEST_DATA_DIR / "tmp" / job_id / "pausado.jpg"
            temp_file.parent.mkdir(parents=True, exist_ok=True)
            temp_file.write_bytes(JPEG_BYTES)
            conn.execute(
                """
                INSERT INTO jobs (
                    id, original_name, temp_path, size, mtime, status,
                    attempts, media_key, error, account, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 'paused', 0, NULL, NULL, NULL, ?, ?)
                """,
                (
                    job_id,
                    f"pausado-{index}.jpg",
                    str(temp_file),
                    len(JPEG_BYTES),
                    time.time(),
                    now,
                    now,
                ),
            )
            ids.append(job_id)

    try:
        listing = client.get("/api/jobs?limit=1").json()
        returned = {job["id"] for job in listing["jobs"]}
        assert set(ids) <= returned, "jobs ativos não podem sumir por causa do limite"
    finally:
        with db.get_conn() as conn:
            conn.executemany("DELETE FROM jobs WHERE id = ?", [(job_id,) for job_id in ids])
        for job_id in ids:
            shutil.rmtree(TEST_DATA_DIR / "tmp" / job_id, ignore_errors=True)


def test_retry_failed_job_keeps_temp_file(client: TestClient) -> None:
    job_id = uuid.uuid4().hex
    job_dir = TEST_DATA_DIR / "tmp" / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    temp_file = job_dir / "retry.jpg"
    temp_file.write_bytes(JPEG_BYTES)

    now = db.utc_now()
    with db.get_conn() as conn:
        conn.execute(
            """
            INSERT INTO jobs (
                id, original_name, temp_path, size, mtime, status,
                attempts, media_key, error, account, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'error', 1, NULL, ?, NULL, ?, ?)
            """,
            (
                job_id,
                "retry.jpg",
                str(temp_file),
                len(JPEG_BYTES),
                time.time(),
                "falha simulada",
                now,
                now,
            ),
        )

    job = client.get(f"/api/jobs/{job_id}").json()["job"]
    assert job["status"] == "error"
    assert job["retryable"] is True
    assert temp_file.is_file(), "o arquivo com falha deve ser mantido para reenvio"

    retried = client.post(f"/api/jobs/{job_id}/retry")
    assert retried.status_code == 200, retried.text
    done = wait_for_status(client, job_id, "success")
    assert done["media_key"] == "DRY_RUN"
    assert not job_dir.exists()


def test_retry_successful_job_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/jobs",
        files={"file": ("novamente.jpg", JPEG_BYTES, "image/jpeg")},
        data={"last_modified": "0"},
    )
    assert response.status_code == 201
    job_id = response.json()["job"]["id"]
    wait_for_status(client, job_id, "success")
    retried = client.post(f"/api/jobs/{job_id}/retry")
    assert retried.status_code == 409


def _proc(stdout: str, returncode: int = 0, stderr: str = "") -> CompletedProcess[str]:
    return CompletedProcess(args=[], returncode=returncode, stdout=stdout, stderr=stderr)


def test_parse_upload_success() -> None:
    summary = {
        "total": 1,
        "succeeded": 1,
        "failed": 0,
        "skipped": 0,
        "results": [
            {"path": "C:\\tmp\\foto.jpg", "success": True, "mediaKey": "media-123"}
        ],
    }
    result = _parse_upload_output(_proc(json.dumps(summary)), Path("foto.jpg"))
    assert result.ok is True
    assert result.media_key == "media-123"
    assert result.skipped is False


def test_parse_skipped_duplicate_is_success() -> None:
    summary = {
        "total": 1,
        "succeeded": 0,
        "failed": 0,
        "skipped": 1,
        "results": [
            {
                "path": "foto.jpg",
                "success": False,
                "skipped": True,
                "skipCode": "already-uploaded",
                "skipReason": "file already exists in library",
            }
        ],
    }
    result = _parse_upload_output(
        _proc(json.dumps(summary)), Path("foto.jpg")
    )
    assert result.ok is True
    assert result.skipped is True


def test_parse_upload_failure_and_auth() -> None:
    failure = {
        "total": 1,
        "succeeded": 0,
        "failed": 1,
        "results": [
            {"path": "foto.jpg", "success": False, "error": "upload failed"}
        ],
    }
    result = _parse_upload_output(
        _proc(json.dumps(failure), returncode=1), Path("foto.jpg")
    )
    assert result.ok is False
    assert result.auth_error is False

    auth_failure = {
        "total": 1,
        "succeeded": 0,
        "failed": 1,
        "results": [
            {
                "path": "foto.jpg",
                "success": False,
                "error": "BadAuthentication: token expired",
            }
        ],
    }
    result = _parse_upload_output(
        _proc(json.dumps(auth_failure), returncode=1), Path("foto.jpg")
    )
    assert result.ok is False
    assert result.auth_error is True

"""Banco SQLite simples para a fila e o histórico."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from . import config


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(config.DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    config.ensure_dirs()
    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                id            TEXT PRIMARY KEY,
                original_name TEXT NOT NULL,
                temp_path     TEXT NOT NULL,
                size          INTEGER NOT NULL DEFAULT 0,
                mtime         REAL,
                status        TEXT NOT NULL DEFAULT 'queued',
                attempts      INTEGER NOT NULL DEFAULT 0,
                media_key     TEXT,
                error         TEXT,
                account       TEXT,
                created_at    TEXT NOT NULL,
                updated_at    TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_jobs_status  ON jobs(status);
            CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);
            """
        )


def create_job(
    *,
    job_id: str,
    original_name: str,
    temp_path: str,
    size: int,
    mtime: float | None,
    account: str | None,
) -> dict[str, Any]:
    now = utc_now()
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO jobs (
                id, original_name, temp_path, size, mtime, status,
                attempts, media_key, error, account, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'queued', 0, NULL, NULL, ?, ?, ?)
            """,
            (job_id, original_name, temp_path, size, mtime, account, now, now),
        )
    return get_job(job_id)  # type: ignore[return-value]


def get_job(job_id: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    return dict(row) if row else None


def list_jobs(limit: int = 50) -> list[dict[str, Any]]:
    """Todos os jobs ativos + os últimos jobs finalizados.

    Uma fila grande pode ter centenas de arquivos. Limitar a consulta por
    linhas esconderia jobs ativos e a interface nunca saberia que terminaram.
    """
    limit = max(1, min(200, int(limit)))
    with get_conn() as conn:
        active = conn.execute(
            """
            SELECT * FROM jobs
            WHERE status IN ('queued', 'uploading', 'paused')
            ORDER BY created_at ASC, rowid ASC
            """
        ).fetchall()
        terminal = conn.execute(
            """
            SELECT * FROM jobs
            WHERE status IN ('success', 'error', 'cancelled')
            ORDER BY updated_at DESC, rowid DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [dict(row) for row in active] + [dict(row) for row in terminal]


def claim_next_job() -> dict[str, Any] | None:
    """Pega o próximo job da fila de forma atômica."""
    with get_conn() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            """
            SELECT * FROM jobs
            WHERE status = 'queued'
            ORDER BY created_at ASC, rowid ASC
            LIMIT 1
            """
        ).fetchone()
        if not row:
            return None
        conn.execute(
            "UPDATE jobs SET status = 'uploading', updated_at = ? WHERE id = ?",
            (utc_now(), row["id"]),
        )
        job = dict(row)
        job["status"] = "uploading"
        return job


def set_attempts(job_id: str, attempts: int) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE jobs SET attempts = ?, updated_at = ? WHERE id = ?",
            (attempts, utc_now(), job_id),
        )


def mark_success(job_id: str, media_key: str | None, account: str | None = None) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE jobs
            SET status = 'success', media_key = ?, error = NULL,
                account = COALESCE(?, account), updated_at = ?
            WHERE id = ?
            """,
            (media_key, account, utc_now(), job_id),
        )


def mark_error(job_id: str, error: str) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE jobs SET status = 'error', error = ?, updated_at = ? WHERE id = ?",
            ((error or "Falha no upload")[:1000], utc_now(), job_id),
        )


def cancel_job(job_id: str) -> bool:
    with get_conn() as conn:
        cursor = conn.execute(
            """
            UPDATE jobs SET status = 'cancelled', updated_at = ?
            WHERE id = ? AND status IN ('queued', 'paused')
            """,
            (utc_now(), job_id),
        )
        return cursor.rowcount > 0


def pause_job(job_id: str) -> bool:
    with get_conn() as conn:
        cursor = conn.execute(
            """
            UPDATE jobs SET status = 'paused', updated_at = ?
            WHERE id = ? AND status = 'queued'
            """,
            (utc_now(), job_id),
        )
        return cursor.rowcount > 0


def resume_job(job_id: str) -> bool:
    with get_conn() as conn:
        cursor = conn.execute(
            """
            UPDATE jobs SET status = 'queued', updated_at = ?
            WHERE id = ? AND status = 'paused'
            """,
            (utc_now(), job_id),
        )
        return cursor.rowcount > 0


def retry_job(job_id: str, account: str | None = None) -> bool:
    with get_conn() as conn:
        cursor = conn.execute(
            """
            UPDATE jobs
            SET status = 'queued', attempts = 0, error = NULL,
                account = COALESCE(?, account), updated_at = ?
            WHERE id = ? AND status IN ('error', 'cancelled')
            """,
            (account, utc_now(), job_id),
        )
        return cursor.rowcount > 0


def delete_job(job_id: str) -> bool:
    """Apaga o registro de um job já terminado."""
    with get_conn() as conn:
        cursor = conn.execute(
            "DELETE FROM jobs WHERE id = ? AND status IN ('success', 'error', 'cancelled')",
            (job_id,),
        )
        return cursor.rowcount > 0


def delete_terminal_jobs() -> list[dict[str, Any]]:
    """Apaga todo o histórico terminado e devolve os registros removidos."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM jobs WHERE status IN ('success', 'error', 'cancelled')"
        ).fetchall()
        conn.execute(
            "DELETE FROM jobs WHERE status IN ('success', 'error', 'cancelled')"
        )
    return [dict(row) for row in rows]


def reassign_pending_jobs(old_account: str, new_account: str) -> None:
    """Move jobs que ainda não começaram para a nova conta ativa."""
    if not old_account or not new_account or old_account == new_account:
        return
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE jobs SET account = ?, updated_at = ?
            WHERE account = ? AND status IN ('queued', 'paused')
            """,
            (new_account, utc_now(), old_account),
        )


def reset_stuck_jobs() -> int:
    """Jobs que estavam subindo quando o app caiu voltam para a fila."""
    with get_conn() as conn:
        cursor = conn.execute(
            "UPDATE jobs SET status = 'queued', updated_at = ? WHERE status = 'uploading'",
            (utc_now(),),
        )
        return cursor.rowcount


def stats() -> dict[str, int]:
    counts = {
        "uploaded": 0,
        "pending": 0,
        "paused": 0,
        "errors": 0,
        "cancelled": 0,
        "total": 0,
    }
    with get_conn() as conn:
        rows = conn.execute("SELECT status, COUNT(*) AS n FROM jobs GROUP BY status").fetchall()
    for row in rows:
        status, count = row["status"], int(row["n"])
        counts["total"] += count
        if status == "success":
            counts["uploaded"] += count
        elif status in {"queued", "uploading"}:
            counts["pending"] += count
        elif status == "paused":
            counts["paused"] += count
        elif status == "error":
            counts["errors"] += count
        elif status == "cancelled":
            counts["cancelled"] += count
    return counts


def active_temp_paths() -> set[str]:
    """Arquivos que ainda podem ser usados pelo worker ou por um retry."""
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT temp_path FROM jobs
            WHERE status IN ('queued', 'uploading', 'paused', 'error')
            """
        ).fetchall()
    return {str(row["temp_path"]) for row in rows}


def public_job(job: dict[str, Any]) -> dict[str, Any]:
    """Remove campos internos antes de devolver para a API."""
    temp_path = Path(str(job.get("temp_path") or ""))
    retryable = job["status"] in {"error", "cancelled"} and temp_path.is_file()
    return {
        "id": job["id"],
        "original_name": job["original_name"],
        "size": job["size"],
        "status": job["status"],
        "attempts": job["attempts"],
        "media_key": job.get("media_key"),
        "error": job.get("error"),
        "account": job.get("account"),
        "created_at": job["created_at"],
        "updated_at": job["updated_at"],
        "retryable": retryable,
    }

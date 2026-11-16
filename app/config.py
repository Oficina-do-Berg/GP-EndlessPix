"""Configuração central do GP-EndlessPix."""

from __future__ import annotations

import hashlib
import os
import secrets
import shutil
import sys
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on", "sim"}


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _resolve_path(name: str, default: Path) -> Path:
    raw = os.getenv(name)
    path = Path(raw).expanduser() if raw else default
    if not path.is_absolute():
        path = BASE_DIR / path
    return path.resolve()


DATA_DIR = _resolve_path("DATA_DIR", BASE_DIR / "data")
TMP_DIR = _resolve_path("TMP_DIR", DATA_DIR / "tmp")
DB_PATH = _resolve_path("DB_PATH", DATA_DIR / "app.db")
GOTOHP_CONFIG = _resolve_path("GOTOHP_CONFIG", DATA_DIR / "gotohp.config")


def _load_secret_key() -> str:
    """Usa SECRET_KEY do ambiente ou uma chave persistida em data/secret.key."""
    raw = os.getenv("SECRET_KEY", "").strip()
    if raw:
        return raw

    secret_file = DATA_DIR / "secret.key"
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        if secret_file.is_file():
            stored = secret_file.read_text(encoding="utf-8").strip()
            if stored:
                return stored
        generated = secrets.token_hex(32)
        secret_file.write_text(generated, encoding="utf-8")
        try:
            os.chmod(secret_file, 0o600)
        except OSError:
            pass
        return generated
    except OSError:
        return secrets.token_hex(32)


APP_PASSWORD = os.getenv("APP_PASSWORD", "")
SECRET_KEY = _load_secret_key()
COOKIE_SECURE = _env_bool("COOKIE_SECURE", False)

MAX_UPLOAD_MB = max(1, _env_int("MAX_UPLOAD_MB", 4096))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
UPLOAD_TIMEOUT_SEC = max(60, _env_int("UPLOAD_TIMEOUT_SEC", 7200))
MAX_RETRIES = max(1, min(10, _env_int("MAX_RETRIES", 3)))

DRY_RUN = _env_bool("DRY_RUN", False)
VERIFY_BINARY = _env_bool("VERIFY_BINARY", True)
GOTOHP_PROXY = os.getenv("GOTOHP_PROXY", "").strip()

ALLOWED_EXTENSIONS = {
    ".avif", ".bmp", ".gif", ".heic", ".heif", ".ico", ".jpeg", ".jpg",
    ".png", ".tif", ".tiff", ".webp",
    ".cr2", ".cr3", ".nef", ".arw", ".orf", ".raf", ".rw2", ".pef", ".sr2", ".dng",
    ".3gp", ".3g2", ".asf", ".avi", ".divx", ".m2t", ".m2ts", ".m4v", ".mkv",
    ".mmv", ".mod", ".mov", ".mp4", ".mpeg", ".mpg", ".mts", ".tod", ".ts",
    ".webm", ".wmv",
}

TRUSTED_HASHES = {
    "gotohp-cli-x64.exe": "c272a285a03aeea02a909f0b74d36f84c4a29c235c8dee47f7de75c83f15d2b1",
    "gotohp-x64.exe": "5c3f757b9e6b2ffd83934b59274136cf4e67c000265e2eaaa4f34dca6a821088",
    "gotohp-cli_amd64": "945021d5dbc36a96f53121eb4f907ace39d9457cea1b43107ed1986441b29030",
    "gotohp-cli-macos-universal": "d697e23c648881cf5e7db7b93f815f6d3dcbd9d7718a40d0edffee90456b0557",
}


def _find_gotohp_binary() -> Path | None:
    """Procura o binário do gotohp no projeto, no PATH ou via GOTOHP_BIN."""
    env_value = os.getenv("GOTOHP_BIN", "").strip()
    if env_value:
        candidate = Path(env_value).expanduser()
        if not candidate.is_absolute():
            candidate = BASE_DIR / candidate
        if candidate.is_file():
            return candidate.resolve()

    names = (
        ["gotohp-cli-x64.exe", "gotohp-cli.exe", "gotohp-cli"]
        if sys.platform == "win32"
        else ["gotohp-cli_amd64", "gotohp-cli_arm64", "gotohp-cli"]
    )
    for name in names:
        for candidate in (BASE_DIR / "bin" / name, BASE_DIR / name):
            if candidate.is_file():
                return candidate.resolve()

    for name in ("gotohp-cli", "gotohp-cli_amd64", "gotohp-cli_arm64"):
        found = shutil.which(name)
        if found:
            return Path(found).resolve()
    return None


GOTOHP_BIN = _find_gotohp_binary()


def ensure_dirs() -> None:
    """Cria as pastas de dados e temporárias."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(DATA_DIR, 0o700)
    except OSError:
        pass


def verify_binary(path: Path | None = None) -> tuple[bool, str]:
    """Confere o SHA-256 de binários conhecidos. Retorna (ok, mensagem)."""
    path = path or GOTOHP_BIN
    if path is None:
        return False, "Binário do gotohp não encontrado."
    if not path.is_file():
        return False, f"Binário não encontrado: {path}"

    expected = TRUSTED_HASHES.get(path.name)
    if not expected:
        return True, "Sem hash conhecido para este nome; verificação ignorada."

    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    actual = digest.hexdigest()
    if actual != expected:
        return False, (
            "A verificação de integridade do gotohp falhou. "
            f"Esperado {expected}, encontrado {actual}."
        )
    return True, "Binário verificado."

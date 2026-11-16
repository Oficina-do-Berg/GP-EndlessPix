"""Integração com o binário gotohp-cli."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import config


@dataclass
class CommandResult:
    ok: bool
    output: str
    error: str
    returncode: int


@dataclass
class UploadResult:
    ok: bool
    media_key: str | None = None
    error: str | None = None
    skipped: bool = False
    auth_error: bool = False
    returncode: int = -1


def _creation_flags() -> int:
    if sys.platform == "win32":
        return getattr(subprocess, "CREATE_NO_WINDOW", 0)
    return 0


def _base_command() -> list[str]:
    if not config.GOTOHP_BIN:
        raise FileNotFoundError(
            "Binário do gotohp não encontrado. Coloque o gotohp-cli em bin/ "
            "ou defina GOTOHP_BIN."
        )
    return [
        str(config.GOTOHP_BIN),
        "--config",
        str(config.GOTOHP_CONFIG),
    ]


def run(args: list[str], *, input_text: str | None = None, timeout: int = 60) -> subprocess.CompletedProcess[str]:
    """Executa o gotohp com o config do app."""
    config.ensure_dirs()
    command = _base_command() + args
    return subprocess.run(
        command,
        input=input_text,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        cwd=str(config.BASE_DIR),
        creationflags=_creation_flags(),
        check=False,
    )


def _combined(proc: subprocess.CompletedProcess[str]) -> str:
    return "\n".join(part for part in (proc.stdout, proc.stderr) if part).strip()


def _auth_error(text: str) -> bool:
    lowered = (text or "").lower()
    markers = (
        "badauthentication",
        "needsbrowser",
        "missingdroidguard",
        "oauth_token",
        "no credentials",
        "unauthorized",
        "invalid credential",
        "credentials not found",
        "http 401",
        "status 401",
        "signing in with oauth",
    )
    return any(marker in lowered for marker in markers)


def list_accounts() -> tuple[list[dict[str, Any]], str | None]:
    """Retorna contas do gotohp e a conta ativa."""
    if config.DRY_RUN:
        return [], None
    try:
        proc = run(["creds", "list"], timeout=30)
    except FileNotFoundError as exc:
        return [], str(exc)
    except subprocess.TimeoutExpired:
        return [], "Tempo esgotado ao consultar as contas."

    text = _combined(proc)
    if "no credentials found" in text.lower():
        return [], None

    accounts: list[dict[str, Any]] = []
    seen: set[str] = set()
    for line in (proc.stdout or "").splitlines():
        cleaned = line.strip()
        if "@" not in cleaned:
            continue
        active = "*" in cleaned
        email = cleaned.replace("*", "").strip().split()[0]
        if email and email.lower() not in seen:
            seen.add(email.lower())
            accounts.append({"email": email, "active": active})

    if not accounts and proc.returncode != 0:
        return [], text[:800] or "Não foi possível listar as contas."
    return accounts, None


def active_account() -> str | None:
    accounts, _ = list_accounts()
    for account in accounts:
        if account.get("active"):
            return str(account["email"])
    return accounts[0]["email"] if accounts else None


def add_account(token: str) -> tuple[bool, str, str | None]:
    """Troca o cookie oauth_token por credenciais e salva no config."""
    token = (token or "").strip()
    if token.lower().startswith("oauth_token="):
        token = token[len("oauth_token="):].strip()
    if len(token) < 16 or len(token) > 8192 or "\n" in token or "\r" in token:
        return False, "Token inválido. Cole apenas o valor do cookie oauth_token.", None

    before, _ = list_accounts()
    before_emails = {str(item["email"]).lower() for item in before}

    args = ["creds", "add"]
    if config.GOTOHP_PROXY:
        args += ["--proxy", config.GOTOHP_PROXY]
    args.append("-")

    try:
        proc = run(args, input_text=token + "\n", timeout=90)
    except FileNotFoundError as exc:
        return False, str(exc), None
    except subprocess.TimeoutExpired:
        return False, "Tempo esgotado ao conectar a conta no Google.", None

    output = _combined(proc)
    safe_output = output.replace(token, "***")[:1000]
    if proc.returncode != 0:
        return False, safe_output or "O Google recusou a conexão. Gere um token novo.", None

    try:
        os.chmod(config.GOTOHP_CONFIG, 0o600)
    except OSError:
        pass

    accounts, _ = list_accounts()
    email = next(
        (
            item["email"]
            for item in accounts
            if str(item["email"]).lower() not in before_emails
        ),
        None,
    )
    if not email:
        email = next((item["email"] for item in accounts if item.get("active")), None)
    if not email:
        match = re.search(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", output)
        if match:
            email = match.group(0)

    if email:
        current = next(
            (item for item in accounts if str(item["email"]).lower() == email.lower()),
            None,
        )
        if current is not None and not current.get("active"):
            select_account(email)

    return True, safe_output or "Conta conectada.", email


def remove_account(email: str) -> tuple[bool, str]:
    """Remove uma credencial salva no config do gotohp."""
    email = (email or "").strip()
    if not email or "@" not in email:
        return False, "Informe um e-mail válido."
    try:
        proc = run(["creds", "remove", email], timeout=30)
    except FileNotFoundError as exc:
        return False, str(exc)
    except subprocess.TimeoutExpired:
        return False, "Tempo esgotado ao remover a conta."
    output = _combined(proc)
    if proc.returncode != 0:
        return False, output[:800] or "Não foi possível remover a conta."
    return True, output[:800] or "Conta removida."


def select_account(email: str) -> tuple[bool, str]:
    email = (email or "").strip()
    if not email or "@" not in email:
        return False, "Informe um e-mail válido."
    try:
        proc = run(["creds", "set", email], timeout=30)
    except FileNotFoundError as exc:
        return False, str(exc)
    except subprocess.TimeoutExpired:
        return False, "Tempo esgotado ao trocar a conta."
    output = _combined(proc)
    if proc.returncode != 0:
        return False, output[:800] or "Não foi possível trocar a conta."
    return True, output[:800] or "Conta ativa alterada."


def _extract_error(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("error", "message", "detail"):
            if value.get(key):
                return str(value[key])
    return ""


def _find_result(data: dict[str, Any], path: Path) -> dict[str, Any] | None:
    results = data.get("results")
    if not isinstance(results, list) or not results:
        return None
    for item in results:
        if not isinstance(item, dict):
            continue
        item_path = Path(str(item.get("path") or ""))
        if item_path.name == path.name:
            return item
    return results[0] if len(results) == 1 and isinstance(results[0], dict) else None


def _parse_upload_output(proc: subprocess.CompletedProcess[str], path: Path) -> UploadResult:
    stdout = (proc.stdout or "").strip()
    stderr = (proc.stderr or "").strip()
    combined = "\n".join(part for part in (stdout, stderr) if part).strip()
    auth_error = _auth_error(combined)

    data: dict[str, Any] | None = None
    if stdout:
        try:
            parsed = json.loads(stdout)
            if isinstance(parsed, dict):
                data = parsed
        except json.JSONDecodeError:
            data = None

    if data is not None:
        result = _find_result(data, path)
        if result is None:
            if proc.returncode == 0:
                return UploadResult(
                    ok=False,
                    error="O gotohp não retornou resultado para o arquivo. "
                          "Ele pode ter sido ignorado pelo filtro de formato.",
                    auth_error=auth_error,
                    returncode=proc.returncode,
                )
        else:
            media_key = str(result.get("mediaKey") or "") or None
            skipped = bool(result.get("skipped"))
            success = bool(result.get("success"))
            error = _extract_error(result.get("error"))
            if skipped:
                # Duplicado já existente na biblioteca. O skipReason é
                # informativo, não é uma falha.
                return UploadResult(
                    ok=True,
                    media_key=media_key,
                    skipped=True,
                    returncode=proc.returncode,
                )
            if success and not error:
                return UploadResult(
                    ok=True,
                    media_key=media_key,
                    returncode=proc.returncode,
                )
            if media_key and not error:
                return UploadResult(
                    ok=True,
                    media_key=media_key,
                    returncode=proc.returncode,
                )
            return UploadResult(
                ok=False,
                error=error or "O gotohp não confirmou o upload.",
                auth_error=auth_error,
                returncode=proc.returncode,
            )

    media_key_match = re.search(r'"mediaKey"\s*:\s*"([^"]+)"', stdout)
    error_match = re.search(r'"error"\s*:\s*"([^"]+)"', stdout)
    success_flag = re.search(r'"success"\s*:\s*true', stdout) is not None
    skipped_flag = re.search(r'"skipped"\s*:\s*true', stdout) is not None

    media_key = media_key_match.group(1) if media_key_match else None
    error_text = error_match.group(1) if error_match else ""

    if proc.returncode == 0 and not error_text and (success_flag or media_key or skipped_flag):
        return UploadResult(
            ok=True,
            media_key=media_key,
            skipped=skipped_flag,
            returncode=proc.returncode,
        )

    fallback = error_text or stderr or stdout
    if not fallback:
        fallback = f"O gotohp terminou com código {proc.returncode} sem mensagem."
    return UploadResult(
        ok=False,
        error=fallback[:1000],
        auth_error=auth_error,
        returncode=proc.returncode,
    )


def upload_file(path: Path, account: str | None = None) -> UploadResult:
    """Sobe um arquivo e interpreta o JSON final do gotohp."""
    if not path.is_file():
        return UploadResult(ok=False, error="Arquivo temporário não encontrado.")

    args = ["upload", "--no-tui"]
    if config.GOTOHP_PROXY:
        args += ["--proxy", config.GOTOHP_PROXY]
    if account:
        args += ["--account", account]
    args.append(str(path))

    try:
        proc = run(args, timeout=config.UPLOAD_TIMEOUT_SEC)
    except FileNotFoundError as exc:
        return UploadResult(ok=False, error=str(exc))
    except subprocess.TimeoutExpired:
        return UploadResult(
            ok=False,
            error=f"Tempo esgotado após {config.UPLOAD_TIMEOUT_SEC}s. "
                  "Aumente UPLOAD_TIMEOUT_SEC se o arquivo for muito grande.",
        )
    return _parse_upload_output(proc, path)


def info() -> dict[str, Any]:
    """Informações para o /healthz e para a interface."""
    binary = config.GOTOHP_BIN
    binary_ok = bool(binary and binary.is_file())
    executable = bool(binary_ok and os.access(str(binary), os.X_OK)) if binary else False
    if sys.platform == "win32":
        executable = binary_ok
    config_exists = config.GOTOHP_CONFIG.is_file()
    return {
        "binary": str(binary) if binary else None,
        "binary_ok": binary_ok,
        "binary_executable": executable,
        "config_exists": config_exists,
        "dry_run": config.DRY_RUN,
    }

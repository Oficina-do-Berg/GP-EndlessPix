"""Worker que processa a fila e chama o gotohp."""

from __future__ import annotations

import logging
import shutil
import threading
from pathlib import Path
from typing import Any

from . import config, db, gotohp

log = logging.getLogger("photosweb.worker")


def cleanup_job_files(job: dict[str, Any]) -> None:
    """Apaga a pasta temporária do job, mas só dentro de TMP_DIR."""
    temp_path = Path(str(job.get("temp_path") or ""))
    try:
        parent = temp_path.resolve().parent
        tmp_root = config.TMP_DIR.resolve()
        if parent != tmp_root and tmp_root in parent.parents:
            shutil.rmtree(parent, ignore_errors=True)
    except OSError:
        log.warning("Não foi possível limpar os arquivos do job %s", job.get("id"))


def cleanup_orphan_temps() -> None:
    """Remove pastas temporárias que não pertencem a jobs ativos."""
    config.ensure_dirs()
    active_dirs = set()
    for temp_path in db.active_temp_paths():
        try:
            active_dirs.add(Path(temp_path).resolve().parent)
        except OSError:
            continue

    for entry in config.TMP_DIR.iterdir():
        if not entry.is_dir():
            continue
        try:
            resolved = entry.resolve()
        except OSError:
            continue
        if resolved not in active_dirs:
            shutil.rmtree(entry, ignore_errors=True)


class UploadWorker(threading.Thread):
    def __init__(self, stop_event: threading.Event) -> None:
        super().__init__(name="photosweb-upload-worker", daemon=True)
        self.stop_event = stop_event
        self.binary_error: str | None = None

    def run(self) -> None:
        log.info("Worker iniciado (dry_run=%s).", config.DRY_RUN)
        if config.VERIFY_BINARY and not config.DRY_RUN:
            ok, message = config.verify_binary()
            if not ok:
                self.binary_error = message
                log.error(message)

        while not self.stop_event.is_set():
            try:
                job = db.claim_next_job()
            except Exception:
                log.exception("Erro ao buscar job na fila")
                self.stop_event.wait(2)
                continue

            if not job:
                self.stop_event.wait(1)
                continue

            try:
                self.process(job)
            except Exception:
                log.exception("Erro inesperado no job %s", job.get("id"))
                db.mark_error(str(job.get("id")), "Erro interno ao processar o arquivo.")
                # O arquivo é mantido para permitir "Reenviar" pelo histórico.

        log.info("Worker encerrado.")

    def process(self, job: dict[str, Any]) -> None:
        job_id = str(job["id"])
        path = Path(str(job["temp_path"]))
        name = job.get("original_name") or path.name

        if not path.is_file():
            db.mark_error(job_id, "Arquivo temporário desapareceu antes do upload.")
            cleanup_job_files(job)
            return

        if config.DRY_RUN:
            log.info("[DRY_RUN] Simulando upload de %s", name)
            self.stop_event.wait(1.5)
            db.mark_success(job_id, "DRY_RUN", account=job.get("account") or "dry-run")
            log.info("[DRY_RUN] Concluído: %s", name)
            cleanup_job_files(job)
            return

        if self.binary_error:
            db.mark_error(job_id, self.binary_error)
            return

        if not config.GOTOHP_BIN:
            db.mark_error(job_id, "Binário do gotohp não encontrado no servidor.")
            return

        account = job.get("account") or gotohp.active_account()
        if not account:
            db.mark_error(job_id, "Nenhuma conta Google conectada. Conecte uma conta e tente de novo.")
            return

        attempts = int(job.get("attempts") or 0)
        last_error = "Falha desconhecida no upload."
        backoffs = [5, 20, 60, 120, 300]

        while attempts < config.MAX_RETRIES and not self.stop_event.is_set():
            attempts += 1
            db.set_attempts(job_id, attempts)
            log.info("Enviando %s (tentativa %s/%s) com a conta %s", name, attempts, config.MAX_RETRIES, account)
            result = gotohp.upload_file(path, account)

            if result.ok:
                db.mark_success(job_id, result.media_key, account=account)
                suffix = " (já existia no Google)" if result.skipped else ""
                log.info("Upload concluído: %s%s", name, suffix)
                cleanup_job_files(job)
                return

            last_error = result.error or "Falha no upload."
            log.warning("Falha em %s (tentativa %s): %s", name, attempts, last_error)

            if result.auth_error:
                last_error = (
                    "A conta Google recusou a credencial. Gere um novo oauth_token "
                    "e conecte a conta novamente. Detalhe: " + last_error
                )
                break

            if attempts < config.MAX_RETRIES:
                wait_seconds = backoffs[min(attempts - 1, len(backoffs) - 1)]
                log.info("Aguardando %ss antes de tentar de novo.", wait_seconds)
                self.stop_event.wait(wait_seconds)

        db.mark_error(job_id, last_error)
        log.error("Job %s marcado como erro: %s", job_id, last_error)
        log.info("Arquivo temporário mantido para permitir reenvio pelo histórico: %s", job_id)

"""Aplicação web do GP-EndlessPix."""

from __future__ import annotations

import logging
import os
import re
import secrets
import shutil
import sys
import threading
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import (
    FileResponse,
    HTMLResponse,
    JSONResponse,
    PlainTextResponse,
    RedirectResponse,
    Response,
)
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

from . import config, db, gotohp, worker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

log = logging.getLogger("photosweb")

BASE_DIR = config.BASE_DIR
TEMPLATES_DIR = BASE_DIR / "app" / "templates"
STATIC_DIR = BASE_DIR / "app" / "static"
UI_INDEX = STATIC_DIR / "ui" / "index.html"

templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


def is_authenticated(request: Request) -> bool:
    return bool(request.session.get("auth"))


def require_auth(request: Request) -> None:
    if not is_authenticated(request):
        raise HTTPException(status_code=401, detail="Não autenticado.")


class MaxBodyMiddleware:
    """Rejeita uploads acima do limite antes de ler o corpo."""

    def __init__(self, app):  # noqa: ANN001
        self.app = app

    async def __call__(self, scope, receive, send):  # noqa: ANN001
        if (
            scope["type"] == "http"
            and scope["method"] == "POST"
            and scope["path"] == "/api/jobs"
        ):
            headers = {key.lower(): value for key, value in scope.get("headers", [])}
            raw_length = headers.get(b"content-length")
            if raw_length:
                try:
                    length = int(raw_length)
                except ValueError:
                    length = 0
                if length > config.MAX_UPLOAD_BYTES + (2 * 1024 * 1024):
                    body = (
                        '{"detail":"Arquivo maior que o limite configurado '
                        f'({config.MAX_UPLOAD_MB} MB)."}}'
                    ).encode("utf-8")
                    await send(
                        {
                            "type": "http.response.start",
                            "status": 413,
                            "headers": [
                                (b"content-type", b"application/json; charset=utf-8"),
                                (b"content-length", str(len(body)).encode("ascii")),
                            ],
                        }
                    )
                    await send({"type": "http.response.body", "body": body})
                    return
        await self.app(scope, receive, send)


@asynccontextmanager
async def lifespan(app: FastAPI):
    config.ensure_dirs()
    if not config.APP_PASSWORD:
        raise RuntimeError(
            "APP_PASSWORD não configurada. Copie .env.example para .env e defina uma senha."
        )

    db.init_db()
    reset = db.reset_stuck_jobs()
    if reset:
        log.warning("%s job(s) que estavam subindo voltaram para a fila.", reset)
    worker.cleanup_orphan_temps()

    if not config.SECRET_KEY:
        log.warning("SECRET_KEY não definida; usando uma chave temporária.")
    ok, message = config.verify_binary()
    app.state.binary_verified = ok if config.VERIFY_BINARY else None
    if config.VERIFY_BINARY and not ok:
        log.error(message)
    elif config.GOTOHP_BIN:
        log.info("gotohp: %s", config.GOTOHP_BIN)
    else:
        log.warning("gotohp não encontrado. O envio ficará indisponível.")

    stop_event = threading.Event()
    upload_worker = worker.UploadWorker(stop_event)
    upload_worker.start()
    app.state.upload_worker = upload_worker
    app.state.stop_event = stop_event

    try:
        yield
    finally:
        stop_event.set()
        upload_worker.join(timeout=3)


app = FastAPI(
    title="GP-EndlessPix",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
app.add_middleware(
    SessionMiddleware,
    secret_key=config.SECRET_KEY,
    same_site="lax",
    https_only=config.COOKIE_SECURE,
    max_age=60 * 60 * 24 * 14,
)
app.add_middleware(MaxBodyMiddleware)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.middleware("http")
async def security_headers(request: Request, call_next):  # noqa: ANN001
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "script-src 'self'; "
        "img-src 'self' data: blob:; "
        "connect-src 'self'; "
        "form-action 'self'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'"
    )
    if request.url.path == "/" or request.url.path.startswith("/api/") or request.url.path == "/login":
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/healthz")
def healthz(request: Request) -> JSONResponse:
    info = gotohp.info()
    verified = getattr(request.app.state, "binary_verified", None)
    healthy = info["dry_run"] or (
        info["binary_ok"] and info["binary_executable"] and verified is not False
    )
    public_info = {key: value for key, value in info.items() if key != "binary"}
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={
            "status": "ok" if healthy else "degraded",
            **public_info,
            "binary_verified": verified,
            "password_configured": bool(config.APP_PASSWORD),
            "max_upload_mb": config.MAX_UPLOAD_MB,
        },
    )


@app.get("/robots.txt", response_class=PlainTextResponse)
def robots() -> str:
    return "User-agent: *\nDisallow: /\n"


@app.get("/favicon.ico")
def favicon() -> Response:
    return Response(status_code=204)


@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request, error: str | None = None):  # noqa: ANN201
    if is_authenticated(request):
        return RedirectResponse("/", status_code=303)
    return templates.TemplateResponse(request, "login.html", {"error": error})


@app.post("/login")
def login(request: Request, password: str = Form(...)):  # noqa: ANN201
    if not config.APP_PASSWORD:
        raise HTTPException(status_code=500, detail="APP_PASSWORD não configurada.")
    if not secrets.compare_digest(
        password.encode("utf-8"),
        config.APP_PASSWORD.encode("utf-8"),
    ):
        time.sleep(0.4)
        return templates.TemplateResponse(
            request,
            "login.html",
            {"error": "Senha incorreta."},
            status_code=401,
        )
    request.session.clear()
    request.session["auth"] = True
    return RedirectResponse("/", status_code=303)


@app.get("/logout")
def logout(request: Request):  # noqa: ANN201
    request.session.clear()
    return RedirectResponse("/login", status_code=303)


@app.get("/", response_class=HTMLResponse)
def index(request: Request):  # noqa: ANN201
    if not is_authenticated(request):
        return RedirectResponse("/login", status_code=303)
    if not UI_INDEX.is_file():
        return HTMLResponse(
            "A interface não foi compilada. Rode `npm install && npm run build` em ui/.",
            status_code=503,
        )
    return FileResponse(UI_INDEX, media_type="text/html; charset=utf-8")


@app.get("/api/accounts")
def api_accounts(request: Request, _: None = Depends(require_auth)) -> dict:
    if config.DRY_RUN:
        return {"accounts": [], "active": None, "error": None, "dry_run": True}
    accounts, error = gotohp.list_accounts()
    active = next((a["email"] for a in accounts if a.get("active")), None)
    if not active and accounts:
        active = accounts[0]["email"]
    return {
        "accounts": accounts,
        "active": active,
        "error": error,
        "dry_run": False,
    }


class TokenBody(BaseModel):
    token: str
    email: str | None = None


class EmailBody(BaseModel):
    email: str


@app.post("/api/accounts")
def api_add_account(
    body: TokenBody,
    request: Request,
    _: None = Depends(require_auth),
) -> dict:
    if config.DRY_RUN:
        raise HTTPException(status_code=400, detail="Modo de teste (DRY_RUN) ativo.")
    ok, message, email = gotohp.add_account(body.token)
    if not ok:
        raise HTTPException(status_code=400, detail=message)
    accounts, error = gotohp.list_accounts()
    active = next((a["email"] for a in accounts if a.get("active")), None)
    if not active and accounts:
        active = accounts[0]["email"]
    requested = (body.email or "").strip().lower()
    actual = (email or active or "").strip().lower()
    return {
        "ok": True,
        "message": message,
        "email": email or active,
        "requested_email": requested or None,
        "email_mismatch": bool(requested and actual and requested != actual),
        "accounts": accounts,
        "active": active,
        "error": error,
    }


@app.post("/api/accounts/select")
def api_select_account(
    body: EmailBody,
    request: Request,
    _: None = Depends(require_auth),
) -> dict:
    if config.DRY_RUN:
        raise HTTPException(status_code=400, detail="Modo de teste (DRY_RUN) ativo.")
    ok, message = gotohp.select_account(body.email)
    if not ok:
        raise HTTPException(status_code=400, detail=message)
    accounts, error = gotohp.list_accounts()
    active = next((a["email"] for a in accounts if a.get("active")), body.email)
    return {
        "ok": True,
        "message": message,
        "accounts": accounts,
        "active": active,
        "error": error,
    }


@app.delete("/api/accounts/{email}")
def api_remove_account(
    email: str,
    request: Request,
    _: None = Depends(require_auth),
) -> dict:
    if config.DRY_RUN:
        raise HTTPException(status_code=400, detail="Modo de teste (DRY_RUN) ativo.")
    ok, message = gotohp.remove_account(email)
    if not ok:
        raise HTTPException(status_code=400, detail=message)

    accounts, error = gotohp.list_accounts()
    active = next((a["email"] for a in accounts if a.get("active")), None)
    if accounts and not active:
        selected, select_message = gotohp.select_account(accounts[0]["email"])
        if selected:
            active = accounts[0]["email"]
            message = f"{message} {select_message}".strip()
        accounts, error = gotohp.list_accounts()
        active = next((a["email"] for a in accounts if a.get("active")), active)
    if active:
        db.reassign_pending_jobs(email, active)
    return {
        "ok": True,
        "message": message,
        "accounts": accounts,
        "active": active,
        "error": error,
    }


def safe_filename(raw: str) -> str:
    name = (raw or "").replace("\\", "/").split("/")[-1].strip()
    name = re.sub(r"[\x00-\x1f\x7f]", "", name)
    if sys.platform == "win32":
        name = re.sub(r'[<>:"|?*]', "_", name)
    name = name.strip().strip(".")
    if not name:
        name = "arquivo"
    stem, ext = os.path.splitext(name)
    reserved = {"CON", "PRN", "AUX", "NUL"}
    reserved.update(f"COM{i}" for i in range(1, 10))
    reserved.update(f"LPT{i}" for i in range(1, 10))
    if stem.upper() in reserved:
        name = f"_{name}"
    if len(name) > 180:
        stem, ext = os.path.splitext(name)
        name = stem[:160] + ext
    return name


@app.get("/api/jobs")
def api_jobs(
    request: Request,
    limit: int = 50,
    _: None = Depends(require_auth),
) -> dict:
    jobs = [db.public_job(job) for job in db.list_jobs(limit)]
    server = gotohp.info()
    server["max_upload_mb"] = config.MAX_UPLOAD_MB
    return {"jobs": jobs, "stats": db.stats(), "server": server}


@app.get("/api/jobs/{job_id}")
def api_job(job_id: str, request: Request, _: None = Depends(require_auth)) -> dict:
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Envio não encontrado.")
    return {"job": db.public_job(job)}


def _check_content_length(request: Request) -> None:
    raw = request.headers.get("content-length")
    if not raw:
        return
    try:
        length = int(raw)
    except ValueError:
        return
    if length > config.MAX_UPLOAD_BYTES + (2 * 1024 * 1024):
        raise HTTPException(
            status_code=413,
            detail=f"Arquivo maior que o limite de {config.MAX_UPLOAD_MB} MB.",
        )


@app.post("/api/jobs", status_code=201)
def api_create_job(
    request: Request,
    file: UploadFile = File(...),
    last_modified: int = Form(0),
    _: None = Depends(require_auth),
) -> JSONResponse:
    _check_content_length(request)

    original = safe_filename(file.filename or "arquivo")
    extension = Path(original).suffix.lower()
    if extension not in config.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Formato não suportado: {extension or 'sem extensão'}.",
        )

    if file.size is not None and file.size > config.MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Arquivo maior que o limite de {config.MAX_UPLOAD_MB} MB.",
        )

    account: str | None = None
    if not config.DRY_RUN:
        if not config.GOTOHP_BIN:
            raise HTTPException(status_code=503, detail="Binário do gotohp não encontrado no servidor.")
        accounts, error = gotohp.list_accounts()
        if error:
            raise HTTPException(status_code=503, detail=error)
        account = next((a["email"] for a in accounts if a.get("active")), None)
        if not account and accounts:
            account = accounts[0]["email"]
        if not account:
            raise HTTPException(
                status_code=400,
                detail="Nenhuma conta Google conectada. Conecte uma conta antes de enviar.",
            )

    config.ensure_dirs()
    expected_size = file.size
    if expected_size is None:
        raw_length = request.headers.get("content-length")
        try:
            expected_size = int(raw_length) if raw_length else 0
        except ValueError:
            expected_size = 0
    # O parser multipart grava o arquivo em um temporário antes de copiá-lo para
    # TMP_DIR, então o pico de disco é aproximadamente o dobro do arquivo.
    needed = (2 * expected_size) + (256 * 1024 * 1024)
    free = shutil.disk_usage(config.TMP_DIR).free
    if free < needed:
        raise HTTPException(
            status_code=507,
            detail=(
                "Espaço insuficiente no servidor para receber o arquivo. "
                f"Livre: {free // (1024 * 1024)} MB."
            ),
        )

    job_id = uuid.uuid4().hex
    job_dir = config.TMP_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=False)
    destination = job_dir / original

    try:
        file.file.seek(0)
        with destination.open("wb") as output:
            shutil.copyfileobj(file.file, output, length=1024 * 1024)

        size = destination.stat().st_size
        if size <= 0:
            raise HTTPException(status_code=400, detail="Arquivo vazio.")
        if size > config.MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Arquivo maior que o limite de {config.MAX_UPLOAD_MB} MB.",
            )

        mtime: float | None = None
        if last_modified and last_modified > 0:
            candidate = last_modified / 1000.0
            if 631152000 <= candidate <= time.time() + (2 * 86400):
                mtime = candidate
        if mtime is None:
            mtime = time.time()
        try:
            os.utime(destination, (mtime, mtime))
        except OSError:
            pass

        job = db.create_job(
            job_id=job_id,
            original_name=original,
            temp_path=str(destination),
            size=size,
            mtime=mtime,
            account=account,
        )
    except HTTPException:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    except Exception as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        log.exception("Falha ao receber o arquivo %s", original)
        raise HTTPException(status_code=500, detail="Falha ao salvar o arquivo no servidor.") from exc

    log.info("Job %s criado: %s (%s bytes)", job_id, original, size)
    return JSONResponse(status_code=201, content={"ok": True, "job": db.public_job(job)})


@app.delete("/api/jobs/{job_id}")
def api_cancel_job(job_id: str, request: Request, _: None = Depends(require_auth)) -> dict:
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Envio não encontrado.")
    if job["status"] not in {"queued", "paused"}:
        raise HTTPException(
            status_code=409,
            detail="Só é possível cancelar arquivos que ainda estão na fila.",
        )
    if not db.cancel_job(job_id):
        raise HTTPException(status_code=409, detail="O envio já saiu da fila.")
    worker.cleanup_job_files(job)
    return {"ok": True}


@app.post("/api/jobs/{job_id}/pause")
def api_pause_job(job_id: str, request: Request, _: None = Depends(require_auth)) -> dict:
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Envio não encontrado.")
    if not db.pause_job(job_id):
        raise HTTPException(
            status_code=409,
            detail="O envio já começou e não pode ser pausado.",
        )
    return {"ok": True, "job": db.public_job(db.get_job(job_id))}


@app.post("/api/jobs/{job_id}/resume")
def api_resume_job(job_id: str, request: Request, _: None = Depends(require_auth)) -> dict:
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Envio não encontrado.")
    if not db.resume_job(job_id):
        raise HTTPException(status_code=409, detail="O envio não está pausado.")
    return {"ok": True, "job": db.public_job(db.get_job(job_id))}


@app.post("/api/jobs/{job_id}/retry")
def api_retry_job(job_id: str, request: Request, _: None = Depends(require_auth)) -> dict:
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Envio não encontrado.")
    if job["status"] not in {"error", "cancelled"}:
        raise HTTPException(status_code=409, detail="Este envio não pode ser reenviado.")
    if not Path(str(job.get("temp_path") or "")).is_file():
        raise HTTPException(
            status_code=409,
            detail="O arquivo temporário não está mais disponível.",
        )

    account = "dry-run" if config.DRY_RUN else gotohp.active_account()
    if not account:
        raise HTTPException(
            status_code=400,
            detail="Nenhuma conta Google conectada. Conecte uma conta antes de reenviar.",
        )
    if not db.retry_job(job_id, account):
        raise HTTPException(status_code=409, detail="Este envio não pode ser reenviado.")
    return {"ok": True, "job": db.public_job(db.get_job(job_id))}


@app.delete("/api/history/{job_id}")
def api_delete_history_item(
    job_id: str,
    request: Request,
    _: None = Depends(require_auth),
) -> dict:
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Envio não encontrado.")
    if job["status"] not in {"success", "error", "cancelled"}:
        raise HTTPException(
            status_code=409,
            detail="Cancele o envio antes de removê-lo do histórico.",
        )
    worker.cleanup_job_files(job)
    if not db.delete_job(job_id):
        raise HTTPException(status_code=409, detail="Não foi possível remover o envio.")
    return {"ok": True}


@app.delete("/api/history")
def api_clear_history(request: Request, _: None = Depends(require_auth)) -> dict:
    jobs = db.delete_terminal_jobs()
    for job in jobs:
        worker.cleanup_job_files(job)
    return {"ok": True, "deleted": len(jobs)}

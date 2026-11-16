FROM python:3.12-slim

ARG GOTOHP_BINARY=bin/gotohp-cli_amd64

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TMPDIR=/data/tmp

WORKDIR /srv/photosweb

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# O build da interface é versionado em app/static/ui/.
# Se esta checagem falhar, rode: cd ui && npm ci && npm run build
RUN test -f app/static/ui/index.html || \
    (echo "ERRO: app/static/ui/index.html não encontrado. Rode o build da interface antes." >&2; exit 1)

# Para VPS ARM: docker compose build --build-arg GOTOHP_BINARY=bin/gotohp-cli_arm64
# O nome do arquivo é preservado: o app procura gotohp-cli_amd64 ou gotohp-cli_arm64.
COPY ${GOTOHP_BINARY} ./bin/
RUN chmod 0755 "./bin/$(basename "${GOTOHP_BINARY}")"

RUN useradd --system --uid 10001 --no-create-home photosweb \
    && mkdir -p /data/tmp \
    && chown -R photosweb:photosweb /data

USER photosweb

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=3)" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log", "--proxy-headers", "--forwarded-allow-ips", "*"]

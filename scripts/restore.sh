#!/usr/bin/env bash
# Restaura um backup do volume photosweb_data. Uso: scripts/restore.sh arquivo.tar.gz
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

fail() {
  printf 'ERRO: %s\n' "$*" >&2
  exit 1
}

archive="${1:-}"
[ -n "$archive" ] || fail "Uso: scripts/restore.sh /caminho/photosweb-data-AAAAMMDD-HHMMSS.tar.gz"
[ -f "$archive" ] || fail "Arquivo não encontrado: $archive"

# Valida o arquivo antes de tocar em qualquer dado.
command -v tar >/dev/null 2>&1 || fail "tar não encontrado."
tar -tzf "$archive" >/dev/null 2>&1 || fail "Arquivo inválido ou corrompido: $archive"

archive_dir="$(cd "$(dirname "$archive")" && pwd)"
archive_name="$(basename "$archive")"

command -v docker >/dev/null 2>&1 || fail "Docker não encontrado."
[ -f .env ] || fail "Arquivo .env não encontrado. Crie/confige o .env antes de restaurar."

echo "ATENÇÃO: isto substitui TODO o conteúdo do volume photosweb_data."
echo "O .env não é alterado por este script."
read -r -p "Digite SUBSTITUIR para continuar: " answer
[ "$answer" = "SUBSTITUIR" ] || {
  echo "Cancelado."
  exit 1
}

docker compose stop app >/dev/null 2>&1 || true
trap 'docker compose up -d app >/dev/null 2>&1 || true' EXIT

# Extrai primeiro para .restore; só apaga o conteúdo atual se a extração der certo.
docker run --rm \
  -v photosweb_data:/data \
  -v "$archive_dir":/backup \
  alpine:3.20 \
  sh -c "rm -rf /data/.restore && mkdir -p /data/.restore && tar xzf \"/backup/${archive_name}\" -C /data/.restore && find /data -mindepth 1 -maxdepth 1 ! -name .restore -exec rm -rf {} + && cp -a /data/.restore/. /data/ && rm -rf /data/.restore && chown -R 10001:10001 /data && chmod 700 /data && ([ -f /data/gotohp.config ] && chmod 600 /data/gotohp.config || true) && ([ -f /data/secret.key ] && chmod 600 /data/secret.key || true)"

docker compose up -d app >/dev/null
trap - EXIT
echo "Dados restaurados. Confira os logs com: docker compose logs -f app"

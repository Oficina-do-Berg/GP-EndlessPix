#!/usr/bin/env bash
# Backup do volume de dados + .env. Uso: scripts/backup.sh [pasta-de-destino]
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

fail() {
  printf 'ERRO: %s\n' "$*" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "Docker não encontrado."
[ -f .env ] || fail "Arquivo .env não encontrado."

out_dir="${1:-$PWD/backups}"
mkdir -p "$out_dir"
out_dir="$(cd "$out_dir" && pwd)"

stamp="$(date +%Y%m%d-%H%M%S)"
data_file="$out_dir/photosweb-data-$stamp.tar.gz"
env_file="$out_dir/photosweb-env-$stamp"

echo "Parando o app por alguns segundos para copiar o banco com segurança..."
docker compose stop app >/dev/null 2>&1 || true
trap 'docker compose up -d app >/dev/null 2>&1 || true' EXIT

docker run --rm \
  -v photosweb_data:/data:ro \
  -v "$out_dir":/backup \
  alpine:3.20 \
  sh -c "tar czf \"/backup/$(basename "$data_file")\" -C /data . && chown $(id -u):$(id -g) \"/backup/$(basename "$data_file")\""

cp .env "$env_file"
chmod 600 "$data_file" "$env_file"

echo
echo "Backup dos dados: $data_file"
echo "Cópia do .env:    $env_file"
echo "Os dois arquivos contêm segredos (token do Google e senha). Guarde com segurança."

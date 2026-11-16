#!/usr/bin/env bash
# Deploy de produção na VPS. Rode na raiz do projeto: ./deploy.sh
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

fail() {
  printf 'ERRO: %s\n' "$*" >&2
  exit 1
}

env_value() {
  sed -n "s/^$1=//p" .env | tail -n 1 | tr -d '\r' \
    | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

command -v docker >/dev/null 2>&1 || fail "Docker não encontrado. Instale o Docker Engine."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 não encontrado."

[ -f .env ] || fail "Crie o .env primeiro: cp .env.example .env && nano .env"
[ -f app/static/ui/index.html ] || \
  fail "Interface não compilada. Rode: cd ui && npm ci && npm run build"

# Normaliza .env editado no Windows (CRLF), que quebraria os valores no Linux.
sed -i 's/\r$//' .env 2>/dev/null || true
chmod 600 .env 2>/dev/null || true

password="$(env_value APP_PASSWORD)"
[ -n "$password" ] || fail "APP_PASSWORD vazia no .env."
[ "$password" != "troque-esta-senha" ] || fail "Troque APP_PASSWORD no .env antes do deploy."

domain="$(env_value DOMAIN)"
[ -n "$domain" ] || fail "DOMAIN vazia no .env."
[ "$domain" != "fotos.seudominio.com" ] || fail "Troque DOMAIN pelo seu domínio no .env."
case "$domain" in
  *://*) fail "DOMAIN deve ser só o domínio, sem https://." ;;
esac

if [ -z "$(env_value SECRET_KEY)" ]; then
  if command -v openssl >/dev/null 2>&1; then
    secret="$(openssl rand -hex 32)"
  elif command -v python3 >/dev/null 2>&1; then
    secret="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  else
    fail "openssl/python3 não encontrado para gerar SECRET_KEY."
  fi

  if grep -q '^SECRET_KEY=' .env; then
    sed -i "s|^SECRET_KEY=.*|SECRET_KEY=${secret}|" .env
  else
    printf '\nSECRET_KEY=%s\n' "$secret" >> .env
  fi
  echo "SECRET_KEY gerada e salva no .env."
fi

chmod 600 .env 2>/dev/null || true

if [ "$(env_value DRY_RUN)" != "0" ]; then
  echo "AVISO: DRY_RUN não está 0. Os uploads serão simulados, não enviados ao Google."
fi
if [ "$(env_value COOKIE_SECURE)" != "1" ]; then
  echo "AVISO: COOKIE_SECURE não está 1. Em produção com HTTPS, use COOKIE_SECURE=1."
fi

echo "Construindo e subindo os containers..."
docker compose up -d --build

echo "Aguardando o app ficar saudável..."
healthy=0
for _ in $(seq 1 60); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}starting{{end}}' photosweb 2>/dev/null || true)"
  if [ "$status" = "healthy" ]; then
    healthy=1
    break
  fi
  if [ "$status" = "unhealthy" ]; then
    break
  fi
  sleep 2
done

if [ "$healthy" -ne 1 ]; then
  docker compose logs --tail=100 app || true
  fail "O app não ficou saudável. Veja os logs acima."
fi

docker compose ps

case "$domain" in
  :*) url="http://127.0.0.1${domain}" ;;
  *) url="https://${domain}" ;;
esac

echo
echo "Deploy concluído: ${url}"
echo "Acompanhe os logs com: docker compose logs -f app"

# Deploy na VPS

Guia de produção do **GP-EndlessPix**. O app roda em Docker, atrás do Caddy
(HTTPS automático), e o upload real é feito pelo `gotohp-cli` dentro do
container.

```text
Internet -> Caddy (443) -> app FastAPI (8000, interno) -> gotohp-cli -> Google Photos
```

O container do app **não publica a porta 8000** para a internet. Só o Caddy
fica exposto nas portas 80/443.

---

## 1. Requisitos

- VPS Linux (Ubuntu 24.04 é uma boa escolha), x86_64.
- 1 GB de RAM para fotos; 2 GB para vídeos grandes.
- Disco: pelo menos 20 GB para fotos e 40 GB+ para vídeos.
- Um domínio com registro DNS tipo **A** apontando para o IP da VPS.
- Docker Engine + plugin Compose.

> O upload grava o arquivo duas vezes durante a recepção (multipart +
> `data/tmp`). O pico de disco é cerca de **2× o tamanho do arquivo**.

---

## 2. Preparar a VPS

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

Saia e entre novamente no SSH para o grupo `docker` valer. Confira:

```bash
docker --version
docker compose version
```

Firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
```

No painel do seu domínio, crie:

```text
Tipo: A
Nome: fotos
Valor: IP_DA_VPS
```

Aguarde a propagação antes de subir o app (o Caddy precisa encontrar o domínio
para emitir o certificado).

---

## 3. Enviar o projeto

Escolha **uma** opção.

### Opção A: git clone

```bash
sudo mkdir -p /opt/photosweb
sudo chown "$USER":"$USER" /opt/photosweb
git clone https://github.com/Oficina-do-Berg/GP-EndlessPix.git /opt/photosweb
cd /opt/photosweb
```

### Opção B: enviar do Windows

Na pasta **pai** do projeto, no PowerShell:

```powershell
tar -czf gp-endlesspix-src.tar.gz `
  --exclude=.git `
  --exclude=.venv `
  --exclude=ui/node_modules `
  --exclude=data `
  --exclude=.env `
  "GP-EndlessPix"
scp gp-endlesspix-src.tar.gz usuario@IP_DA_VPS:/tmp/
```

Na VPS:

```bash
sudo mkdir -p /opt/photosweb
sudo tar xzf /tmp/gp-endlesspix-src.tar.gz -C /opt/photosweb --strip-components=1
sudo chown -R "$USER":"$USER" /opt/photosweb
rm /tmp/gp-endlesspix-src.tar.gz
cd /opt/photosweb
```

Não envie `.venv`, `ui/node_modules`, `data` nem `.env`. Eles são locais ou
contêm segredos.

---

## 4. Configurar o `.env`

```bash
cd /opt/photosweb
cp .env.example .env
chmod 600 .env
nano .env
```

Ajuste pelo menos:

```dotenv
APP_PASSWORD=uma-senha-longa-e-unica
DOMAIN=fotos.seudominio.com
COOKIE_SECURE=1
DRY_RUN=0
```

Deixe `SECRET_KEY` vazio: o `deploy.sh` gera uma chave e grava no `.env`.
Se preferir gerar manualmente:

```bash
openssl rand -hex 32
```

`MAX_UPLOAD_MB` define o limite por arquivo. Ajuste ao disco da VPS.

---

## 5. Subir

```bash
cd /opt/photosweb
chmod +x deploy.sh scripts/backup.sh scripts/restore.sh
./deploy.sh
```

O script:

1. valida o `.env` e gera a `SECRET_KEY` se necessário;
2. constrói a imagem;
3. sobe `app` + `caddy`;
4. espera o `/healthz` ficar saudável;
5. mostra a URL final.

Abra `https://fotos.seudominio.com`, entre com `APP_PASSWORD` e conecte a conta
Google pelo token. O passo a passo do cookie está no
[README](README.md#conectar-a-conta-google).

---

## 6. Migrar os dados do Windows (opcional)

Isso leva o histórico, a conta conectada e a configuração do gotohp para a VPS.

1. Feche o app local (a janela do `run.bat`) para o banco ficar consistente.
2. No Windows, na pasta do projeto:

```powershell
tar -czf photosweb-data.tar.gz -C data .
scp photosweb-data.tar.gz usuario@IP_DA_VPS:/tmp/
```

3. Na VPS, após o primeiro `./deploy.sh`:

```bash
cd /opt/photosweb
./scripts/restore.sh /tmp/photosweb-data.tar.gz
rm /tmp/photosweb-data.tar.gz
```

4. Se você usava uma `SECRET_KEY` fixa no `.env` local, copie o mesmo valor
   para o `.env` da VPS. Caso contrário, as sessões antigas apenas deixam de
   valer e você entra de novo com a senha.

> O arquivo de dados contém o `oauth_token` da conta Google. Trate como senha.
> Apague o `.tar.gz` depois de restaurar.

---

## 7. Atualizar

```bash
cd /opt/photosweb
git pull            # ou envie os arquivos novos
./deploy.sh
```

O volume `photosweb_data` é preservado. Se você alterou a interface em `ui/`,
rode o build **antes** do deploy:

```bash
cd ui
npm ci
npm run build
cd ..
./deploy.sh
```

O `deploy.sh` recusa subir se `app/static/ui/index.html` não existir.

---

## 8. Backup e restauração

### Backup

```bash
cd /opt/photosweb
./scripts/backup.sh
# ou escolha a pasta:
./scripts/backup.sh /root/backups
```

O script para o app por alguns segundos (para copiar o SQLite com segurança),
compacta o volume e copia o `.env`. Os arquivos ficam com permissão `600` e
contêm o token do Google. Não rode o backup com um upload em andamento.

### Restaurar

```bash
./scripts/restore.sh /caminho/photosweb-data-AAAAMMDD-HHMMSS.tar.gz
```

Digite `SUBSTITUIR` para confirmar. O script valida o arquivo antes, extrai para
uma pasta temporária dentro do volume e só então substitui os dados antigos,
corrige o dono para o usuário `10001` do container e sobe o app de novo. O
`.env` não é alterado; restaure a cópia do `.env` manualmente se precisar.

Guarde os backups fora da VPS. Sem o `.env` e o volume, a conta e o histórico
não podem ser recuperados.

---

## 9. Logs e saúde

```bash
docker compose ps
docker compose logs -f app
curl -fsS https://fotos.seudominio.com/healthz
```

Resposta saudável inclui `"status":"ok"`, `"dry_run":false` e
`"binary_ok":true`.

Reiniciar:

```bash
docker compose restart app
```

Parar:

```bash
docker compose down
```

Os volumes **não** são apagados por `down`. Só use `down -v` se quiser apagar
banco, token e certificados.

---

## 10. Cloudflare

Se usar Cloudflare na frente:

- O proxy gratuito limita cada requisição a cerca de **100 MB**. Para vídeos
  maiores, use **DNS only** (nuvem cinza).
- Com proxy, use SSL/TLS **Full (strict)**. O modo Flexible quebra o login.
- Não ative "Under Attack Mode" para o app: o polling da fila pode ser
  bloqueado.

---

## 11. VPS ARM

O binário padrão é x86_64. Para ARM64:

1. Baixe o `gotohp-cli_arm64` oficial e coloque em `bin/gotohp-cli_arm64`.
2. No `.env`, defina:

```dotenv
GOTOHP_BUILD_BINARY=bin/gotohp-cli_arm64
```

3. Rode `./deploy.sh` de novo.

O Dockerfile mantém o nome original do binário (`gotohp-cli_arm64`), que é um
dos nomes procurados pelo app. Como não há hash conhecido para ARM64, a
verificação de integridade é ignorada; confira você mesmo o SHA-256 baixado.

---

## 12. Instabox / sandbox sem portas públicas

Esta seção é opcional e serve para testes em sandboxes. O alvo recomendado para
produção continua sendo uma VPS normal com domínio próprio, como nas seções
anteriores.

Se o app estiver num sandbox Instabox (ou outro provedor que não expõe portas
diretamente), o Let's Encrypt não consegue validar o domínio. Use o proxy HTTPS
do próprio Instabox:

1. No `docker-compose.yml` do sandbox, publique o Caddy apenas em localhost:

   ```yaml
   ports:
     - "127.0.0.1:8080:80"
   ```

   Remova as publicações 80/443. O proxy do Instabox termina o TLS.
2. No `.env`, use `DOMAIN=:80` e mantenha `COOKIE_SECURE=1`, porque a URL
   pública do Instabox é HTTPS.
3. Suba com `./deploy.sh` e publique a porta:

   ```bash
   instabox-port publish 8080
   ```

4. Use a URL `https://...instabox.tech` retornada. Ela só responde enquanto o
   sandbox estiver rodando. Para remover:

   ```bash
   instabox-port unpublish 8080
   ```

O `deploy.sh` e o `Caddyfile` continuam os mesmos. Se quiser voltar ao compose
padrão com 80/443, restaure o arquivo do repositório com
`git checkout -- docker-compose.yml`.

---

## 13. Checklist de segurança

- [ ] `APP_PASSWORD` longa e única.
- [ ] `COOKIE_SECURE=1` e acesso somente por HTTPS.
- [ ] `DRY_RUN=0` só depois de testar.
- [ ] `.env` com permissão `600`.
- [ ] Porta 8000 não publicada na internet (o Compose não a expõe).
- [ ] Firewall liberando só SSH, 80 e 443.
- [ ] Backups guardados fora da VPS e com permissão restrita.
- [ ] Token do Google nunca colado em prints, issues ou chats.
- [ ] Teste primeiro com uma conta secundária e um arquivo pequeno.

O uso do gotohp pode contrariar os termos do Google e resultar em bloqueio da
conta. Use por sua conta e risco.

---

## 14. Problemas comuns

**Caddy não emite certificado**

Confira o DNS tipo A, as portas 80/443 e se o domínio aponta para o IP certo.
Veja `docker compose logs caddy`.

**502 Bad Gateway**

O app não está saudável. Veja `docker compose logs app` e
`docker compose ps`.

**Login volta para a tela de senha**

Em HTTP, `COOKIE_SECURE=1` faz o navegador descartar o cookie. Use HTTPS ou,
apenas em teste local, `COOKIE_SECURE=0`.

**413 Request Entity Too Large**

Passou de `MAX_UPLOAD_MB` ou do limite de 100 MB do proxy Cloudflare.

**507 Insufficient Storage**

Falta disco. Lembre do pico de 2× o tamanho do arquivo.

**"Nenhuma conta conectada"**

Gere um `oauth_token` novo e conecte a conta em **Conta → Conectar outra
conta**.

**Permissão negada no volume após restaurar**

Rode de novo o `scripts/restore.sh`; ele corrige o dono para `10001:10001`.

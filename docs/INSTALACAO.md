# Instalação em VPS

Guia de produção do **GP-EndlessPix** em uma VPS Linux com Docker. Ao final, o
app estará disponível em uma URL HTTPS própria, pronto para receber uploads de
qualquer dispositivo.

```text
Internet -> Caddy (443) -> app FastAPI (8000, interno) -> gotohp-cli -> Google Photos
```

O container do app **não publica a porta 8000** para a internet. Só o Caddy
fica exposto nas portas 80/443.

> **Alvo deste guia:** uma VPS comum com IP público e domínio próprio. Para
> testar em sandbox sem portas públicas, veja a seção
> [Instabox](#instabox--sandbox-opcional) no final.

---

## 1. Requisitos

| Item | Recomendação |
|---|---|
| Sistema | Ubuntu 24.04, Debian 12/13 ou similar, x86_64 |
| Memória | 1 GB para fotos; 2 GB para vídeos grandes |
| Disco | 20 GB+ para fotos; 40 GB+ para vídeos |
| Rede | Portas 80 e 443 liberadas |
| Domínio | Registro DNS tipo **A** apontando para o IP da VPS |
| Software | Docker Engine + plugin Compose v2 |

O upload grava o arquivo duas vezes durante a recepção (multipart + `data/tmp`).
Considere um pico de disco de cerca de **2× o tamanho do arquivo**.

---

## 2. Preparar a VPS

Atualize o sistema e instale o Docker:

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

### Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
```

### DNS

No painel do seu domínio, crie um registro apontando para a VPS:

```text
Tipo: A
Nome: fotos
Valor: IP_DA_VPS
```

Aguarde a propagação antes de subir o app. O Caddy precisa encontrar o domínio
para emitir o certificado Let's Encrypt.

---

## 3. Obter o projeto

Escolha **uma** opção.

### Opção A: git clone (recomendada)

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

| Variável | O que faz |
|---|---|
| `APP_PASSWORD` | Senha de acesso ao site. Use uma senha longa e única. |
| `DOMAIN` | Domínio atendido pelo Caddy, sem `https://`. |
| `COOKIE_SECURE` | Use `1` em produção com HTTPS. |
| `DRY_RUN` | `1` simula uploads; `0` envia de verdade. |
| `MAX_UPLOAD_MB` | Limite por arquivo. Ajuste ao disco da VPS. |
| `SECRET_KEY` | Assina o cookie de sessão. Deixe vazio para o `deploy.sh` gerar. |

Deixe `SECRET_KEY` vazio: o `deploy.sh` gera uma chave e grava no `.env`.
Se preferir gerar manualmente:

```bash
openssl rand -hex 32
```

---

## 5. Subir o app

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

Abra `https://fotos.seudominio.com`, entre com `APP_PASSWORD` e conecte sua
conta Google.

---

## 6. Conectar a conta Google

O app usa o motor do `gotohp`. A conexão é feita com o cookie `oauth_token` da
conta, que funciona como uma credencial de acesso.

1. Abra <https://accounts.google.com/embedded/setup/v2/android> no navegador.
2. Entre na conta e clique em **I agree**.
3. A página vai ficar carregando para sempre. **Isso é normal** — o cookie já
   foi emitido.
4. Abra o DevTools (F12) → **Application** (Chrome/Edge) ou **Storage**
   (Firefox) → **Cookies** → `https://accounts.google.com`.
5. Copie o valor inteiro do cookie `oauth_token`.
6. No GP-EndlessPix, abra **Conectar outra conta**, cole o token e clique em
   **Conectar**.

O token é guardado no volume do app, com permissão restrita. Ele vale como
**senha da conta**: não cole em chats, prints ou logs.

Para testar sem risco, use uma conta Google secundária.

---

## 7. Migrar dados do Windows (opcional)

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

## 8. Cloudflare (opcional)

Se usar Cloudflare na frente:

- O proxy gratuito limita cada requisição a cerca de **100 MB**. Para vídeos
  maiores, use **DNS only** (nuvem cinza).
- Com proxy, use SSL/TLS **Full (strict)**. O modo Flexible quebra o login.
- Não ative "Under Attack Mode" para o app: o polling da fila pode ser
  bloqueado.

---

## 9. VPS ARM64

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

## 10. Instabox / sandbox (opcional)

Esta seção serve para testes em sandboxes. O alvo recomendado para produção
continua sendo uma VPS normal com domínio próprio.

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

## 11. Próximos passos

- [Operação: atualização, backup e monitoramento](OPERACAO.md)
- [Segurança: senha, token e exposição na internet](SEGURANCA.md)
- [Arquitetura técnica](ARQUITETURA.md)
- [Perguntas frequentes](FAQ.md)

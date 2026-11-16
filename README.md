# GP-EndlessPix

Aplicativo web para enviar fotos e vídeos ao Google Photos usando o motor do
[`gotohp`](https://github.com/xob0t/gotohp).

Feito para **uso pessoal, uma conta e um usuário**. Não é um serviço público e
não é afiliado ao Google.

> **Aviso:** o gotohp emula um aparelho Pixel para usar o backup "ilimitado".
> Isso contraria os termos do Google e pode fazer a conta ser bloqueada. Teste
> primeiro com uma conta secundária.

> **Vai hospedar na VPS?** O passo a passo de produção está em
> **[DEPLOY.md](DEPLOY.md)**.

---

## Como funciona

```text
Navegador (celular ou PC)
        │  envia o arquivo pelo site
        ▼
GP-EndlessPix na VPS
        │  salva temporariamente em data/tmp/<id>/
        ▼
gotohp-cli
        │  envia para o Google Photos
        ▼
Google Photos
        │
        └─ o GP-EndlessPix apaga o temporário após o sucesso
```

- O navegador é só a interface. Quem envia é o `gotohp` rodando no servidor.
- Um worker processa a fila, um arquivo por vez, com até 3 tentativas.
- Se o arquivo já existir no Google Photos, o gotohp marca como "skipped" e o
  app trata como sucesso.
- O nome original e a data de modificação do arquivo são preservados.
- Upload concluído apaga o temporário. Upload com erro **mantém** o arquivo
  para o botão **Reenviar** do histórico funcionar.

Stack: Python 3.12, FastAPI, SQLite, React 19, Vite 8, Tailwind CSS 4 e
`gotohp-cli` v0.11.0.

> A fila é um thread dentro do processo. Use **sempre 1 worker** do Uvicorn
> (o `Dockerfile` e o `run.bat` já fazem isso). Mais workers fariam uploads
> duplicados e disputariam o mesmo banco.

---

## Estrutura do projeto

| Caminho | Função |
|---|---|
| `app/` | Backend FastAPI, fila, SQLite e integração com o gotohp |
| `ui/` | Código-fonte da interface React + Tailwind |
| `app/static/ui/` | Build da interface servido pelo FastAPI (versionado) |
| `bin/` | Binários do gotohp (Linux e Windows) |
| `data/` | Banco, token e temporários em execução (não versionado) |
| `tests/` | Testes do backend em DRY_RUN |
| `Dockerfile`, `docker-compose.yml`, `Caddyfile` | Deploy com HTTPS |
| `deploy.sh`, `scripts/` | Deploy, backup e restauração |
| `DEPLOY.md` | Guia de hospedagem na VPS |

---

## Rodar no Windows (teste local)

Requisitos: Python 3.11 ou mais novo.

1. Dê dois cliques em `run.bat`. Na primeira vez ele cria o `.venv`, instala as
   dependências e, se não existir `.env`, copia o `.env.example` e abre no Bloco
   de Notas para você definir `APP_PASSWORD`.
2. Abra <http://127.0.0.1:8000> e entre com a senha definida em `APP_PASSWORD`.
3. O `.env.example` vem com `DRY_RUN=1` (modo de teste). Nesse modo os arquivos
   são recebidos, a fila funciona, mas **nada é enviado ao Google**.
4. Para usar de verdade, edite o `.env`, troque `APP_PASSWORD` por uma senha sua
   e mude `DRY_RUN=0`. Depois conecte a conta Google.

Se o `.env` não existir, o `run.bat` copia o `.env.example` e abre no Bloco de
Notas para você preencher.

Para rodar manualmente:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### Interface (`ui/`)

A interface oficial é o app React em `ui/`. O build fica em `app/static/ui/` e
já vai versionado, então **rodar o site só com Python funciona** sem Node.

Para mexer na interface:

```powershell
cd ui
npm install
npm run build
```

Durante o desenvolvimento, `npm run dev` abre em `http://127.0.0.1:3000` e
encaminha `/api`, `/login` e `/logout` para o FastAPI em `127.0.0.1:8000`.

O comando `npm run build` recria `app/static/ui/`. Rode-o antes de reiniciar o
servidor sempre que alterar `ui/src`.

### Conectar a conta Google

1. Abra <https://accounts.google.com/embedded/setup/v2/android> no navegador.
2. Entre na conta e clique em **I agree**.
3. A página vai ficar carregando para sempre. **Isso é normal** — o cookie já
   foi emitido.
4. Abra o DevTools (F12) → **Application** (Chrome/Edge) ou **Storage**
   (Firefox) → **Cookies** → `https://accounts.google.com`.
5. Copie o valor inteiro do cookie `oauth_token`.
6. No GP-EndlessPix, abra **Conectar outra conta**, cole o token e clique em
   **Conectar**.

O token é guardado em `data/gotohp.config` com permissão restrita. Ele vale como
**senha da conta**: não cole em chats, prints ou logs.

Para testar sem risco, use uma conta Google secundária.

---

## Variáveis do `.env`

| Variável | Padrão | Para que serve |
|---|---|---|
| `APP_PASSWORD` | — | Senha de acesso ao site. Obrigatória. |
| `SECRET_KEY` | gerada em `data/secret.key` | Assina o cookie de sessão. |
| `COOKIE_SECURE` | `0` | Use `1` quando estiver em HTTPS. |
| `MAX_UPLOAD_MB` | `4096` | Limite por arquivo, em MB. |
| `UPLOAD_TIMEOUT_SEC` | `7200` | Tempo máximo de cada tentativa. |
| `MAX_RETRIES` | `3` | Tentativas por arquivo. |
| `DRY_RUN` | `1` | `1` simula o envio; `0` envia de verdade. |
| `VERIFY_BINARY` | `1` | Confere o SHA-256 dos binários conhecidos. |
| `GOTOHP_PROXY` | vazio | Proxy opcional para o gotohp. |
| `DATA_DIR` | `data` | Pasta do banco, token e temporários. |
| `DOMAIN` | — | Domínio usado pelo Caddy no Docker. |

Gerar uma `SECRET_KEY`:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Se `SECRET_KEY` ficar vazia, o app gera uma e salva em `data/secret.key`.

---

## Colocar numa VPS (Docker)

O projeto já está pronto para Docker + Caddy. O guia completo, com migração de
dados, backup e checklist de segurança, está em **[DEPLOY.md](DEPLOY.md)**.

Resumo:

1. Aponte um domínio (registro A) para o IP da VPS.
2. Instale Docker e libere as portas 80/443.
3. Clone o repositório:

   ```bash
   git clone https://github.com/Oficina-do-Berg/GP-EndlessPix.git
   cd GP-EndlessPix
   ```
4. Crie o `.env`:

   ```bash
   cp .env.example .env
   nano .env
   ```

   Ajuste `APP_PASSWORD`, `DOMAIN`, `COOKIE_SECURE=1` e `DRY_RUN=0`.
5. Suba:

   ```bash
   chmod +x deploy.sh scripts/*.sh
   ./deploy.sh
   ```

6. Abra `https://seu-dominio` e conecte a conta Google.

O Caddy emite o certificado automaticamente. A porta 8000 fica interna; só
80/443 são publicadas.

Backup e restauração:

```bash
./scripts/backup.sh
./scripts/restore.sh backups/photosweb-data-AAAAMMDD-HHMMSS.tar.gz
```

Atualização:

```bash
git pull
./deploy.sh
```

Os dados ficam no volume `photosweb_data` e não são apagados em updates.

> Para usar só IP, sem domínio, defina `DOMAIN=:80` e `COOKIE_SECURE=0`
> apenas em teste. Sem HTTPS, senha e token trafegam em texto puro. O guia
> completo cobre Cloudflare, VPS ARM e migração do Windows.

---

## Interface

A interface oficial é o SPA React em `ui/`, servido pelo FastAPI em `/` depois
do login por senha. O visual fica em `ui/src`; o build vai para
`app/static/ui/`.

- `app/templates/login.html` — tela de login por senha do site.
- `app/static/style.css` — estilo da tela de login.
- `ui/src` — interface principal (React + Tailwind).
- `app/static/ui` — build pronto, versionado para o servidor rodar só com Python.

### API

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/healthz` | Status do servidor e do binário. |
| `GET` | `/api/jobs?limit=50` | Histórico, estatísticas e status do servidor. |
| `POST` | `/api/jobs` | Multipart `file` + `last_modified` (ms). Cria um job. |
| `GET` | `/api/jobs/{id}` | Estado de um job. |
| `DELETE` | `/api/jobs/{id}` | Cancela um job `queued` ou `paused`. |
| `POST` | `/api/jobs/{id}/pause` | Pausa um job que ainda está na fila. |
| `POST` | `/api/jobs/{id}/resume` | Devolve um job pausado para a fila. |
| `POST` | `/api/jobs/{id}/retry` | Reenfileira um job com erro que ainda tem arquivo. |
| `DELETE` | `/api/history/{id}` | Remove um item terminado do histórico. |
| `DELETE` | `/api/history` | Limpa todo o histórico terminado. |
| `GET` | `/api/accounts` | Contas conectadas e conta ativa. |
| `POST` | `/api/accounts` | JSON `{"token": "...", "email": "opcional"}`; conecta uma conta. |
| `POST` | `/api/accounts/select` | JSON `{"email": "..."}`; troca a conta ativa. |
| `DELETE` | `/api/accounts/{email}` | Remove a credencial da conta. |

Tudo abaixo de `/api` exige o cookie de sessão. O login é `POST /login` com o
campo `password`.

Estados de um job: `queued`, `uploading`, `paused`, `success`, `error`,
`cancelled`.

A interface faz polling de 3 segundos em `/api/jobs`; não há WebSocket. O
progresso da barra é o envio real do navegador para o servidor (`XMLHttpRequest`
com `upload.onprogress`). Quando o arquivo chega ao servidor, a interface mostra
a fase da fila/worker sem percentual inventado: o gotohp não informa progresso
percentual do envio ao Google. A API devolve todos os jobs ativos e os últimos
jobs finalizados, para filas grandes não perderem itens.

---

## Testes

```powershell
.\.venv\Scripts\python.exe -m pytest
cd ui
npm test
npm run lint
```

Os testes do Python usam `DRY_RUN=1`, uma pasta temporária e não tocam na sua
conta Google. O teste da interface cobre validação de arquivos, token, métricas
e formatação.

---

## Limitações atuais

- Um usuário e uma senha.
- O servidor processa um arquivo por vez (o navegador envia até dois em
  paralelo para o servidor).
- Pausa funciona para arquivos que ainda estão na fila ou no envio
  navegador → servidor. Um envio que o `gotohp` já começou não pode ser pausado
  no meio.
- Sem álbuns, sem monitoramento de pastas e sem retomada de upload
  interrompido; a tentativa recomeça do zero.
- Erros mantêm o temporário em disco até você reenviar ou limpar o histórico.
- O token pode expirar ou ser revogado; nesse caso, conecte a conta de novo.
- Não há suporte a pareamento de Live Photos nesta interface.
- Datacenter IPs podem receber desafios do Google; o `GOTOHP_PROXY` existe para
  esses casos.
- Upload interrompido no meio não é retomado; o arquivo é enviado de novo.
- O app não apaga nada do Google Photos.

---

## Segurança

- Use HTTPS e `COOKIE_SECURE=1` em produção.
- Use uma senha longa; o site fica exposto na internet.
- O `oauth_token` vale como senha da conta Google.
- Não exponha a porta 8000 publicamente; deixe o Caddy na frente.
- Nunca coloque token em logs, prints ou issues.
- O backup do volume contém o token: guarde com cuidado.
- Rode o teste primeiro com uma conta secundária e um arquivo pequeno.
- O uso do gotohp pode violar os termos do Google e resultar em bloqueio.

---

## Problemas comuns

**`/healthz` retorna 503**

O binário do gotohp não foi encontrado, não tem permissão de execução ou o hash
não confere. Veja os logs. No Docker, o binário é copiado e recebe `chmod +x`
durante o build.

**"Nenhuma conta conectada"**

Conecte uma conta em **Conectar outra conta**. O token é obrigatório.

**"A conta Google recusou a credencial"**

Gere um `oauth_token` novo. Se persistir, tente com `GOTOHP_PROXY`.

**Erro 413**

O arquivo passou de `MAX_UPLOAD_MB` ou de ~100 MB por causa do proxy do
Cloudflare. Ajuste o limite ou use DNS only.

**Erro 507**

Falta espaço em disco. Lembre que o pico é cerca de 2× o arquivo.

**Upload parado em "Enviando"**

Veja `docker compose logs -f app`. Se o app reiniciou, jobs que estavam
`uploading` voltam para a fila na próxima inicialização.

**Caddy não emite certificado**

Confira o DNS, as portas 80/443 e se o domínio realmente aponta para a VPS.

**A página de login do Google fica carregando**

É o comportamento esperado do Embedded Setup. O cookie já está disponível.

---

## Licença

Distribuído sob a GNU General Public License v3.0. Veja [LICENSE](LICENSE).

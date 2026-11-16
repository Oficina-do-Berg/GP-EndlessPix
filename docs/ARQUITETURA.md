# Arquitetura

O GP-EndlessPix é uma aplicação web auto-hospedada que recebe arquivos pelo
navegador e os envia ao Google Photos usando o `gotohp-cli` rodando no servidor.
O upload é ilimitado: o `gotohp-cli` se autentica como um dispositivo Pixel XL e
não desconta os arquivos da cota da conta.

---

## Visão geral

```text
Navegador (celular, tablet ou PC)
        │  HTTPS
        ▼
Caddy (porta 443)
        │  proxy interno
        ▼
FastAPI (porta 8000, não publicada)
        │
        ├─ SQLite: fila, histórico e metadados
        ├─ volume: token, temporários e chave de sessão
        └─ worker: processa um arquivo por vez
                │
                ▼
        gotohp-cli
                │
                ▼
        Google Photos
```

O navegador não fala diretamente com o Google. Ele envia o arquivo para a sua
VPS; o worker do servidor faz o upload para a conta conectada. Depois que o
arquivo chega ao servidor, o envio continua mesmo se a aba do navegador for
fechada.

O `gotohp-cli` usa a API do Pixel, uma integração não oficial que se apresenta
ao Google como um Pixel XL. Os arquivos são enviados em qualidade original e
não consomem a cota do Google Photos. Por ser uma integração não oficial, o
comportamento pode mudar sem aviso e o uso está sujeito aos termos do Google.

---

## Componentes

| Componente | Responsabilidade |
|---|---|
| `app/main.py` | Rotas HTTP, login, API, upload e ciclo de vida |
| `app/worker.py` | Fila em thread, tentativas, retry e limpeza |
| `app/gotohp.py` | Integração com o binário `gotohp-cli` |
| `app/db.py` | SQLite, jobs, estatísticas e histórico |
| `app/config.py` | Variáveis de ambiente, caminhos e validação |
| `ui/` | Interface React + Tailwind |
| `app/static/ui/` | Build da interface servido pelo FastAPI |
| `Caddyfile` | HTTPS automático, cache e proxy reverso |
| `docker-compose.yml` | App interno + Caddy + volume persistente |

---

## Fluxo de um upload

1. O navegador envia o arquivo por multipart para `POST /api/jobs`.
2. O app valida extensão e tamanho, grava em `data/tmp/<id>/` e cria um job
   `queued` no SQLite.
3. O worker pega o próximo job com uma transação atômica e marca `uploading`.
4. O worker chama o `gotohp-cli` com o caminho, a data de modificação e a conta
   ativa.
5. Em caso de sucesso, o job vira `success`, o temporário é apagado e o
   histórico é atualizado.
6. Em caso de erro, o job vira `error`, o arquivo é mantido e o botão
   **Reenviar** fica disponível.

O worker processa **um arquivo por vez**. O navegador pode enviar até dois
arquivos em paralelo para o servidor, mas o upload ao Google é serializado.

---

## Fila e estados

```text
queued -> uploading -> success
   │          │
   │          └-> error
   ├-> paused -> queued
   └-> cancelled
```

- `queued`: aguardando o worker.
- `uploading`: o gotohp está enviando.
- `paused`: pausado antes de começar.
- `success`: enviado ou já existente no Google.
- `error`: falhou após as tentativas; o temporário é mantido.
- `cancelled`: removido antes do envio.

Jobs que estavam `uploading` quando o app caiu voltam para `queued` na próxima
inicialização.

---

## Dados persistidos

O volume `photosweb_data` guarda:

```text
/data
├── app.db          # fila, histórico e metadados
├── gotohp.config   # credenciais da conta Google
├── secret.key      # chave de sessão, se não estiver no .env
└── tmp/            # arquivos temporários
```

O banco usa SQLite com WAL. Não há Redis, banco externo ou armazenamento em
nuvem próprio: o objetivo é manter a instalação simples e reproduzível.

---

## API

Tudo abaixo de `/api` exige o cookie de sessão.

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

O login é `POST /login` com o campo `password`.

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
| `docs/` | Documentação de instalação, operação, segurança e FAQ |

---

## Decisões de projeto

- **API do Pixel:** o gotohp se identifica como Pixel XL para enviar em
  qualidade original sem consumir cota; é uma integração não oficial.
- **Um worker:** evita uploads duplicados e disputa pelo mesmo SQLite.
- **SQLite:** simples de operar, backup e restaurar em uma VPS pequena.
- **Build da UI versionado:** a VPS não precisa de Node.js para rodar o app.
- **Caddy:** certificado e renovação automáticos, sem configuração manual.
- **Volume nomeado:** dados sobrevivem a updates e recriação de containers.
- **Temporários no volume:** reenvio funciona mesmo após reinício do app.

---

## Testes

```bash
.venv/bin/python -m pytest
cd ui
npm test
npm run lint
```

Os testes do Python usam `DRY_RUN=1`, uma pasta temporária e não tocam na conta
Google. Os testes da interface cobrem validação de arquivos, token, métricas e
formatação.

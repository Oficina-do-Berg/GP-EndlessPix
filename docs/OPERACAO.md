# Operação

Rotina de atualização, monitoramento, backup e recuperação de uma instalação já
em produção.

---

## Atualizar o app

```bash
cd /opt/photosweb
git pull
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

## Logs e saúde

```bash
docker compose ps
docker compose logs -f app
curl -fsS https://fotos.seudominio.com/healthz
```

Resposta saudável inclui `"status":"ok"`, `"dry_run":false` e
`"binary_ok":true`.

Reiniciar apenas o app:

```bash
docker compose restart app
```

Parar a stack:

```bash
docker compose down
```

Os volumes **não** são apagados por `down`. Só use `down -v` se quiser apagar
banco, token e certificados.

---

## Backup

```bash
cd /opt/photosweb
./scripts/backup.sh
# ou escolha a pasta:
./scripts/backup.sh /root/backups
```

O script para o app por alguns segundos (para copiar o SQLite com segurança),
compacta o volume e copia o `.env`. Os arquivos ficam com permissão `600` e
contêm o token do Google. Não rode o backup com um upload em andamento.

Os arquivos gerados seguem o padrão:

```text
photosweb-data-AAAAMMDD-HHMMSS.tar.gz
photosweb-env-AAAAMMDD-HHMMSS
```

Guarde os backups **fora da VPS**. Sem o `.env` e o volume, a conta e o
histórico não podem ser recuperados.

### O que entra no backup

- `app.db` — fila, histórico e metadados dos arquivos.
- `gotohp.config` — credenciais da conta Google.
- `secret.key` — chave de sessão, quando gerada pelo app.
- `.env` — senha do site, domínio e configurações.

Tudo isso é sensível. Trate o backup como trataria a senha da conta Google.

---

## Restaurar

```bash
./scripts/restore.sh /caminho/photosweb-data-AAAAMMDD-HHMMSS.tar.gz
```

Digite `SUBSTITUIR` para confirmar. O script:

1. valida o arquivo antes de tocar em qualquer dado;
2. extrai para uma pasta temporária dentro do volume;
3. substitui os dados antigos;
4. corrige o dono para o usuário `10001` do container;
5. sobe o app de novo.

O `.env` não é alterado. Restaure a cópia do `.env` manualmente se precisar.

---

## Rotina recomendada

| Frequência | Ação |
|---|---|
| Semanal | Verificar `/healthz` e o espaço em disco |
| Semanal | Rodar um backup e copiar para fora da VPS |
| Mensal | Atualizar a imagem e testar login/envio |
| Após mudanças | Rodar `./deploy.sh` e conferir os logs |
| Antes de migrar | Fazer backup e testar a restauração |

---

## Problemas comuns

**Caddy não emite certificado**

Confira o DNS tipo A, as portas 80/443 e se o domínio aponta para o IP certo.
Veja `docker compose logs caddy`.

**502 Bad Gateway**

O app não está saudável. Veja `docker compose logs app` e `docker compose ps`.

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

**Upload parado em "Enviando"**

Veja `docker compose logs -f app`. Se o app reiniciou, jobs que estavam
`uploading` voltam para a fila na próxima inicialização.

**A página de login do Google fica carregando**

É o comportamento esperado do Embedded Setup. O cookie já está disponível.

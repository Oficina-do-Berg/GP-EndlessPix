# Segurança

O GP-EndlessPix foi desenhado para **uso pessoal**: uma instalação, uma senha de
acesso e uma conta Google por vez. Ele não é um serviço público multiusuário.

Esta página explica o modelo de segurança e o que deve ser feito para expor o
app na internet com segurança.

---

## Modelo de acesso

```text
Internet
   │  HTTPS (Caddy + Let's Encrypt)
   ▼
Login por senha (APP_PASSWORD)
   │  cookie de sessão assinado
   ▼
App FastAPI
   │
   └─ token do Google (oauth_token) no volume privado
```

- O acesso ao site é protegido por uma única senha (`APP_PASSWORD`).
- O cookie de sessão é assinado com `SECRET_KEY`.
- Em produção, use `COOKIE_SECURE=1` para o cookie só trafegar por HTTPS.
- O token da conta Google fica no volume `photosweb_data`, com permissão
  restrita, e nunca é enviado ao navegador.

---

## O que fica armazenado

| Local | Conteúdo | Sensibilidade |
|---|---|---|
| `.env` | Senha do site, `SECRET_KEY`, domínio e limites | Alta |
| Volume `photosweb_data/app.db` | Fila, histórico e nomes dos arquivos | Média |
| Volume `photosweb_data/gotohp.config` | Credencial da conta Google | **Crítica** |
| Volume `photosweb_data/tmp/` | Arquivos aguardando envio ou reenvio | Alta |
| Backups | Cópia de tudo acima | **Crítica** |

O app não mantém um servidor central, não envia telemetria e não compartilha
seus dados com a Oficina do Berg. Cada instalação é independente.

---

## Checklist de segurança

- [ ] `APP_PASSWORD` longa, única e diferente de outras senhas suas.
- [ ] `COOKIE_SECURE=1` e acesso somente por HTTPS.
- [ ] `DRY_RUN=0` apenas depois de testar com uma conta secundária.
- [ ] `.env` com permissão `600`.
- [ ] Porta 8000 não publicada na internet (o Compose não a expõe).
- [ ] Firewall liberando só SSH, 80 e 443.
- [ ] Backups guardados fora da VPS e com permissão restrita.
- [ ] Token do Google nunca colado em prints, issues ou chats.
- [ ] Teste primeiro com uma conta secundária e um arquivo pequeno.

---

## Token do Google

O `oauth_token` **vale como uma senha da conta Google**. Quem tiver o token pode
tentar acessar os serviços da conta.

- Não coloque o token em issues, prints, logs ou mensagens.
- Não versionar `data/gotohp.config`, `data/app.db` ou backups.
- Se o token vazar, remova a credencial no app e gere um novo token.
- Prefira uma conta secundária para testes e para o primeiro deploy.

O app mantém o token no volume do Docker. Um backup do volume contém esse token;
proteja o arquivo como protegeria sua senha.

---

## Exposição na internet

- Use um domínio próprio e HTTPS. Sem TLS, senha e token trafegam em texto puro.
- Não publique a porta 8000. O Caddy é a única entrada.
- Se usar Cloudflare, prefira **Full (strict)** e lembre do limite de ~100 MB
  por requisição no proxy gratuito.
- Mantenha o Docker e a imagem base atualizados.
- Monitore `docker compose logs app` e o espaço em disco.

---

## Limites importantes

- **Um usuário e uma senha.** Não há cadastro, recuperação de senha nem
  separação entre usuários.
- **Uma conta Google por vez.** A troca de conta é feita no painel **Conta**.
- **Sem criptografia em repouso.** O SQLite e o token ficam no volume da VPS;
  proteja o acesso ao servidor e aos backups.
- **Sem auditoria avançada.** O histórico registra os uploads, mas não é um
  sistema de gestão de identidade.
- **Upload ilimitado não oficial.** O app usa a API do Pixel por meio do
  `gotohp-cli`; o comportamento pode mudar sem aviso e não há garantia do
  serviço por parte do Google.

---

## Se a VPS for comprometida

1. Remova o token da conta Google e gere outro.
2. Troque a `APP_PASSWORD` e a `SECRET_KEY`.
3. Refaça o deploy com uma imagem limpa.
4. Revise os backups e descarte os que não forem confiáveis.
5. Verifique a conta Google e os dispositivos conectados.

O upload ilimitado depende de uma integração não oficial com a API do Pixel e
pode contrariar os termos do Google, resultando em bloqueio da conta. Use por
sua conta e risco.

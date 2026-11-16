# GP-EndlessPix

**Um servidor privado de uploads para o Google Photos.**

Instale em uma VPS, publique uma URL e envie fotos e vídeos de qualquer
dispositivo. O navegador só precisa de internet; o upload ao Google é feito pelo
seu servidor.

<p align="center">
  <img src="docs/assets/cover.png" alt="GP-EndlessPix: interface web para envio de fotos e vídeos ao Google Photos" width="100%">
</p>

<p align="center">
  <a href="docs/INSTALACAO.md"><strong>Instalação</strong></a> ·
  <a href="docs/OPERACAO.md">Operação</a> ·
  <a href="docs/ARQUITETURA.md">Arquitetura</a> ·
  <a href="docs/SEGURANCA.md">Segurança</a> ·
  <a href="docs/FAQ.md">FAQ</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/licen%C3%A7a-GPL--3.0-3b82f6" alt="Licença GPL-3.0">
  <img src="https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white" alt="Python 3.12">
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white" alt="Docker Compose">
  <img src="https://img.shields.io/badge/HTTPS-Caddy-1f9d55" alt="HTTPS com Caddy">
</p>

> **Aviso:** o gotohp emula um aparelho Pixel para usar o backup "ilimitado" do
> Google Photos. Isso contraria os termos do Google e pode fazer a conta ser
> bloqueada. Teste primeiro com uma conta secundária. O projeto não é afiliado
> ao Google.

---

## Visão geral

O GP-EndlessPix é uma aplicação web **auto-hospedada**. Na prática, ele
transforma uma VPS em um servidor particular de uploads:

1. você instala o projeto na VPS;
2. aponta um domínio para o servidor;
3. o Caddy publica o app em HTTPS;
4. qualquer navegador com a senha consegue abrir a interface e enviar arquivos.

Não existe um servidor central da Oficina do Berg nem compartilhamento de
contas. Cada pessoa roda a própria instância, com a própria senha, o próprio
banco e a própria conta Google.

O caminho recomendado de hospedagem é uma **VPS Linux comum**. O guia também
inclui uma seção opcional para sandboxes Instabox, útil apenas para testes.

---

## Hospedagem

A hospedagem é o que transforma o projeto em um serviço acessível de qualquer
lugar. O app não roda no seu computador: ele fica ligado na VPS, atrás de um
domínio, e o navegador apenas consome a interface.

| Camada | Papel |
|---|---|
| **VPS** | Mantém o app, o banco, o token e os temporários |
| **Domínio** | Dá um endereço estável, como `fotos.seudominio.com` |
| **Caddy** | Emite e renova o certificado HTTPS automaticamente |
| **Docker** | Empacota o app e reinicia os containers após falhas |
| **Volume** | Preserva histórico e credenciais entre atualizações |

Na prática, você contrata uma VPS, instala o projeto uma vez e aponta o DNS.
Depois disso, a URL fica disponível enquanto a VPS estiver ligada. O upload pode
ser feito do celular, do tablet ou de outro computador, em qualquer rede — não é
necessário estar perto do servidor nem instalar um aplicativo.

Só as portas **80 e 443** ficam públicas. A porta interna do app não é exposta.

---

## Como funciona

```text
Navegador (celular, tablet ou PC)
        │  HTTPS
        ▼
Caddy na sua VPS (443)
        │  proxy interno
        ▼
GP-EndlessPix (8000, interno)
        │
        ├─ salva o arquivo temporariamente
        ├─ registra o job no SQLite
        └─ worker chama o gotohp-cli
                │
                ▼
        Google Photos
                │
                └─ o temporário é apagado após o sucesso
```

- O navegador é só a interface. Quem envia ao Google é o `gotohp` rodando no
  servidor.
- Um worker processa a fila, um arquivo por vez, com até 3 tentativas.
- Se o arquivo já existir no Google Photos, o gotohp marca como "skipped" e o
  app trata como sucesso.
- O nome original e a data de modificação do arquivo são preservados.
- Upload concluído apaga o temporário. Upload com erro **mantém** o arquivo
  para o botão **Reenviar** do histórico funcionar.
- Depois que o arquivo chega ao servidor, o envio continua mesmo se você fechar
  a aba do navegador.

Stack: Python 3.12, FastAPI, SQLite, React 19, Vite 8, Tailwind CSS 4 e
`gotohp-cli` v0.11.0.

---

## Interface

<p align="center">
  <img src="docs/assets/screenshot-upload.png" alt="Tela de envio com fila de uploads" width="49%">
  <img src="docs/assets/screenshot-history.png" alt="Histórico de arquivos enviados" width="49%">
</p>

A interface tem três áreas:

- **Enviar** — arraste arquivos, selecione uma pasta ou cole do clipboard.
- **Histórico** — acompanhe enviados, erros e reenvios.
- **Conta** — conecte, troque ou remova a conta Google ativa.

---

## Recursos

| Recurso | Detalhe |
|---|---|
| URL própria | Acesso por domínio e HTTPS automático via Caddy |
| Upload remoto | Funciona de qualquer navegador, sem instalar cliente |
| Fila resiliente | Pausa, cancelamento, retry e recuperação após reinício |
| Histórico | Banco SQLite local com status, tamanho e data |
| Dados sob seu controle | Token, banco e temporários ficam na sua VPS |
| Deploy reproduzível | Docker Compose, healthcheck e volume persistente |
| x86_64 e ARM64 | Binário do gotohp selecionável no build |
| Uso pessoal | Uma senha de site e uma conta Google por instalação |

---

## Começar rápido

### Requisitos

- VPS Linux x86_64 com 1 GB+ de RAM
- 20 GB+ de disco para fotos (40 GB+ para vídeos)
- Docker Engine + Docker Compose v2
- Domínio com registro **A** apontando para a VPS
- Portas 80 e 443 liberadas

### Deploy

```bash
git clone https://github.com/Oficina-do-Berg/GP-EndlessPix.git
cd GP-EndlessPix
cp .env.example .env
nano .env
chmod +x deploy.sh scripts/*.sh
./deploy.sh
```

No `.env`, ajuste pelo menos:

```dotenv
APP_PASSWORD=uma-senha-longa-e-unica
DOMAIN=fotos.seudominio.com
COOKIE_SECURE=1
DRY_RUN=0
```

Depois abra `https://fotos.seudominio.com`, entre com a senha e conecte a conta
Google em **Conta → Conectar outra conta**.

O passo a passo completo, incluindo DNS, firewall, migração de dados,
Cloudflare, ARM e a seção opcional do Instabox, está em
**[Instalação](docs/INSTALACAO.md)**.

---

## Documentação

| Página | Conteúdo |
|---|---|
| [**Instalação**](docs/INSTALACAO.md) | Requisitos, VPS, DNS, `.env`, deploy, token do Google, migração, Cloudflare, ARM e Instabox |
| [**Operação**](docs/OPERACAO.md) | Atualização, logs, saúde, backup, restauração e problemas comuns |
| [**Arquitetura**](docs/ARQUITETURA.md) | Componentes, fluxo da fila, banco, API e decisões de projeto |
| [**Segurança**](docs/SEGURANCA.md) | Modelo de acesso, token, backups, checklist e resposta a incidentes |
| [**FAQ**](docs/FAQ.md) | Domínio, acesso remoto, armazenamento, contas, limites e termos do Google |

---

## Segurança e limites

- Use **HTTPS** e `COOKIE_SECURE=1` em produção.
- Use uma senha longa e única; o site fica exposto na internet.
- O `oauth_token` vale como senha da conta Google. Nunca o exponha.
- O backup do volume contém o token: guarde-o como um segredo.
- Uma instalação atende **um usuário e uma conta Google por vez**.
- O app não apaga nada do Google Photos.
- O uso do gotohp pode violar os termos do Google e resultar em bloqueio.

Leia o [guia de segurança](docs/SEGURANCA.md) antes de colocar dados reais em
produção.

---

## Licença

Distribuído sob a GNU General Public License v3.0. Veja [LICENSE](LICENSE).

Google Photos é uma marca do Google. Este projeto é independente e não possui
vínculo com a empresa.

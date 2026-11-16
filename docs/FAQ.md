# Perguntas frequentes

<details>
<summary><strong>O que é o GP-EndlessPix?</strong></summary>

É uma aplicação web que você instala na sua própria VPS para enviar fotos e
vídeos ao Google Photos pelo navegador. O upload é processado pelo servidor,
usando o `gotohp-cli`, e o histórico fica no seu banco local.
</details>

<details>
<summary><strong>Preciso de um domínio?</strong></summary>

Para produção, sim. O Caddy usa o domínio para emitir o certificado HTTPS
automático. Para testes locais, você pode usar `127.0.0.1` e
`COOKIE_SECURE=0`. Em uma VPS sem domínio, também é possível testar com
`DOMAIN=:80`, mas o acesso ficará em HTTP e não deve ser usado com dados reais.
</details>

<details>
<summary><strong>Consigo acessar de qualquer lugar do mundo?</strong></summary>

Sim. Depois do deploy, o app fica disponível em uma URL HTTPS pública. Qualquer
navegador com acesso à internet pode abrir a interface, desde que tenha a senha
do site. Não é necessário estar na mesma rede da VPS.
</details>

<details>
<summary><strong>As fotos ficam armazenadas na VPS?</strong></summary>

Apenas temporariamente. O arquivo é recebido em `data/tmp`, enviado ao Google
Photos e apagado após o sucesso. Em caso de erro, ele é mantido para permitir o
botão **Reenviar**. O app não é um backup local do seu acervo.
</details>

<details>
<summary><strong>O upload vai direto do celular para o Google?</strong></summary>

Não. O navegador envia o arquivo para a sua VPS; o worker do servidor faz o
upload para o Google. Isso permite usar o app de qualquer dispositivo sem
instalar nada e mantém a credencial da conta no servidor.
</details>

<details>
<summary><strong>Quantas pessoas podem usar?</strong></summary>

Uma instalação atende **um usuário e uma conta Google por vez**. Não há cadastro
de usuários, perfis ou separação de permissões. Para outra pessoa, o ideal é
fazer outra instalação.
</details>

<details>
<summary><strong>Posso usar minha conta principal?</strong></summary>

Você pode, mas o recomendado é testar primeiro com uma conta secundária. O
gotohp emula um aparelho Pixel para usar o backup "ilimitado"; isso contraria os
termos do Google e pode resultar em bloqueio da conta. Use por sua conta e risco.
</details>

<details>
<summary><strong>O que acontece se a VPS reiniciar?</strong></summary>

Os containers usam `restart: unless-stopped` e os dados ficam no volume
`photosweb_data`. Jobs que estavam `uploading` voltam para a fila na próxima
inicialização. O histórico e a conta conectada são preservados.
</details>

<details>
<summary><strong>E se o token do Google expirar?</strong></summary>

Gere um novo `oauth_token` pelo Embedded Setup e conecte a conta novamente no
painel **Conta**. O app também aceita um `GOTOHP_PROXY` para casos em que o IP
do datacenter recebe desafios do Google.
</details>

<details>
<summary><strong>Por que o Cloudflare limita arquivos grandes?</strong></summary>

O proxy gratuito do Cloudflare limita cada requisição a cerca de 100 MB. Para
vídeos maiores, use **DNS only** (nuvem cinza) ou aumente o limite do plano.
</details>

<details>
<summary><strong>Funciona em VPS ARM?</strong></summary>

Sim, desde que você coloque o binário ARM64 do gotohp em
`bin/gotohp-cli_arm64` e defina `GOTOHP_BUILD_BINARY=bin/gotohp-cli_arm64` no
`.env`. Veja [Instalação](INSTALACAO.md#9-vps-arm64).
</details>

<details>
<summary><strong>O projeto é gratuito?</strong></summary>

O código é aberto e licenciado sob GPL-3.0. Você paga apenas a VPS, o domínio e
eventuais serviços que usar. Não há assinatura, painel central ou cobrança por
upload.
</details>

<details>
<summary><strong>O gotohp é oficial do Google?</strong></summary>

Não. O GP-EndlessPix e o gotohp são projetos independentes e não têm vínculo com
o Google. Google Photos é uma marca do Google.
</details>

<details>
<summary><strong>O app apaga arquivos do Google Photos?</strong></summary>

Não. Ele apenas envia arquivos. A remoção, organização em álbuns e edição
continuam sendo feitas no Google Photos.
</details>

<details>
<summary><strong>Posso enviar pastas inteiras?</strong></summary>

Sim. A interface permite selecionar uma pasta; o navegador envia os arquivos
compatíveis encontrados nela. O limite é por arquivo, definido em
`MAX_UPLOAD_MB`.
</details>

<details>
<summary><strong>O que acontece se eu fechar a aba durante o envio?</strong></summary>

Se o arquivo ainda estiver sendo transferido do navegador para a VPS, o envio é
interrompido. Depois que ele chega ao servidor, o worker continua o upload ao
Google mesmo com a aba fechada.
</details>

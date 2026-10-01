# EspaçoOn

Sistema online para locação de espaço de lazer, com agenda, reserva, contrato eletrônico, pagamento Pix via Asaas e painel administrativo.

## Recursos

- Site público responsivo e mobile-first.
- Galeria e estrutura do clube administráveis pelo painel.
- Calendário dinâmico com bloqueio de datas.
- Reserva de 12h ou 24h com preço calculado no servidor.
- Cadastro de cliente com validação de CPF e telefone.
- Contrato eletrônico com assinatura desenhada.
- Hash SHA-256 calculado no servidor e QR Code interno para verificação.
- Cobrança Pix real via Asaas.
- Confirmação de pagamento por Webhook.
- Reserva temporária da data durante a cobrança.
- Consulta da reserva por código + CPF.
- Comprovante e contrato em PDF.
- Solicitação de visita com confirmação pelo proprietário.
- Painel administrativo protegido por senha.
- Upload de imagens armazenadas no MongoDB GridFS.
- Persistência de reservas, contratos, visitas e configurações no MongoDB.

## Tecnologias

- React 18
- Vite
- Node.js
- Express
- MongoDB / Mongoose
- Asaas API
- jsPDF
- GridFS
- Render

## Variáveis de ambiente

Configure no Render:

```env
MONGODB_URI=
JWT_SECRET=
ASAAS_API_KEY=
ASAAS_ENV=production
ASAAS_WEBHOOK_TOKEN=
```

Requisitos de segurança usados pelo backend:

- `JWT_SECRET`: pelo menos 32 caracteres.
- `ASAAS_API_KEY`: chave de produção iniciando com `$aact_prod_`.
- `ASAAS_WEBHOOK_TOKEN`: pelo menos 32 caracteres.
- `ASAAS_ENV`: `production`.

## Asaas Webhook

Cadastre no Asaas de produção:

```text
POST https://SEU-DOMINIO/api/webhooks/asaas
```

Use o mesmo token definido em `ASAAS_WEBHOOK_TOKEN` e configure envio sequencial.

Eventos utilizados pelo sistema:

- PAYMENT_CONFIRMED
- PAYMENT_RECEIVED
- PAYMENT_REFUNDED
- PAYMENT_DELETED

## Build e execução

```bash
npm install
npm run build
npm start
```

O Express serve o frontend compilado e a API no mesmo domínio.

## Rotas principais

- `/admin` — painel administrativo.
- `/api/health` — verificação básica de disponibilidade.
- `/api/webhooks/asaas` — recebimento de eventos do Asaas.

## Segurança implementada

- Cookies de sessão HTTP-only, Secure e SameSite Strict.
- Rate limiting em login, consulta, assinatura e pagamentos.
- Helmet e Content Security Policy.
- Senhas e chaves mantidas exclusivamente em variáveis de ambiente.
- Validação de Webhook por `asaas-access-token`.
- Idempotência de eventos do Asaas.
- Contratos imutáveis após o primeiro registro.
- Valor da cobrança calculado novamente no servidor.
- Bloqueio atômico de data para reduzir risco de dupla reserva.
- Validação e limitação de uploads de imagem.
- Erros internos não são expostos ao cliente.

## Deploy

O projeto está configurado para funcionar como **Web Service Node** no Render usando:

```text
Build Command: npm install && npm run build
Start Command: npm start
```

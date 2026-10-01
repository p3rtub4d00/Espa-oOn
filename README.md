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
npm ci --include=dev
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
Build Command: npm ci --include=dev && npm run build
Start Command: npm start
```


## Backup automático

O serviço suporta backup lógico diário para um banco MongoDB separado.

Variáveis:

```
BACKUP_MONGODB_URI=
BACKUP_RETENTION_DAYS=14
BACKUP_INTERVAL_HOURS=24
```

Use um cluster/projeto Atlas separado do banco principal. Quando configurado, o serviço cria snapshots lógicos automaticamente e mantém a retenção definida. O endpoint `/api/health` informa se o backup está configurado e a data do último snapshot concluído.

## Privacidade

A página `/privacidade` é pública. Configure o responsável e o canal de contato em Dados do estabelecimento. O roteiro de guarda e atendimento está em [PRIVACY_OPERATIONS.md](PRIVACY_OPERATIONS.md).

### Cláusula de limpeza

Novos contratos incluem a obrigação do locador de entregar o clube limpo e organizado e do locatário de devolvê-lo limpo e organizado ao final da locação. O texto é apresentado antes do aceite, salvo no contrato, incluído na verificação do hash e reproduzido no PDF. Contratos antigos não recebem a cláusula retroativamente e continuam com seu hash original. Após o deploy, atualize abas abertas antes de novas assinaturas. A cláusula não cria taxa de limpeza ou multa automática.

### Indicadores da demonstração

O Master apresenta “Acessos à demonstração” na visão geral: visitas, acessos ao painel, cliques no WhatsApp e reservas simuladas concluídas, com períodos de hoje, últimos 7 dias e mês atual (horário de Manaus). O quadro soma os clubes atualmente em demonstração e não cancelados/excluídos. Atualize pelo botão do quadro. A coleta começa após o deploy e não recupera acessos antigos.

A página pública usa um identificador aleatório em sessionStorage por aba e respeita Do Not Track/Global Privacy Control. Visitas e ações são deduplicadas por sessão/aba, tipo e dia; não são pessoas únicas. Conclusões de reservas são informadas pelo servidor e deduplicadas por reserva. Nomes, CPF, telefone, assinatura, IP, referer e user-agent não são armazenados na coleção de métricas. O Master armazena somente clube, tipo, dia, horários e uma chave HMAC. Os registros expiram após 90 dias por índice TTL; backups podem conservar cópias conforme a política existente. A documentação de privacidade informa essa coleta.

O endpoint público não aceita eventos de conclusão. O envio ao Master usa a licença apenas no servidor; o Master valida novamente que o clube está em demonstração. As consultas de métricas exigem sessão Master. A coleta é auxiliar: bloqueios de navegador, indisponibilidade/reinício dos servidores, bots e testes próprios podem afetar os números. Falhas de métricas não interrompem reservas nem navegação.

Publicação: deploy primeiro do Master e depois do EspaçoOn/piloto. Não exige novas variáveis de ambiente.

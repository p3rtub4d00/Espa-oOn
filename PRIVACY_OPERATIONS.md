# Privacidade do estabelecimento

A Política de Privacidade fica em `/privacidade`, com acesso sem login, e usa dados configurados no painel > Dados do estabelecimento. Informe o responsável pelo tratamento (nome ou razão social), e-mail e/ou telefone para solicitações. Se o telefone de privacidade estiver vazio, a página usa o telefone do estabelecimento. Não são inventados contatos ausentes.

Avisos próximos aos formulários explicam as finalidades de visitas e reservas. Nome/telefone e data sugerida atendem visitas; identificação/CPF/contato, reserva, pagamento e assinatura são usados para o contrato e a operação solicitada. A divulgação do aviso não é consentimento genérico para marketing.

A consulta do próprio cliente usa `POST /api/reservations/lookup`, enviando código e CPF no corpo. A rota GET antiga foi retirada para evitar CPF em URLs/logs de requisição; atualize abas antigas após o deploy. As respostas pessoais e administrativas usam `Cache-Control: no-store`. Esse cabeçalho não apaga cópias baixadas nem impede compartilhamento voluntário.

## Operação e guarda

| Registros | Uso observado | Atenção operacional |
| --- | --- | --- |
| Visitas | Nome, contato, horário e resposta | Rever guarda após concluir o atendimento |
| Reservas e contratos | Identificação, CPF, contatos, endereço informado, valores, período e assinatura | Atender pedidos preservando integridade dos documentos e registros necessários |
| Pagamento | IDs, estados, recibos e dados necessários enviados ao provedor | Conferir a conta recebedora, os acessos e os contratos do provedor |
| Imagens e dados do estabelecimento | Conteúdo publicado no site | Publicar apenas imagens e contatos autorizados para divulgação |
| Notificações | Inscrição do dispositivo e avisos administrativos | Permissão pode ser revogada; avisos podem aparecer na tela bloqueada |

O sistema não apaga automaticamente reservas/contratos, não define por conta própria os prazos legais de guarda e não confirma que backups estão ativos sem configuração. O responsável deve definir a guarda, atender solicitações, verificar os fornecedores/regiões e registrar as providências. Não use o reset administrativo para atender uma solicitação individual de eliminação.

Use acesso administrativo para localizar apenas os registros necessários; confirme a identidade proporcionalmente e responda por canal seguro. Evite solicitar senha ou documentos completos sem necessidade e não altere silenciosamente contratos assinados. Não copie dados de produção para uma demonstração pública.

O roteiro completo e as referências oficiais estão em [PRIVACY_OPERATIONS.md do Master](https://github.com/p3rtub4d00/admespacoon/blob/main/PRIVACY_OPERATIONS.md). A publicação dos avisos e as proteções técnicas desta etapa não certificam adequação integral à LGPD. Depois do deploy, revise a identidade e o canal publicados e confira o indicador de privacidade na ficha do Master.

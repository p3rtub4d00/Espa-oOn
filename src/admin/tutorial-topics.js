export const TUTORIAL_STORAGE_KEY = 'clubeon-admin-tutorial-hidden-v1'
export function shouldShowTutorial(storage) {
  try { return storage.getItem(TUTORIAL_STORAGE_KEY) !== '1' } catch { return true }
}
export const tutorialTopics = [
  { id: 'overview', title: 'Visão geral e primeiros passos', path: 'Visão geral', steps: [
    'Veja o resumo das reservas, pagamentos e próximas visitas. Use os atalhos para abrir os registros completos.',
    'A preparação inicial já mostra o que falta configurar. Preencha os dados do espaço, confira os preços e conecte os recebimentos.',
    'Agenda e Reservas têm acesso direto. Ao escolher Financeiro, Espaço ou Configurações, toque no card da função desejada. No celular, abra Menu; ele fecha ao escolher uma categoria.'
  ] },
  { id: 'establishment', title: 'Dados do clube e privacidade', path: 'Configurações → Estabelecimento', steps: [
    'Preencha nome do espaço, responsável, CPF ou CNPJ, telefone e endereço. Confira os dados antes de salvar: eles identificam o locador nos novos contratos.',
    'Informe os contatos de privacidade para aparecerem na política pública. Mantenha um canal que o cliente consiga usar.',
    'Toque em Salvar dados e aguarde a confirmação. Abra o site para conferir as informações publicadas.'
  ] },
  { id: 'gallery', title: 'Fotos do espaço', path: 'Espaço → Galeria', steps: [
    'Toque em Escolher fotos para enviar imagens do clube. Você pode selecionar várias fotos de uma vez.',
    'Mostre piscina, churrasqueira, cozinha, banheiros e outras áreas com fotos claras que representem o espaço.',
    'Use a opção de apagar na foto para remover imagens antigas. Confira a galeria no site após atualizar.'
  ] },
  { id: 'amenities', title: 'Estrutura disponível', path: 'Espaço → Estrutura', steps: [
    'Cadastre o que o espaço oferece, como piscina, sinuca, freezer, TV ou ar-condicionado.',
    'Use Adicionar item para incluir uma estrutura que ainda não está na lista e preencha sua identificação.',
    'Separe a estrutura incluída no aluguel dos itens cobrados à parte. Itens pagos devem ser cadastrados em Adicionais.'
  ] },
  { id: 'extras', title: 'Itens alugados à parte', path: 'Espaço → Adicionais', steps: [
    'Cadastre nome, descrição, quantidade e preço por unidade dos itens extras, como jogos de mesas ou pula-pula.',
    'Deixe ativos apenas os itens que você oferece. O cliente escolhe a quantidade durante a reserva e o valor entra no total.',
    'Confira os dados e salve as alterações. A seleção do cliente também fica registrada no contrato.'
  ] },
  { id: 'prices', title: 'Preços e horários', path: 'Configurações → Preços', steps: [
    'Revise os valores de aluguel para os períodos e tipos de dia disponíveis na tabela.',
    'Confira os horários de entrada oferecidos aos clientes e mantenha as opções compatíveis com a rotina do espaço.',
    'Salve os valores e faça uma simulação no site para conferir o total antes de divulgar o link.'
  ] },
  { id: 'payments', target: 'overview', title: 'Receber pelo Mercado Pago', path: 'Visão geral → Recebimentos', steps: [
    'No cartão do Mercado Pago, toque em Conectar Mercado Pago e autorize a conta do proprietário.',
    'Volte ao painel e confira o status da conexão. Nas reservas online, o cliente assina o contrato antes de seguir para o pagamento.',
    'O pagamento é processado pelo Mercado Pago na conta conectada. Parcelamento e taxas dependem das condições dessa conta; confira o status pago antes de considerar a reserva quitada.'
  ], demo: 'No modo demonstração, os pagamentos são simulados e não há cobrança real nem conexão de recebimentos.' },
  { id: 'calendar', title: 'Consultar a agenda', path: 'Agenda', steps: [
    'Use as setas para trocar o mês e consulte a legenda das datas.',
    'Toque em uma data com reserva para conferir os detalhes do agendamento e do cliente.',
    'Antes de aceitar um aluguel por outro canal, confira a agenda. Registre a reserva manual para manter o controle das datas.'
  ] },
  { id: 'reservations', title: 'Reservas e comprovantes', path: 'Reservas', steps: [
    'Em Atuais e próximas, consulte os agendamentos e pendências. Reservas encerradas ficam em Ver histórico, com busca por cliente e filtro por mês. Uma reserva pendente não equivale a pagamento confirmado.',
    'Use as ações disponíveis no registro para consultar detalhes e baixar os documentos. O comprovante informa o valor efetivamente registrado como recebido.',
    'Para cancelar, leia a política e confira a situação do pagamento e da devolução. Registrar um cancelamento não comprova que o dinheiro foi devolvido.'
  ] },
  { id: 'manual', target: 'reservations', title: 'Registrar uma reserva manual', path: 'Reservas → Nova reserva manual', steps: [
    'Abra o formulário de reserva manual para um aluguel combinado fora do site.',
    'Informe cliente, data, horário, valor, forma de pagamento e o que já foi recebido. Confira se precisa bloquear a data no calendário.',
    'Toque em Registrar reserva. Mantenha os pagamentos atualizados nas ações do registro; a reserva manual não faz cobrança automática no Mercado Pago.'
  ] },
  { id: 'contracts', title: 'Contratos digitais', path: 'Espaço → Contratos', steps: [
    'Localize o contrato da reserva e confira os dados do cliente, o período, os itens extras e as condições aceitas.',
    'Consulte a assinatura e baixe o contrato quando precisar. Nos contratos novos, os dados do locador vêm do cadastro do espaço.',
    'A assinatura acontece antes do pagamento. Ter um contrato assinado não significa que a reserva já está paga.'
  ] },
  { id: 'visits', title: 'Visitas ao espaço', path: 'Espaço → Visitas', steps: [
    'Veja as solicitações atuais. Você pode confirmar, sugerir outro horário ou recusar informando uma justificativa.',
    'As ações de aviso abrem o WhatsApp com uma mensagem preparada. Confira o destinatário e envie a mensagem; ela não é enviada automaticamente.',
    'Visitas passadas e recusadas ficam em Ver histórico. Os registros são excluídos automaticamente após 90 dias da data da visita, considerando remarcações.'
  ] },
  { id: 'revenue', title: 'Acompanhar o faturamento', path: 'Financeiro → Faturamento', steps: [
    'Escolha o período para consultar os valores e registros exibidos pelo painel.',
    'Confira os status e compare com os recebimentos da sua conta e os pagamentos manuais registrados.',
    'Use o relatório como apoio à gestão. Taxas, transferências e saldo disponível devem ser conferidos também no provedor de pagamento.'
  ] },
  { id: 'branding', title: 'Logo e cores', path: 'Configurações → Marca', steps: [
    'Adicione a identidade do espaço e escolha as cores da marca.',
    'Prefira combinações com contraste para facilitar a leitura dos textos e botões.',
    'Salve as alterações e confira a apresentação no site e no painel.'
  ] },
  { id: 'policies', title: 'Política de cancelamento', path: 'Configurações → Cancelamento', steps: [
    'Revise as condições de cancelamento e devolução apresentadas aos clientes.',
    'Salve o texto com informações claras e compatíveis com a operação do espaço e os direitos aplicáveis.',
    'Alterações são usadas nos novos contratos. Confira as condições aceitas no contrato da reserva antes de tratar um cancelamento.'
  ] },
  { id: 'notifications', title: 'Instalar e ativar notificações', path: 'Configurações → Notificações', steps: [
    'Use Instalar ClubeOn quando o navegador oferecer a instalação. No iPhone, adicione à Tela de Início pelo Safari.',
    'Abra Notificações, toque em Ativar neste dispositivo e permita os avisos no navegador ou celular.',
    'Escolha os tipos de aviso e faça um teste no dispositivo. A permissão é por aparelho e pode precisar ser ativada novamente em outro celular.'
  ] },
  { id: 'system', title: 'Senha e segurança dos dados', path: 'Configurações → Dados', steps: [
    'Para alterar a senha, informe a senha atual e confirme a nova. Se esqueceu a senha, use a recuperação na tela de acesso.',
    'A opção Apagar todos os dados remove registros operacionais do site. Use somente quando tiver certeza e tiver preservado o que precisa.',
    'Mantenha seu acesso protegido. O tutorial não altera dados e pode ser reaberto a qualquer momento.'
  ], demo: 'A demonstração não exige a senha do proprietário e não exibe a opção de alterar essa senha.' },
  { id: 'ai', target: 'overview', title: 'Assistente IA no site', path: 'Site do clube → Chat do Clubi', steps: [
    'Quando habilitado para o clube, o Clubi responde dúvidas com base nas informações públicas cadastradas e consulta a disponibilidade.',
    'Mantenha estrutura, fotos, preços e itens extras atualizados para ajudar o cliente a encontrar informações corretas.',
    'A IA orienta o cliente até o calendário; a reserva, a assinatura e o pagamento são concluídos pelo fluxo do site. A habilitação e os limites do chat são administrados pela equipe ClubeOn.'
  ] },
]

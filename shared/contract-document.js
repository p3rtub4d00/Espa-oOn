import { CLEANING_CLAUSE_TEXT } from './contract-terms.js'

export const CONTRACT_VERSION = '2026-10-06-v1'
export function contractDocument(settings = {}) {
  const e = settings.establishment || {}
  const landlord = Object.fromEntries(['name', 'ownerName', 'document', 'phone', 'address', 'city', 'state'].map(key => [key, String(e[key] || '').trim()]))
  return {
    version: CONTRACT_VERSION,
    landlord,
    clauses: [
      { title: '1. Objeto.', body: `O presente instrumento registra a locação temporária do espaço de lazer ${landlord.name || 'ClubeOn'}, no endereço, datas e horários indicados neste documento, incluindo os adicionais discriminados na reserva.` },
      { title: '2. Uso e entrega do espaço.', body: 'O locador deverá disponibilizar o espaço e os adicionais contratados em condições adequadas de uso. O locatário deverá utilizar as estruturas de forma responsável, observando as regras informadas antes da contratação. Eventuais alterações da data ou dos itens contratados dependem de concordância das partes.' },
      { title: '3. Responsabilidade e vistoria.', body: 'O locatário responde pelos danos comprovadamente causados por uso inadequado durante a locação, excluído o desgaste natural. Eventuais danos deverão ser documentados, com oportunidade de manifestação do locatário. Esta cláusula não afasta a responsabilidade do locador por defeitos, falta de manutenção ou falhas na prestação do serviço.' },
      { title: '4. Pagamento e confirmação.', body: 'O valor total inclui o aluguel e os adicionais discriminados. A assinatura antecede o pagamento e não confirma, por si só, a reserva. A confirmação depende do recebimento e da disponibilidade validada pelo sistema. Em caso de pagamento sem confirmação da reserva, o estabelecimento deverá comunicar o cliente e solucionar a situação, inclusive mediante devolução quando cabível.' },
      { title: '5. Cancelamento e reembolso.', body: String(settings.cancellationPolicy?.text || '') },
      { title: '6. Assinatura eletrônica.', body: 'As partes admitem a assinatura eletrônica utilizada neste fluxo. O sistema registra o aceite, a imagem da assinatura, a versão do documento, a data e hora do registro no servidor e o hash SHA-256 para conferência de integridade. A assinatura desenhada não equivale a certificação ICP-Brasil.' },
      { title: '7. Limpeza e devolução do espaço.', body: CLEANING_CLAUSE_TEXT },
      { title: '8. Direitos legais e indisponibilidade.', body: 'A política de cancelamento não limita direitos assegurados pela legislação, inclusive o direito de arrependimento quando aplicável. Se o locador não puder disponibilizar o espaço nas condições contratadas, deverá informar o cliente e oferecer solução compatível com seus direitos; a remarcação depende de sua concordância. Não serão impostas taxas adicionais que não tenham sido previamente informadas e aceitas.' },
    ],
  }
}

export function documentRows(landlord) {
  if (!landlord) return []
  return [
    ['Locador / responsável', landlord.ownerName || landlord.name || 'Não informado'],
    ['CPF/CNPJ do locador', landlord.document || 'Não informado'],
    ['Endereço do espaço', [landlord.address, landlord.city, landlord.state].filter(Boolean).join(' · ') || 'Não informado'],
    ['Contato do locador', landlord.phone || 'Não informado'],
  ]
}

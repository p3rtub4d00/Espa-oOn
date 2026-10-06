import { jsPDF } from 'jspdf'
import { documentRows } from '../../shared/contract-document.js'

function money(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0))
}

function addWrappedText(doc, text, x, y, width, lineHeight = 6) {
  const lines = doc.splitTextToSize(String(text), width)
  for (const line of lines) {
    if (y > 277) { doc.addPage(); y = 20 }
    doc.text(line, x, y)
    y += lineHeight
  }
  return y
}

function writeRows(doc, rows, y) {
  for (const [label, value] of rows) {
    const labels = doc.splitTextToSize(label + ':', 42)
    const values = doc.splitTextToSize(String(value), 122)
    const height = Math.max(labels.length, values.length) * 5 + 3
    if (y + height > 279) { doc.addPage(); y = 20 }
    doc.setFont('helvetica', 'bold')
    doc.text(labels, 20, y)
    doc.setFont('helvetica', 'normal')
    y = Math.max(y + labels.length * 5, addWrappedText(doc, value, 66, y, 122, 5)) + 3
  }
  return y
}
function addVerification(doc, contract, y) {
  if (!contract?.id || !contract?.hash) return y
  if (y > 260) { doc.addPage(); y = 20 }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30)
  y = addWrappedText(doc, 'Código de conferência do contrato: ' + contract.id, 20, y, 170, 5)
  if (typeof window !== 'undefined') {
    const url = window.location.origin + '/api/contracts/' + encodeURIComponent(contract.id) + '/verify?hash=' + encodeURIComponent(contract.hash)
    doc.textWithLink('Conferir o registro do contrato no ClubeOn', 20, y, { url })
    y += 7
  }
  return y
}

function finishPages(doc) {
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110)
    doc.text(`ClubeOn · Página ${page} de ${pages}`, 20, 289)
  }
}
function dateTime(value) {
  return value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Porto_Velho' }) + ' (horário de Porto Velho)' : 'Não informado'
}
export function receiptFacts(reservation) {
  const demo = reservation.paymentMethod === 'demo' || reservation.paymentProvider === 'demo'
  const total = Math.max(0, Number(reservation.price) || 0)
  const paid = demo ? 0 : reservation.paymentStatus === 'paid' ? total : Math.max(0, Number(reservation.amountPaid) || 0)
  const method = ({ pix: 'Pix', card: 'Cartão de crédito', demo: 'Simulação', cash: 'Dinheiro', transfer: 'Transferência bancária', other: 'Outro meio informado pelo estabelecimento' })[reservation.paymentMethod] || 'Não informado'
  return { demo, total, paid, balance: Math.max(0, total - paid), method }
}

export function createReceiptPdf(reservation, contract, establishmentName = '') {
  const doc = new jsPDF()
  const paidAt = dateTime(reservation.paidAt)
  const facts = receiptFacts(reservation)
  const spaceName = contract?.documentSnapshot?.landlord?.name || contract?.establishmentName || establishmentName || 'ClubeOn'

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  const headingY = addWrappedText(doc, spaceName, 20, 22, 170, 8) + 4

  doc.setFontSize(14)
  const bodyY = addWrappedText(doc, facts.demo ? 'SIMULAÇÃO - SEM PAGAMENTO REAL' : facts.paid > 0 ? 'Comprovante de pagamento da reserva' : 'Resumo da reserva - pagamento não confirmado', 20, headingY, 170, 7) + 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  let y = bodyY
  const rows = [
    ...documentRows(contract?.documentSnapshot?.landlord),
    ['Reserva', reservation.id],
    ['Cliente', reservation.customer?.name || '-'],
    ['Data da locação', reservation.date || '-'],
    ['Período', reservation.period || '-'],
    ['Horário', reservation.startTime
      ? reservation.startTime + ' às ' + (reservation.endTime || '-') +
        (reservation.endDateISO && reservation.endDateISO !== reservation.dateISO ? ' • dia seguinte' : '')
      : '-'],
    ['Aluguel do espaço', money(reservation.basePrice || contract?.basePrice || reservation.price)],
    ...(Array.isArray(reservation.extras) && reservation.extras.length
      ? reservation.extras.map((item) => [
          'Adicional',
          item.quantity + '× ' + item.name + ' — ' + money(item.subtotal),
        ])
      : []),
    ...(Number(reservation.extrasTotal || contract?.extrasTotal || 0) > 0
      ? [['Total adicionais', money(reservation.extrasTotal || contract?.extrasTotal)]]
      : []),
    ['Valor total', money(reservation.price)],
    ['Valor recebido', money(facts.paid)],
    ['Saldo da reserva', money(facts.balance)],
    ['Meio de pagamento', facts.method],
    ['Situação', facts.demo ? 'Simulação sem cobrança' : reservation.paymentStatus === 'paid' ? 'Pagamento confirmado' : facts.paid > 0 ? 'Pagamento parcial informado pelo estabelecimento' : 'Aguardando confirmação'],
    ['Processador / registro', reservation.paymentProvider || 'Não informado'],
    ['Referência da transação', reservation.providerPaymentId || reservation.asaasPaymentId || 'Não informada'],
    ...(reservation.cancellation ? [['Reserva cancelada em', dateTime(reservation.cancellation.cancelledAt)], ['Devolução prevista', money(reservation.cancellation.refundAmount)], ['Situação da devolução', reservation.cancellation.refundStatus === 'recorded' ? 'Devolução registrada pelo estabelecimento' : reservation.cancellation.refundStatus === 'pending' ? 'Pendente - ainda não comprova devolução' : 'Sem devolução registrada']] : []),
    ['Confirmado em', paidAt],
    ['Contrato', contract?.id || reservation.contractId || '-'],
  ]

  y = writeRows(doc, rows, y)

  y += 8
  doc.setFontSize(9)
  doc.setTextColor(90)
  y = addWrappedText(
    doc,
    facts.demo ? 'Documento de demonstração. Não houve recebimento nem quitação.' : 'Registro emitido pelo estabelecimento ' + spaceName + '. A quitação se limita ao valor recebido indicado neste documento. Pagamentos manuais são informados pelo estabelecimento; pagamentos online decorrem da confirmação do processador. Este documento não substitui documento fiscal quando exigível.',
    20,
    y,
    170,
    5,
  )

  addVerification(doc, contract, y + 7)
  finishPages(doc)
  return doc
}

export function createContractPdf(contract, establishmentName = '') {
  const doc = new jsPDF()
  const spaceName = contract?.documentSnapshot?.landlord?.name || contract?.establishmentName || establishmentName || 'ClubeOn'
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  const headingY = addWrappedText(doc, spaceName, 20, 20, 170, 8) + 4
  doc.setFontSize(14)
  const bodyY = addWrappedText(doc, 'Contrato de locação do espaço de lazer', 20, headingY, 170, 7) + 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  let y = bodyY

  const meta = [
    ...documentRows(contract.documentSnapshot?.landlord),
    ...(contract.demoMode ? [['Ambiente', 'DEMONSTRAÇÃO - SEM COBRANÇA REAL']] : []),
    ['Contrato', contract.id],
    ['Reserva', contract.reservationId],
    ['Locatário', contract.customer?.name || '-'],
    ['CPF', contract.customer?.cpf || '-'],
    ...(contract.documentSnapshot ? [['Contato do locatário', contract.customer?.phone || 'Não informado'], ['Endereço do locatário', contract.customer?.address || 'Não informado']] : []),
    ['Data', contract.reservationDate || '-'],
    ['Período', contract.period || '-'],
    ['Horário', contract.startTime
      ? contract.startTime + ' às ' + (contract.endTime || '-') +
        (contract.endDateISO && contract.endDateISO !== contract.reservationDateISO ? ' • dia seguinte' : '')
      : '-'],
    ['Aluguel do espaço', money(contract.basePrice || contract.price)],
    ...(Array.isArray(contract.extras) && contract.extras.length
      ? contract.extras.map((item) => [
          'Adicional',
          item.quantity + '× ' + item.name + ' — ' + money(item.subtotal),
        ])
      : []),
    ...(Number(contract.extrasTotal || 0) > 0
      ? [['Total adicionais', money(contract.extrasTotal)]]
      : []),
    ['Valor total', money(contract.price)],
    ['Assinado em', dateTime(contract.acceptedAt || contract.signedAt)],
    ...(contract.documentSnapshot ? [['Versão do documento', contract.documentSnapshot.version]] : []),
    ['Hash', contract.hash || '-'],
  ]

  y = writeRows(doc, meta, y)

  y += 4
  const clauses = contract.documentSnapshot?.clauses ? contract.documentSnapshot.clauses.map(({title, body}) => [title, body]) : [
    ['1. Objeto.', 'O presente instrumento registra a locação temporária do espaço de lazer ' + spaceName + ', na data e período informados acima.'],
    ['2. Uso do espaço.', 'O locatário declara estar ciente de que deverá utilizar o imóvel e suas estruturas de forma responsável, observando as regras apresentadas pelo proprietário.'],
    ['3. Responsabilidade.', 'O locatário responde pelo uso adequado do espaço e por danos ao patrimônio que forem comprovadamente causados durante o período da locação.'],
    ['4. Pagamento.', 'O valor indicado neste documento é cobrado por meio eletrônico disponibilizado pelo estabelecimento, e a reserva é confirmada após a confirmação eletrônica do recebimento.'],
    ['5. Cancelamento e reembolso.', contract.cancellationPolicyText || 'A política de cancelamento registrada no momento da assinatura integra este contrato.'],
    ['6. Assinatura eletrônica.', 'O sistema registra manifestação de aceite, assinatura desenhada, data e hora, identificador do documento e hash SHA-256 calculado no servidor para verificação de integridade.'],
  ]

  if (!contract.documentSnapshot && contract.cleaningClauseText) {
    clauses.push(['7. Limpeza e devolução do espaço.', contract.cleaningClauseText])
  }

  clauses.forEach(([title, body]) => {
    if (y > 250) {
      doc.addPage()
      y = 20
    }
    doc.setFont('helvetica', 'bold')
    y = addWrappedText(doc, title, 20, y, 170, 5)
    doc.setFont('helvetica', 'normal')
    y = addWrappedText(doc, body, 20, y + 1, 170, 5) + 5
  })

  if (contract.signature) {
    if (y > 220) {
      doc.addPage()
      y = 20
    }
    doc.setFont('helvetica', 'bold')
    doc.text('Assinatura registrada', 20, y + 4)
    try {
      doc.addImage(contract.signature, 'PNG', 20, y + 10, 75, 28)
      doc.setFont('helvetica', 'normal')
      addWrappedText(doc, contract.customer?.name || 'Locatário', 20, y + 44, 170, 5)
      y += 55
    } catch {
      doc.setFont('helvetica', 'normal')
      doc.text('Assinatura armazenada no sistema.', 20, y + 12)
    }
  }

  addVerification(doc, contract, y + 7)
  finishPages(doc)
  return doc
}

export function pdfToFile(doc, filename) {
  const blob = doc.output('blob')
  return new File([blob], filename, { type: 'application/pdf' })
}

export function downloadPdf(doc, filename) {
  doc.save(filename)
}

export function normalizeWhatsApp(phone = '') {
  const digits = String(phone).replace(/\D/g, '')
  if (!digits) return ''
  return digits.startsWith('55') ? digits : '55' + digits
}

export function buildPaymentMessage(reservation, contract, establishmentName = '') {
  const spaceName = establishmentName || contract?.establishmentName || 'ClubeOn'
  return [
    'Olá, ' + (reservation.customer?.name || 'cliente') + '!',
    '',
    'Seu pagamento no ' + spaceName + ' foi confirmado.',
    'Reserva: ' + reservation.id,
    'Data: ' + reservation.date,
    'Período: ' + reservation.period,
    'Horário: ' + (reservation.startTime
      ? reservation.startTime + ' às ' + (reservation.endTime || '-') +
        (reservation.endDateISO && reservation.endDateISO !== reservation.dateISO ? ' • dia seguinte' : '')
      : '-'),
    'Valor: ' + money(reservation.price),
    'Contrato: ' + (contract?.id || reservation.contractId || '-'),
    '',
    'Guarde o código da reserva para consultar seus dados posteriormente no ' + spaceName + '.',
  ].join('\n')
}

export async function sharePaymentDocuments(reservation, contract, establishmentName = '') {
  const spaceName = establishmentName || contract?.establishmentName || 'ClubeOn'
  const receiptDoc = createReceiptPdf(reservation, contract, spaceName)
  const contractDoc = createContractPdf(contract, spaceName)
  const receiptName = 'comprovante-' + reservation.id + '.pdf'
  const contractName = 'contrato-' + contract.id + '.pdf'
  const receiptFile = pdfToFile(receiptDoc, receiptName)
  const contractFile = pdfToFile(contractDoc, contractName)
  const message = buildPaymentMessage(reservation, contract, spaceName)

  if (navigator.share && navigator.canShare?.({ files: [receiptFile, contractFile] })) {
    try {
      await navigator.share({
        title: spaceName + ' - Reserva ' + reservation.id,
        text: message,
        files: [receiptFile, contractFile],
      })
      return { method: 'share' }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        // fall through to download + WhatsApp
      } else {
        return { method: 'cancelled' }
      }
    }
  }

  downloadPdf(receiptDoc, receiptName)
  downloadPdf(contractDoc, contractName)

  const number = normalizeWhatsApp(reservation.customer?.phone)
  if (number) {
    window.open(
      'https://wa.me/' + number + '?text=' + encodeURIComponent(message),
      '_blank',
      'noopener,noreferrer',
    )
  }

  return { method: 'download-whatsapp' }
}

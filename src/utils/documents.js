import { jsPDF } from 'jspdf'

function money(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0))
}

function addWrappedText(doc, text, x, y, width, lineHeight = 6) {
  const lines = doc.splitTextToSize(text, width)
  doc.text(lines, x, y)
  return y + lines.length * lineHeight
}

export function createReceiptPdf(reservation, contract, establishmentName = '') {
  const doc = new jsPDF()
  const paidAt = reservation.paidAt ? new Date(reservation.paidAt).toLocaleString('pt-BR') : '-'
  const spaceName = establishmentName || contract?.establishmentName || 'ClubeOn'

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(spaceName, 20, 22)

  doc.setFontSize(14)
  doc.text('Comprovante de pagamento', 20, 34)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  let y = 48
  const rows = [
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
    ['Pagamento', reservation.paymentMethod === 'card' ? 'Confirmado via cartão de crédito' : 'Confirmado via Pix'],
    ['Confirmado em', paidAt],
    ['Contrato', contract?.id || reservation.contractId || '-'],
  ]

  rows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold')
    doc.text(label + ':', 20, y)
    doc.setFont('helvetica', 'normal')
    doc.text(String(value), 66, y)
    y += 8
  })

  y += 8
  doc.setFontSize(9)
  doc.setTextColor(90)
  addWrappedText(
    doc,
    'Este comprovante foi gerado pelo ' + spaceName + ' a partir da confirmação eletrônica do pagamento da reserva.',
    20,
    y,
    170,
    5,
  )

  return doc
}

export function createContractPdf(contract, establishmentName = '') {
  const doc = new jsPDF()
  const spaceName = establishmentName || contract?.establishmentName || 'ClubeOn'
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(spaceName, 20, 20)
  doc.setFontSize(14)
  doc.text('Contrato de locação do espaço de lazer', 20, 31)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  let y = 45

  const meta = [
    ['Contrato', contract.id],
    ['Reserva', contract.reservationId],
    ['Locatário', contract.customer?.name || '-'],
    ['CPF', contract.customer?.cpf || '-'],
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
    ['Assinado em', contract.signedAt ? new Date(contract.signedAt).toLocaleString('pt-BR') : '-'],
    ['Hash', contract.hash || '-'],
  ]

  meta.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold')
    doc.text(label + ':', 20, y)
    doc.setFont('helvetica', 'normal')
    const lines = doc.splitTextToSize(String(value), 125)
    doc.text(lines, 60, y)
    y += Math.max(8, lines.length * 5 + 2)
  })

  y += 4
  const clauses = [
    ['1. Objeto.', 'O presente instrumento registra a locação temporária do espaço de lazer ' + spaceName + ', na data e período informados acima.'],
    ['2. Uso do espaço.', 'O locatário declara estar ciente de que deverá utilizar o imóvel e suas estruturas de forma responsável, observando as regras apresentadas pelo proprietário.'],
    ['3. Responsabilidade.', 'O locatário responde pelo uso adequado do espaço e por danos ao patrimônio que forem comprovadamente causados durante o período da locação.'],
    ['4. Pagamento.', 'O valor indicado neste documento é cobrado por meio eletrônico disponibilizado pelo estabelecimento, e a reserva é confirmada após a confirmação eletrônica do recebimento.'],
    ['5. Cancelamento e reembolso.', contract.cancellationPolicyText || 'A política de cancelamento registrada no momento da assinatura integra este contrato.'],
    ['6. Assinatura eletrônica.', 'O sistema registra manifestação de aceite, assinatura desenhada, data e hora, identificador do documento e hash SHA-256 calculado no servidor para verificação de integridade.'],
  ]

  clauses.forEach(([title, body]) => {
    if (y > 250) {
      doc.addPage()
      y = 20
    }
    doc.setFont('helvetica', 'bold')
    doc.text(title, 20, y)
    doc.setFont('helvetica', 'normal')
    y = addWrappedText(doc, body, 20, y + 6, 170, 5) + 5
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
      doc.text(contract.customer?.name || 'Locatário', 20, y + 44)
    } catch {
      doc.setFont('helvetica', 'normal')
      doc.text('Assinatura armazenada no sistema.', 20, y + 12)
    }
  }

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

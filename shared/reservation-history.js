const validDay = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const date = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
const validTime = (value) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '')
export function reservationDay(reservation) {
  if (validDay(reservation.dateISO)) return reservation.dateISO
  const match = String(reservation.date || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  const day = match && `${match[3]}-${match[2]}-${match[1]}`
  return validDay(day) ? day : ''
}
export function reservationEnd(reservation) {
  if (validDay(reservation.endDateISO) && validTime(reservation.endTime)) {
    return Date.parse(`${reservation.endDateISO}T${reservation.endTime}:00-04:00`)
  }
  const day = reservationDay(reservation)
  if (!day) return Infinity // Preserve malformed legacy records for review.
  if (validTime(reservation.startTime) && ['12h', '24h'].includes(reservation.period)) {
    return Date.parse(`${day}T${reservation.startTime}:00-04:00`) + (reservation.period === '24h' ? 24 : 12) * 3600000
  }
  // Legacy records without a time remain visible until the end of the rental day.
  return Date.parse(`${day}T00:00:00-04:00`) + (reservation.period === '24h' ? 48 : 24) * 3600000
}
export function reservationAttention(reservation) {
  if (reservation.cancellation?.refundStatus === 'pending' && Number(reservation.cancellation?.refundAmount) > 0) return 'Devolução pendente'
  if (reservation.reservationStatus === 'cancelled' || ['cancelled', 'refunded', 'expired'].includes(reservation.paymentStatus)) return ''
  if (reservation.source === 'manual' && ['manual-pending', 'manual-deposit'].includes(reservation.paymentStatus) && Number(reservation.price) > Number(reservation.amountPaid || 0)) return 'Saldo pendente'
  if (['manual-review', 'confirmed-asaas'].includes(reservation.paymentStatus)) return 'Conferência pendente'
  return ''
}
export function reservationGroups(reservations, now = new Date()) {
  const current = [], history = []
  for (const reservation of reservations) {
    const terminal = reservation.reservationStatus === 'cancelled' || ['cancelled', 'refunded', 'expired'].includes(reservation.paymentStatus)
    ;((terminal || reservationEnd(reservation) <= now.getTime()) && !reservationAttention(reservation) ? history : current).push(reservation)
  }
  current.sort((a, b) => reservationDay(a).localeCompare(reservationDay(b)) || String(a.startTime || '').localeCompare(String(b.startTime || '')))
  history.sort((a, b) => reservationDay(b).localeCompare(reservationDay(a)))
  return { current, history }
}
export function filterReservationHistory(reservations, query = '', month = '') {
  const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const search = normalize(query.trim())
  return reservations.filter((r) => (!month || reservationDay(r).startsWith(month)) && (!search || normalize([r.customer?.name, r.customer?.phone, r.id].join(' ')).includes(search)))
}

import { reservationEnd } from './reservation-history.js'
export function canReschedule(r, now = new Date()) {
  return r && r.reservationStatus !== 'cancelled' && (r.paymentStatus === 'paid' || (r.source === 'manual' && ['manual-pending','manual-deposit'].includes(r.paymentStatus))) && reservationEnd(r) > now.getTime()
}

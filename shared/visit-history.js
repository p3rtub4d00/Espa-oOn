export const VISIT_RETENTION_DAYS = 90
export function clubToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Porto_Velho', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const value = (type) => parts.find((part) => part.type === type).value
  return `${value('year')}-${value('month')}-${value('day')}`
}
export function visitDate(visit) {
  for (const value of [visit.confirmedDate, visit.requestedDate, visit.date]) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) continue
    const parsed = new Date(`${value}T00:00:00Z`)
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value) return value
  }
  return ''
}
export function visitCutoff(now = new Date()) {
  const day = new Date(`${clubToday(now)}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() - VISIT_RETENTION_DAYS)
  return day.toISOString().slice(0, 10)
}
export function visitGroups(visits, today = clubToday()) {
  const current = [], history = []
  for (const visit of visits) {
    const date = visitDate(visit)
    ;(visit.status === 'rejected' || (date && date < today) ? history : current).push(visit)
  }
  const key = (visit) => visitDate(visit) + (visit.confirmedTime || visit.requestedTime || visit.time || '')
  current.sort((a, b) => key(a).localeCompare(key(b)))
  history.sort((a, b) => key(b).localeCompare(key(a)))
  return { current, history }
}

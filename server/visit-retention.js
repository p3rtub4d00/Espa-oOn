import { visitCutoff, visitDate } from '../shared/visit-history.js'
export async function purgeExpiredVisits(Visit, now = new Date()) {
  const cutoff = visitCutoff(now)
  const visits = await Visit.find().select('id confirmedDate requestedDate date').lean()
  const operations = visits.filter((visit) => visitDate(visit) && visitDate(visit) < cutoff).map((visit) => ({
    deleteOne: { filter: {
      id: visit.id,
      // Protect a visit rescheduled while the cleanup was reading it.
      confirmedDate: visit.confirmedDate ?? null,
      requestedDate: visit.requestedDate ?? null,
      date: visit.date ?? null,
    } },
  }))
  if (!operations.length) return 0
  const result = await Visit.bulkWrite(operations, { ordered: false })
  return result.deletedCount || 0
}

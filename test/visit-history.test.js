import test from 'node:test'
import assert from 'node:assert/strict'
import { clubToday, visitDate, visitCutoff, visitGroups } from '../shared/visit-history.js'
import { purgeExpiredVisits } from '../server/visit-retention.js'
const now = new Date('2026-10-06T20:00:00Z')
test('club date uses local midnight, not browser or UTC date', () => {
  assert.equal(clubToday(new Date('2026-10-07T02:00:00Z')), '2026-10-06')
  assert.equal(clubToday(new Date('2026-10-07T04:00:00Z')), '2026-10-07')
})
test('history separates past and refused visits, keeps today and honors rescheduling', () => {
  const visits = [
    { id: 'past', requestedDate: '2026-10-05' },
    { id: 'today', requestedDate: '2026-10-06' },
    { id: 'rescheduled', requestedDate: '2026-01-01', confirmedDate: '2026-10-08', status: 'confirmed' },
    { id: 'refused', requestedDate: '2026-10-09', status: 'rejected' },
    { id: 'future', requestedDate: '2026-10-07' },
  ]
  const groups = visitGroups(visits, clubToday(now))
  assert.deepEqual(groups.current.map(v => v.id), ['today', 'future', 'rescheduled'])
  assert.deepEqual(groups.history.map(v => v.id), ['refused', 'past'])
  assert.equal(visits[0].id, 'past')
})
test('invalid dates are not deleted and legacy dates remain readable', () => {
  assert.equal(visitDate({ requestedDate: '2026-02-31' }), '')
  assert.equal(visitDate({ date: '2026-02-01' }), '2026-02-01')
})
test('cleanup retains full 90th day, future rescheduling and malformed records', async () => {
  assert.equal(visitCutoff(now), '2026-07-08')
  let operations
  const Visit = {
    find: () => ({ select: () => ({ lean: async () => [
      { id: 'expired', requestedDate: '2026-07-07' },
      { id: 'boundary', requestedDate: '2026-07-08' },
      { id: 'rescheduled', requestedDate: '2026-01-01', confirmedDate: '2026-10-08' },
      { id: 'invalid', requestedDate: '' },
    ] }) }),
    bulkWrite: async (ops) => { operations = ops; return { deletedCount: 1 } },
  }
  assert.equal(await purgeExpiredVisits(Visit, now), 1)
  assert.deepEqual(operations, [{ deleteOne: { filter: { id: 'expired', confirmedDate: null, requestedDate: '2026-07-07', date: null } } }])
})
test('cleanup does not write when no expired visits exist', async () => {
  const Visit = { find: () => ({ select: () => ({ lean: async () => [] }) }), bulkWrite: () => assert.fail('unexpected deletion') }
  assert.equal(await purgeExpiredVisits(Visit, now), 0)
})

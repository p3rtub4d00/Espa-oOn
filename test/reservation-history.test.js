import test from 'node:test'
import assert from 'node:assert/strict'
import { reservationGroups, reservationEnd, reservationAttention, filterReservationHistory } from '../shared/reservation-history.js'
const now = new Date('2026-10-06T21:00:00Z')
test('paid rentals leave current list only after their complete rental period', () => {
  const records = [
    { id:'past', dateISO:'2026-10-05', startTime:'08:00', period:'12h', paymentStatus:'paid' },
    { id:'today', dateISO:'2026-10-06', startTime:'08:00', period:'12h', paymentStatus:'paid' },
    { id:'overnight', dateISO:'2026-10-05', startTime:'18:00', period:'24h', paymentStatus:'paid' },
    { id:'future', dateISO:'2026-10-07', paymentStatus:'paid' },
  ]
  const groups = reservationGroups(records,now)
  assert.deepEqual(groups.current.map(r=>r.id),['overnight','today','future'])
  assert.deepEqual(groups.history.map(r=>r.id),['past'])
  assert.equal(records.length,4)
})
test('explicit end time uses Porto Velho and archives at its exact boundary',()=>{
  const record={dateISO:'2026-10-05',endDateISO:'2026-10-06',endTime:'17:00',paymentStatus:'paid'}
  assert.equal(reservationEnd(record),now.getTime())
  assert.equal(reservationGroups([record],now).history.length,1)
})
test('legacy dates and absent times are retained conservatively',()=>{
  assert.equal(reservationGroups([{date:'06/10/2026',period:'24h',paymentStatus:'paid'}],new Date('2026-10-07T23:00Z')).current.length,1)
  assert.equal(reservationEnd({dateISO:'2026-02-31'}),Infinity)
})
test('financial issues remain visible but cancelled rental balance does not create debt',()=>{
  const records=[
    {id:'balance',dateISO:'2026-01-01',source:'manual',paymentStatus:'manual-deposit',price:100,amountPaid:20},
    {id:'refund',dateISO:'2026-01-01',reservationStatus:'cancelled',cancellation:{refundAmount:100,refundStatus:'pending'}},
    {id:'review',dateISO:'2026-01-01',paymentStatus:'manual-review'},
    {id:'cancelled',dateISO:'2026-12-01',reservationStatus:'cancelled',source:'manual',paymentStatus:'manual-pending',price:100},
    {id:'paid',dateISO:'2026-01-01',paymentStatus:'paid'},
    {id:'expired',dateISO:'2026-12-01',paymentStatus:'expired'},
  ]
  assert.deepEqual(reservationGroups(records,now).current.map(r=>r.id),['balance','refund','review'])
  assert.equal(reservationAttention(records[0]),'Saldo pendente')
  assert.equal(reservationAttention(records[3]),'')
})
test('history search matches name without accents, phone and code with month filter',()=>{
  const records=[{id:'ABC',dateISO:'2026-09-01',customer:{name:'João Silva',phone:'6999999'}},{id:'DEF',dateISO:'2026-08-01',customer:{name:'Maria'}}]
  assert.equal(filterReservationHistory(records,'joao','2026-09').length,1)
  assert.equal(filterReservationHistory(records,'joao','2026-08').length,0)
  assert.equal(filterReservationHistory(records,'ABC').length,1)
  assert.equal(filterReservationHistory(records,'6999').length,1)
})

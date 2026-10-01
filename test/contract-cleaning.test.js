import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { once } from 'node:events'
import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { CLEANING_CLAUSE_TEXT } from '../shared/contract-terms.js'
import { createContractPdf } from '../src/utils/documents.js'
process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters'
for (const key of ['MONGODB_URI','BACKUP_MONGODB_URI','MASTER_API_URL','MASTER_CLUB_ID','MASTER_LICENSE_KEY']) delete process.env[key]
const { app, contractHash } = await import('../server/index.js')
const server = app.listen(0, '127.0.0.1')
await once(server, 'listening')
const base = `http://127.0.0.1:${server.address().port}`
after(() => new Promise(resolve => server.close(resolve)))
const Contract = mongoose.model('Contract')
const Settings = mongoose.model('Settings')
const fixture = {
  id:'CTR-ABC123',reservationId:'ESP-ABC123',reservationDateISO:'2099-12-12',reservationDate:'12/12/2099',
  period:'12h',price:500,startTime:'08:00',customer:{name:'Cliente Teste',cpf:'52998224725',phone:'69999990000'},
  signedAt:'2026-10-01T12:00:00.000Z',signature:'data:image/png;base64,synthetic',
}

test('new signature must accept current cleaning terms; stored text is hashed and matches public terms', async t => {
  t.mock.method(Settings,'findOne',()=>({lean:async()=>null}))
  t.mock.method(Contract,'findOne',()=>({lean:async()=>null}))
  let stored
  t.mock.method(Contract,'create',async record=>{stored=record;return {toObject:()=>record}})
  const settings = await (await fetch(base+'/api/settings')).json()
  assert.equal(settings.contractTerms.cleaningClauseText, CLEANING_CLAUSE_TEXT)
  const submit = body=>fetch(base+'/api/contracts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  const payload={...fixture,cancellationPolicyText:settings.cancellationPolicy.text}
  for (const text of [undefined,'Outro texto']) {
    assert.equal((await submit({...payload,cleaningClauseText:text})).status,409)
    assert.equal(stored,undefined)
  }
  const response=await submit({...payload,cleaningClauseText:CLEANING_CLAUSE_TEXT})
  assert.equal(response.status,201)
  const data=await response.json()
  assert.equal(data.cleaningClauseText,CLEANING_CLAUSE_TEXT)
  assert.equal(data.hash,contractHash(stored))
  assert.notEqual(contractHash({...stored,cleaningClauseText:'Alterado'}),data.hash)
})

test('legacy contracts retain the exact original hash and no new clause in downloaded PDFs', () => {
  const legacy={id:'CTR-ABC123',reservationId:'ESP-ABC123',reservationDateISO:'2099-12-12',reservationDate:'12/12/2099',period:'12h',price:500,customer:fixture.customer,signedAt:fixture.signedAt,signature:''}
  const originalParts=[legacy.id,legacy.reservationId,legacy.reservationDateISO,legacy.reservationDate,legacy.period,'500.00','Cliente Teste','52998224725','69999990000',fixture.signedAt,'']
  const originalHash=crypto.createHash('sha256').update(originalParts.join('|')).digest('hex').toUpperCase()
  assert.equal(contractHash(legacy),originalHash)
  const oldPdf=createContractPdf(legacy).output()
  assert.equal(oldPdf.includes('7. Limpeza'),false)
  const newPdf=createContractPdf({...legacy,cleaningClauseText:CLEANING_CLAUSE_TEXT}).output()
  assert.equal(newPdf.includes('7. Limpeza'),true)
  assert.equal(newPdf.includes('O locador compromete-se'),true)
})

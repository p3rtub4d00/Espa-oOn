import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { once } from 'node:events'
import mongoose from 'mongoose'
import { buildPrivacyPolicy, sanitizePrivacyConfig } from '../server/privacy.js'

process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters'
delete process.env.MONGODB_URI
delete process.env.BACKUP_MONGODB_URI
delete process.env.MASTER_API_URL
delete process.env.MASTER_CLUB_ID
delete process.env.MASTER_LICENSE_KEY
const { app } = await import('../server/index.js')
const server = app.listen(0, '127.0.0.1')
await once(server, 'listening')
const base = `http://127.0.0.1:${server.address().port}`
after(() => new Promise(resolve => server.close(resolve)))
const Settings = mongoose.model('Settings')
const Reservation = mongoose.model('Reservation')
const Contract = mongoose.model('Contract')

test('privacy configuration whitelists public fields and validates contact links', () => {
  assert.deepEqual(sanitizePrivacyConfig({controllerName:' Empresa Teste ',contactEmail:'DADOS@EXAMPLE.COM',contactPhone:'(69) 99999-0000',secret:'never-public'}),{controllerName:'Empresa Teste',contactEmail:'dados@example.com',contactPhone:'69999990000'})
  for (const input of [null,[],{contactEmail:'not-an-email'},{contactPhone:'123'},{controllerName:'a'}]) assert.throws(()=>sanitizePrivacyConfig(input),{statusCode:400})
})

test('missing identity stays pending while a valid business contact can serve privacy requests', () => {
  assert.equal(buildPrivacyPolicy().configured,false)
  assert.equal(buildPrivacyPolicy({config:{controllerName:'Empresa Teste'},establishment:{phone:'69999990000'}}).configured,true)
  assert.equal(buildPrivacyPolicy({config:{controllerName:'Empresa Teste'},establishment:{phone:'123'}}).configured,false)
})

test('public policy exposes only notices and public contact, never settings secrets or records', async t => {
  t.mock.method(Settings,'findOne',()=>({lean:async()=>({privacy:{controllerName:'Empresa Teste',contactEmail:'dados@example.com',secret:'private-key'},establishment:{name:'Clube Teste',phone:'69999990000'},gallery:['secret-gallery'],notifications:{internal:'private-config'}})}))
  const response=await fetch(base+'/api/privacy')
  assert.equal(response.status,200)
  assert.equal(response.headers.get('cache-control'),'no-store')
  const data=await response.json()
  assert.equal(data.controllerName,'Empresa Teste')
  const encoded=JSON.stringify(data)
  for (const secret of ['private-key','secret-gallery','private-config']) assert.equal(encoded.includes(secret),false)
})

test('CPF reservation lookup uses POST and prevents caching of personal documents', async t => {
  const reservation={id:'ESP-ABC123',customer:{cpf:'52998224725',name:'Cliente Teste'},contractId:'CTR-ABC123'}
  t.mock.method(Reservation,'findOne',()=>({lean:async()=>reservation}))
  t.mock.method(Contract,'findOne',()=>({lean:async()=>({id:'CTR-ABC123',signature:'test-signature'})}))
  const request=cpf=>fetch(base+'/api/reservations/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:reservation.id,cpf})})
  const response=await request('52998224725')
  assert.equal(response.status,200)
  assert.equal(response.headers.get('cache-control'),'no-store')
  assert.equal((await response.json()).contract.id,'CTR-ABC123')
  assert.equal((await request('11111111111')).status,400)
  // Another valid CPF must not retrieve this reservation.
  assert.equal((await request('11144477735')).status,403)
  const old=await fetch(base+'/api/reservations/ESP-ABC123?cpf=52998224725')
  assert.equal(old.status,404)
})

test('unauthenticated admin and malformed public lookup responses also prohibit caching', async () => {
  const admin=await fetch(base+'/api/admin/session')
  assert.equal(admin.status,401)
  assert.equal(admin.headers.get('cache-control'),'no-store')
  const response=await fetch(base+'/api/reservations/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})
  assert.equal(response.status,400)
  assert.equal(response.headers.get('cache-control'),'no-store')
})

test('frontend lookup API puts CPF exclusively in the JSON body', async t => {
  let captured
  t.mock.method(globalThis,'fetch',async (url,options)=>{
    captured={url,options}
    return new Response(JSON.stringify({reservation:{id:'ESP-ABC123'}}),{headers:{'Content-Type':'application/json'}})
  })
  const {api}=await import('../src/data/api.js')
  await api.lookupReservation('ESP-ABC123','52998224725')
  assert.equal(captured.url,'/api/reservations/lookup')
  assert.equal(captured.options.method,'POST')
  assert.deepEqual(JSON.parse(captured.options.body),{code:'ESP-ABC123',cpf:'52998224725'})
  assert.equal(captured.url.includes('52998224725'),false)
})

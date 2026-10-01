import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { once } from 'node:events'
import http from 'node:http'
import jwt from 'jsonwebtoken'

// Synthetic configuration; no inherited production service is contacted.
process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters'
process.env.ASAAS_WEBHOOK_TOKEN = 'test-only-webhook-token'
delete process.env.MONGODB_URI
delete process.env.BACKUP_MONGODB_URI
process.env.MASTER_CLUB_ID = 'CLUB-TEST'
process.env.MASTER_LICENSE_KEY = 'test-license-key'
process.env.ADMIN_PASSWORD = 'legacy-password-must-not-work'
let license = { active: true, billingStatus: 'paid', demoMode: false }
let masterAvailable = true
const master = http.createServer(async (req, res) => {
  assert.equal(req.headers['x-club-id'], 'CLUB-TEST')
  assert.equal(req.headers['x-license-key'], 'test-license-key')
  res.setHeader('Content-Type', 'application/json')
  if (!masterAvailable) { res.writeHead(503); res.end('{}'); return }
  if (req.url === '/api/license/status') { res.end(JSON.stringify(license)); return }
  if (req.url === '/api/license/admin-auth/verify') {
    let body = ''
    for await (const chunk of req) body += chunk
    res.end(JSON.stringify({ configured: true, valid: JSON.parse(body).password === 'new-password' }))
    return
  }
  res.writeHead(404); res.end('{}')
})
master.listen(0, '127.0.0.1')
await once(master, 'listening')
process.env.MASTER_API_URL = `http://127.0.0.1:${master.address().port}`
const { app, isValidCpf, priceForDate, selectedExtrasForContract, reservationTimeSlot, contractHash } = await import('../server/index.js')
const server = app.listen(0, '127.0.0.1')
await once(server, 'listening')
const base = `http://127.0.0.1:${server.address().port}`
after(async () => {
  await Promise.all([server, master].map(s => new Promise((resolve, reject) => s.close(err => err ? reject(err) : resolve()))))
})
const login = password => fetch(base + '/api/admin/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
})
const cookie = token => ({ Cookie: `espacoon_admin=${token}` })

test('health reports disconnected database and security headers are present', async () => {
  const response = await fetch(base + '/api/health')
  assert.equal(response.status, 200)
  assert.equal((await response.json()).database, 'disconnected')
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/)
})

test('admin rejects missing, malformed, expired and wrong-role sessions', async () => {
  const secret = process.env.JWT_SECRET
  for (const [token, expected] of [
    ['', 401], ['tampered', 401],
    [jwt.sign({ role: 'admin' }, secret, { expiresIn: -1 }), 401],
    [jwt.sign({ role: 'master' }, secret), 403],
    [jwt.sign({ role: 'admin' }, 'wrong-signing-key'), 401],
  ]) {
    const response = await fetch(base + '/api/admin/session', { headers: cookie(token) })
    assert.equal(response.status, expected)
  }
})

test('login uses central password, blocks suspended clubs and preserves password-free demo', async () => {
  assert.equal((await login(process.env.ADMIN_PASSWORD)).status, 401)
  assert.equal((await login('wrong-password')).status, 401)
  const response = await login('new-password')
  assert.equal(response.status, 200)
  const sessionCookie = response.headers.get('set-cookie')
  assert.match(sessionCookie, /HttpOnly/)
  assert.match(sessionCookie, /Secure/)
  assert.match(sessionCookie, /SameSite=Strict/)
  assert.equal((await fetch(base + '/api/admin/session', { headers: { Cookie: sessionCookie.split(';')[0] } })).status, 200)
  license = { active: false, billingStatus: 'suspended', demoMode: false }
  assert.equal((await login('new-password')).status, 423)
  assert.equal((await fetch(base + '/api/admin/session', { headers: { Cookie: sessionCookie.split(';')[0] } })).status, 423)
  const booking = await fetch(base + '/api/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(booking.status, 423)
  assert.equal((await booking.json()).code, 'BOOKING_LICENSE_BLOCKED')
  license = { active: true, billingStatus: 'demo', demoMode: true }
  const demo = await login('')
  assert.equal(demo.status, 200)
  assert.equal((await demo.json()).demoMode, true)
  license = { active: true, billingStatus: 'paid', demoMode: false }
  // Refresh the license cache after leaving demonstration mode.
  assert.equal((await login('new-password')).status, 200)
})

test('central authentication outage never accepts the legacy password', async () => {
  masterAvailable = false
  try { assert.equal((await login(process.env.ADMIN_PASSWORD)).status, 503) }
  finally { masterAvailable = true }
})

test('webhook rejects missing and incorrect tokens before touching the database', async () => {
  for (const token of ['', 'wrong-token']) {
    const response = await fetch(base + '/api/webhooks/asaas', { method: 'POST', headers: { 'Content-Type': 'application/json', 'asaas-access-token': token }, body: '{}' })
    assert.equal(response.status, 401)
  }
})

test('unknown API endpoints return JSON 404', async () => {
  const response = await fetch(base + '/api/not-a-real-route')
  assert.equal(response.status, 404)
  assert.equal((await response.json()).error, 'Rota não encontrada.')
})

test('CPF validation rejects repeated digits and incorrect check digits', () => {
  assert.equal(isValidCpf('529.982.247-25'), true)
  for (const value of ['', '11111111111', '52998224724', '123']) assert.equal(isValidCpf(value), false)
})

test('prices distinguish weekdays, Friday/Saturday, Sunday and special dates', () => {
  const settings = { prices: { weekday12: 450, weekday24: 650, weekend12: 700, weekend24: 950, sunday12: 650, sunday24: 850 }, specialDates: [{ date: '2026-10-05', price12: 999, price24: 1499 }] }
  for (const [date, expected12, expected24] of [['2026-10-01',450,650],['2026-10-02',700,950],['2026-10-03',700,950],['2026-10-04',650,850],['2026-10-05',999,1499]]) {
    assert.equal(priceForDate(date, '12h', settings), expected12)
    assert.equal(priceForDate(date, '24h', settings), expected24)
  }
})

test('extras use server prices and reject duplicates, inactive extras and invalid quantities', () => {
  const settings = { extras: [{ id: 'chairs', name: 'Cadeiras', active: true, price: 12.35 }, { id: 'inactive', active: false, price: 1 }] }
  const result = selectedExtrasForContract(settings, [{ id: 'chairs', quantity: 3, price: 0.01 }])
  assert.equal(result.extrasTotal, 37.05)
  assert.equal(result.extras[0].unitPrice, 12.35)
  for (const requested of [[{id:'inactive',quantity:1}],[{id:'unknown',quantity:1}],[{id:'chairs',quantity:0}],[{id:'chairs',quantity:1.5}],[{id:'chairs',quantity:101}],[{id:'chairs',quantity:1},{id:'chairs',quantity:1}]]) {
    assert.throws(() => selectedExtrasForContract(settings, requested), { statusCode: 400 })
  }
})

test('rental end times cross month and year boundaries correctly', () => {
  assert.deepEqual(reservationTimeSlot('2026-10-31', '24h', '08:00'), { startTime: '08:00', endTime: '08:00', endDateISO: '2026-11-01' })
  assert.deepEqual(reservationTimeSlot('2026-12-31', '12h', '20:30'), { startTime: '20:30', endTime: '08:30', endDateISO: '2027-01-01' })
  assert.throws(() => reservationTimeSlot('2026-10-01', '12h', '25:00'), { statusCode: 400 })
})

test('signed contract hash detects changes in price, signature, schedule and extras', () => {
  const contract = { id:'CT-TEST', reservationId:'RS-TEST', price:450, period:'12h', signature:'synthetic-signature', signedAt:new Date('2026-10-01T12:00:00Z'), customer:{name:'Cliente Teste',cpf:'529.982.247-25',phone:'(69) 99999-0000'}, startTime:'08:00', endTime:'20:00', endDateISO:'2026-10-01', basePrice:450, extrasTotal:0, extras:[] }
  const hash = contractHash(contract)
  assert.match(hash, /^[A-F0-9]{64}$/)
  assert.equal(contractHash({...contract, signedAt:contract.signedAt.toISOString(), customer:{...contract.customer,cpf:'52998224725',phone:'69999990000'}}), hash)
  for (const change of [{price:451},{signature:'changed'},{startTime:'09:00'},{extrasTotal:10}]) assert.notEqual(contractHash({...contract,...change}), hash)
})

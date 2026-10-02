import assert from 'node:assert/strict'
import { test } from 'node:test'
import { publicVisitorIp, approximateLocation, createDemoLocationLookup } from '../server/demo-location.js'
const response = () => new Response(JSON.stringify({ success: true, city: 'Porto Velho', region: 'Rondônia', country: 'Brasil', country_code: 'BR', ip: 'private', latitude: -8, longitude: -63 }))

test('private, invalid and reserved IPs never leave the server, including IPv4-mapped IPv6', async () => {
  const lookup = createDemoLocationLookup({ fetcher: () => assert.fail('No external lookup') })
  for (const ip of ['', 'bad', '127.0.0.1', '10.0.0.1', '192.168.1.1', '100.64.0.1', '169.254.1.1', '::1', 'fc00::1', 'fe80::1', '2001:db8::1', '::ffff:127.0.0.1', '::ffff:10.1.2.3']) {
    assert.equal(publicVisitorIp(ip), null, ip)
    assert.equal(await lookup(ip), null)
  }
  assert.equal(publicVisitorIp('8.8.8.8'), '8.8.8.8')
  assert.equal(publicVisitorIp('2606:4700:4700::1111'), '2606:4700:4700::1111')
})

test('lookup shares concurrent requests, caches results and stores only coarse location fields', async () => {
  let calls = 0, time = Date.now()
  const lookup = createDemoLocationLookup({ now: () => time, fetcher: async (url, options) => {
    calls++
    assert.match(url, /^https:\/\/ipwho\.is\/8\.8\.8\.8\?fields=success,city,region,country,country_code&lang=pt-BR$/)
    assert.equal(options.redirect, 'error')
    assert.ok(options.signal instanceof AbortSignal)
    return response()
  } })
  const results = await Promise.all([lookup('8.8.8.8'), lookup('8.8.8.8')])
  assert.equal(calls, 1)
  assert.deepEqual(results[0], { city: 'Porto Velho', region: 'Rondônia', country: 'Brasil', countryCode: 'BR' })
  await lookup('8.8.8.8'); assert.equal(calls, 1)
  time += 900001
  await lookup('8.8.8.8'); assert.equal(calls, 2)
  assert.equal(approximateLocation({ success: false }), null)
})

test('provider outage, missing geography and quota limits yield unknown without failing analytics', async () => {
  let calls = 0
  const lookup = createDemoLocationLookup({ fetcher: async () => { calls++; throw new Error('timeout') } })
  assert.equal(await lookup('8.8.8.8'), null)
  assert.equal(await lookup('8.8.8.8'), null)
  assert.equal(calls, 1)
  const quota = createDemoLocationLookup({ fetcher: async () => { calls++; return new Response('', { status: 429 }) } })
  assert.equal(await quota('8.8.8.8'), null)
  assert.equal(await quota('1.1.1.1'), null)
  assert.equal(calls, 2)
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { publicVisitorIp, approximateLocation, createDemoLocationLookup, demoVisitorIp } from '../server/demo-location.js'
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

test('Render edge visitor header is used only behind internal Render transport, never arbitrary forwarded chains', () => {
  const req={ip:'10.0.0.5',socket:{remoteAddress:'10.0.0.4'},get:name=>name==='CF-Connecting-IP'?'8.8.4.4':undefined}
  assert.equal(demoVisitorIp(req,{render:true}),'8.8.4.4')
  assert.equal(demoVisitorIp(req,{render:false}),null)
  assert.equal(demoVisitorIp({...req,ip:'1.1.1.1',socket:{remoteAddress:'1.1.1.1'}},{render:true}),'1.1.1.1')
  assert.equal(demoVisitorIp({...req,get:()=> '10.0.0.1'},{render:true}),null)
  assert.equal(demoVisitorIp({...req,get:()=> '8.8.4.4, 1.1.1.1'},{render:true}),null)
  assert.equal(publicVisitorIp('::ffff:8.8.8.8'),'8.8.8.8')
  assert.equal(publicVisitorIp('::ffff:808:808'),'8.8.8.8')
})

test('diagnostics distinguish private IP, timeout, unavailable geography and external quota without retaining IP',async()=>{
  const timeout=createDemoLocationLookup({fetcher:async()=>{throw Object.assign(new Error('timeout'),{name:'TimeoutError'})}})
  assert.deepEqual(await timeout.diagnose('10.0.0.1'),{location:null,status:'no_public_ip'})
  assert.deepEqual(await timeout.diagnose('8.8.8.8'),{location:null,status:'provider_timeout'})
  const missing=createDemoLocationLookup({fetcher:async()=>new Response('{"success":false}')})
  assert.equal((await missing.diagnose('8.8.8.8')).status,'not_available')
  let calls=0,time=1000000
  const quota=createDemoLocationLookup({now:()=>time,fetcher:async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'120'}})}})
  assert.equal((await quota.diagnose('8.8.8.8')).status,'provider_rate_limit')
  time+=119000
  assert.equal((await quota.diagnose('1.1.1.1')).status,'provider_rate_limit')
  assert.equal(calls,1)
  time+=2000
  await quota.diagnose('1.1.1.1');assert.equal(calls,2)
})

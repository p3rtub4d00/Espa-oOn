import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { once } from 'node:events'
import mongoose from 'mongoose'
process.env.JWT_SECRET='test-only-secret-with-at-least-32-characters'
process.env.MASTER_API_URL='https://master.example'
process.env.MASTER_CLUB_ID='CLB-TEST'
process.env.MASTER_LICENSE_KEY='test-license'
delete process.env.MONGODB_URI
delete process.env.BACKUP_MONGODB_URI
const {app}=await import('../server/index.js')
const server=app.listen(0,'127.0.0.1')
await once(server,'listening')
const base=`http://127.0.0.1:${server.address().port}`
after(()=>new Promise(resolve=>server.close(resolve)))
const nativeFetch=globalThis.fetch
const post=body=>nativeFetch(base+'/api/demo/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
function mockMaster(t,{demo=true,fail=false,onEvent=()=>{}}={}) {
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(String(url).startsWith(base)) return nativeFetch(url,options)
    if(String(url).endsWith('/api/license/status')) return new Response(JSON.stringify({ok:true,active:true,demoMode:demo,status:demo?'demo':'active',billingStatus:demo?'demo':'active'}),{status:200})
    assert.equal(String(url),'https://master.example/api/license/demo-events')
    assert.equal(options.headers['x-club-id'],'CLB-TEST')
    assert.equal(options.headers['x-license-key'],'test-license')
    onEvent(JSON.parse(options.body))
    if(fail) throw new Error('Metrics unavailable')
    return new Response('{"ok":true}',{status:200})
  })
}
test('public events proxy only allowed fields and demos; visitors cannot report completion',async t=>{
  const events=[]
  mockMaster(t,{onEvent:event=>events.push(event)})
  await nativeFetch(base+'/api/license?force=1')
  const response=await post({type:'visit',eventId:'session-12345',name:'private',cpf:'private',phone:'private'})
  assert.equal(response.status,200)
  assert.equal(response.headers.get('cache-control'),'no-store')
  assert.deepEqual(events,[{type:'visit',eventId:'session-12345',locationStatus:'no_public_ip'}])
  assert.equal((await post({type:'reservation_completed',eventId:'session-12345'})).status,400)
  assert.equal(events.length,1)
})
test('real clubs collect nothing and metrics outage does not produce a user-facing failure',async t=>{
  mockMaster(t,{demo:false,onEvent:()=>assert.fail('Real club must not report')})
  await nativeFetch(base+'/api/license?force=1')
  assert.equal((await post({type:'visit',eventId:'session-12345'})).status,403)
  mockMaster(t,{fail:true})
  await nativeFetch(base+'/api/license?force=1')
  const response=await post({type:'contact_click',eventId:'session-12345'})
  assert.equal(response.status,202)
  assert.equal((await response.json()).recorded,false)
})
test('server-side simulated payment records completion without customer data even when metrics fail',async t=>{
  const events=[]
  mockMaster(t,{fail:true,onEvent:event=>events.push(event)})
  await nativeFetch(base+'/api/license?force=1')
  const reservationId='ESP-ABC123',contractId='CTR-ABC123'
  const contract={id:contractId,reservationId,reservationDateISO:'2099-12-12',period:'12h',price:500,customer:{name:'private',cpf:'private',phone:'private'}}
  t.mock.method(mongoose.model('Contract'),'findOne',()=>({lean:async()=>contract}))
  t.mock.method(mongoose.model('Contract'),'findOneAndUpdate',()=>({lean:async()=>contract}))
  t.mock.method(mongoose.model('Reservation'),'findOne',()=>({lean:async()=>null}))
  t.mock.method(mongoose.model('Reservation'),'findOneAndUpdate',(_filter,update)=>({lean:async()=>update.$set}))
  t.mock.method(mongoose.model('DateLock'),'findById',()=>({lean:async()=>({reservationId})}))
  t.mock.method(mongoose.model('DateLock'),'updateOne',async()=>({}))
  t.mock.method(mongoose.model('Settings'),'findOne',()=>({lean:async()=>({notifications:{notifyPaidReservation:false}})}))
  const response=await nativeFetch(base+'/api/payments/asaas/pix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reservation:{id:reservationId},contractId})})
  assert.equal(response.status,200)
  assert.equal((await response.json()).demo,true)
  assert.deepEqual(events,[{type:'reservation_completed',eventId:reservationId}])
})
test('browser tracker deduplicates repeats, omits credentials and respects privacy controls',async t=>{
  const {trackDemoEvent}=await import('../src/data/demo-analytics.js')
  const oldStorage=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'),oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator')
  const values=new Map()
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)}})
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{doNotTrack:'0'}})
  t.after(()=>{
    if(oldStorage) Object.defineProperty(globalThis,'sessionStorage',oldStorage); else delete globalThis.sessionStorage
    if(oldNavigator) Object.defineProperty(globalThis,'navigator',oldNavigator); else delete globalThis.navigator
  })
  const calls=[]
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(url,'/api/demo/events')
    assert.equal(options.keepalive,true)
    assert.equal(options.credentials,'omit')
    calls.push(JSON.parse(options.body))
    return new Response('{"recorded":true}',{status:200})
  })
  assert.equal(await trackDemoEvent('visit'),true)
  assert.equal(await trackDemoEvent('visit'),false)
  assert.equal(await trackDemoEvent('contact_click'),true)
  assert.equal(calls.length,2)
  assert.equal(calls[0].eventId,calls[1].eventId)
  navigator.doNotTrack='1'
  assert.equal(await trackDemoEvent('admin_open'),false)
  assert.equal(calls.length,2)
  assert.equal(await trackDemoEvent('reservation_completed'),false)
})

test('visit geography comes from the server IP, ignores browser fields and never forwards the IP', async t => {
  const events=[]
  t.mock.method(globalThis,'fetch',async (url, options) => {
    if (String(url).endsWith('/api/license/status')) return new Response(JSON.stringify({ok:true,active:true,demoMode:true,billingStatus:'demo'}))
    if (String(url).startsWith('https://ipwho.is/')) {
      assert.match(String(url), /\/8\.8\.4\.4\?/)
      return new Response(JSON.stringify({success:true,city:'Porto Velho',region:'Rondônia',country:'Brasil',country_code:'BR',ip:'8.8.4.4',latitude:1}))
    }
    assert.equal(String(url),'https://master.example/api/license/demo-events')
    events.push(JSON.parse(options.body))
    return new Response('{"ok":true}')
  })
  await nativeFetch(base+'/api/license?force=1')
  const response = await nativeFetch(base+'/api/demo/events', {method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':'8.8.4.4'},body:JSON.stringify({type:'visit',eventId:'geo-session-123',location:{city:'Forged'},ip:'1.1.1.1'})})
  assert.equal(response.status,200)
  assert.deepEqual(events[0].location,{city:'Porto Velho',region:'Rondônia',country:'Brasil',countryCode:'BR'})
  assert.equal(JSON.stringify(events).includes('8.8.4.4'),false)
  assert.equal(JSON.stringify(events).includes('Forged'),false)
  const optedOut = await nativeFetch(base+'/api/demo/events',{method:'POST',headers:{'Content-Type':'application/json','DNT':'1','X-Forwarded-For':'1.1.1.1'},body:JSON.stringify({type:'visit',eventId:'opted-out-123'})})
  assert.equal(optedOut.status,202)
  assert.equal(events.length,1)
})

test('Render visit uses the edge client address through multiple proxies and forwards only geography/status',async t=>{
  const oldRender=process.env.RENDER
  process.env.RENDER='true'
  t.after(()=>{if(oldRender===undefined)delete process.env.RENDER;else process.env.RENDER=oldRender})
  const events=[]
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(String(url).endsWith('/api/license/status'))return new Response(JSON.stringify({ok:true,active:true,demoMode:true,billingStatus:'demo'}))
    if(String(url).startsWith('https://ipwho.is/')) {
      assert.match(String(url),/\/1\.0\.0\.1\?/)
      return new Response(JSON.stringify({success:true,city:'Porto Velho',region:'Rondônia',country:'Brasil',country_code:'BR'}))
    }
    events.push(JSON.parse(options.body));return new Response('{"ok":true}')
  })
  await nativeFetch(base+'/api/license?force=1')
  const response=await nativeFetch(base+'/api/demo/events',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':'8.8.8.8, 10.0.0.9','CF-Connecting-IP':'1.0.0.1'},body:JSON.stringify({type:'visit',eventId:'render-proxy-session'})})
  assert.equal(response.status,200)
  assert.equal(events[0].locationStatus,'identified')
  assert.equal(events[0].location.city,'Porto Velho')
  assert.equal(JSON.stringify(events).includes('1.0.0.1'),false)
  assert.equal(JSON.stringify(events).includes('10.0.0.9'),false)
})

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { once } from 'node:events'
import { installClubRecoveryRequest } from '../server/club-recovery.js'
let calls=0, fail=false, submitted
const app=express();app.use(express.json())
installClubRecoveryRequest({app,configured:true,sendRequest:async body=>{calls++;submitted=body;if(fail) throw new Error('secret license') }})
const server=app.listen(0,'127.0.0.1');await once(server,'listening');after(()=>server.close())
const base='http://127.0.0.1:'+server.address().port
const send=body=>fetch(base+'/api/admin/recovery-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
test('public recovery forwards only phone to its configured Master and gives safe bounded responses',async()=>{
  assert.equal((await send({phone:'abc'})).status,400);assert.equal(calls,0)
  const response=await send({phone:'69999990000',clubId:'OTHER',password:'secret',url:'https://unsafe.test'});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(submitted,{phone:'69999990000',company:''});assert.doesNotMatch(JSON.stringify(await response.json()),/secret|OTHER|unsafe/)
  fail=true;const outage=await send({phone:'69999990000'});assert.equal(outage.status,503);assert.doesNotMatch(JSON.stringify(await outage.json()),/secret license/)
  fail=false;await send({phone:'69999990000'});await send({phone:'69999990000'});const limited=await send({phone:'69999990000'});assert.equal(limited.status,429)
})

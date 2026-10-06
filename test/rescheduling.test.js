import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { once } from 'node:events'
import { installRescheduling, canReschedule, validateRescheduleDate } from '../server/rescheduling.js'
import { reservationGroups } from '../shared/reservation-history.js'
let r, locks, blocked, pushes, failWrite=false
const query=fn=>({session(){return this},lean:async()=>structuredClone(fn())})
function matches(filter) {
  if(filter.dateISO&&filter.dateISO!==r.dateISO)return false
  if(filter.paymentStatus&&filter.paymentStatus!==r.paymentStatus)return false
  if(filter['rescheduleRequest.status']&&r.rescheduleRequest?.status==='pending')return false
  if(filter.reschedules){const match=filter.reschedules.$elemMatch;if(!r.reschedules?.some(c=>c.id===match.id&&c.feeStatus==='pending'&&c.extraFee>0))return false}
  return filter.id===r.id
}
const Reservation={findOne:f=>query(()=>f.id===r.id?r:null),findOneAndUpdate:(f,u)=>query(()=>{
  if(!matches(f))return null
  if(failWrite)throw new Error('write failed')
  for(const [key,v] of Object.entries(u.$set||{})) {if(key.startsWith('reschedules.$.'))r.reschedules.find(c=>c.id===f.reschedules.$elemMatch.id)[key.split('.').at(-1)]=v;else r[key]=v}
  if(u.$push?.reschedules)(r.reschedules||=[]).push(u.$push.reschedules)
  return r
})}
const DateLock={findById:id=>query(()=>locks[id]||null),create:async([l])=>{if(locks[l._id])throw Object.assign(new Error('duplicate'),{code:11000});locks[l._id]=l},deleteOne:async f=>{if(locks[f._id]?.reservationId===f.reservationId)delete locks[f._id]}}
const next=(_,__,n)=>n(), app=express();app.use(express.json())
installRescheduling(app,{Reservation,DateLock,Settings:{findOne:()=>query(()=>({blockedDates:blocked}))},transaction:async fn=>{const before=structuredClone({r,locks});try{await fn({})}catch(e){r=before.r;locks=before.locks;throw e}},requireAdmin:(req,res,n)=>req.headers.authorization==='owner'?n():res.sendStatus(401),limiter:next,requireBookingLicense:next,secureEqual:(a,b)=>a===b,onlyDigits:v=>String(v||'').replace(/\D/g,''),sendPush:async p=>pushes.push(p),timeSlot:(day,period,time)=>({startTime:time,endTime:'20:00',endDateISO:day}),allowedStartTimes:()=>['08:00'],currentSettings:async()=>({blockedDates:blocked}),displayDate:day=>day.split('-').reverse().join('/')})
app.use((e,req,res,n)=>res.status(e.statusCode||500).json({error:e.message}))
const server=app.listen(0,'127.0.0.1');await once(server,'listening');after(()=>server.close())
async function post(path,body,owner=false){const result=await fetch(`http://127.0.0.1:${server.address().port}/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(owner?{authorization:'owner'}:{})},body:JSON.stringify(body)});return {status:result.status,body:await result.text().then(t=>{try{return JSON.parse(t)}catch{return t}})}}
function reset(){r={id:'ESP-123',dateISO:'2099-10-10',date:'10/10/2099',startTime:'08:00',endDateISO:'2099-10-10',endTime:'20:00',period:'12h',paymentStatus:'paid',reservationStatus:'active',price:450,amountPaid:450,contractId:'signed-original',customer:{cpf:'12345678901',name:'Cliente'},reschedules:[]};locks={'2099-10-10':{reservationId:r.id,status:'paid'}};blocked=[];pushes=[];failWrite=false}
const body={code:'ESP-123',cpf:'12345678901',dateISO:'2099-10-15',startTime:'08:00',reason:'Imprevisto familiar'}
test('customer authentication, eligibility, calendar constraints and single pending request',async()=>{
 reset();assert.equal((await post('reservations/reschedule',{...body,cpf:'wrong'})).status,403)
 for(const dateISO of ['2020-01-01','2099-02-30',r.dateISO])assert.equal((await post('reservations/reschedule',{...body,dateISO})).status,400)
 blocked=[body.dateISO];assert.equal((await post('reservations/reschedule',body)).status,409);blocked=[]
 locks[body.dateISO]={reservationId:'OTHER'};assert.equal((await post('reservations/reschedule',body)).status,409);delete locks[body.dateISO]
 r.paymentStatus='refunded';assert.equal((await post('reservations/reschedule',body)).status,409);r.paymentStatus='paid'
 assert.equal((await post('reservations/reschedule',body)).status,200);assert.equal(r.dateISO,'2099-10-10');assert.ok(locks[r.dateISO]);assert.equal(locks[body.dateISO],undefined);assert.equal(pushes.length,1);assert.equal(pushes[0].url,'/admin')
 assert.equal((await post('reservations/reschedule',body)).status,409);assert.equal(pushes.length,1)
})
test('owner rejects without changing original booking; unauthenticated callers cannot approve',async()=>{
 reset();await post('reservations/reschedule',body);const payload={requestId:r.rescheduleRequest.id,decision:'reject',ownerMessage:'Data indisponível'}
 assert.equal((await post('admin/reservations/ESP-123/reschedule',payload)).status,401)
 assert.equal((await post('admin/reservations/ESP-123/reschedule',payload,true)).status,200);assert.equal(r.rescheduleRequest.status,'rejected');assert.equal(r.dateISO,'2099-10-10');assert.ok(locks[r.dateISO]);assert.equal(r.reschedules.length,0)
})
test('approval rechecks availability and agreement, moves locks atomically, preserves signed contract/payment and tracks additional receipt',async()=>{
 reset();await post('reservations/reschedule',body);const payload={requestId:r.rescheduleRequest.id,decision:'approve',agreed:true,extraFee:35.5}
 assert.equal((await post('admin/reservations/ESP-123/reschedule',{...payload,agreed:false},true)).status,400)
 locks[body.dateISO]={reservationId:'OTHER'};assert.equal((await post('admin/reservations/ESP-123/reschedule',payload,true)).status,409);assert.equal(r.dateISO,'2099-10-10');delete locks[body.dateISO]
 failWrite=true;assert.equal((await post('admin/reservations/ESP-123/reschedule',payload,true)).status,500);assert.ok(locks[r.dateISO]);assert.equal(locks[body.dateISO],undefined);failWrite=false
 assert.equal((await post('admin/reservations/ESP-123/reschedule',payload,true)).status,200);assert.equal(r.dateISO,body.dateISO);assert.equal(locks['2099-10-10'],undefined);assert.equal(locks[body.dateISO].reservationId,r.id);assert.equal(r.contractId,'signed-original');assert.equal(r.price,450);assert.equal(r.amountPaid,450);assert.equal(r.paymentStatus,'paid');assert.equal(r.reschedules[0].extraFee,35.5)
 assert.equal((await post('admin/reservations/ESP-123/reschedule',payload,true)).status,409)
 assert.equal(reservationGroups([r],new Date('2100-01-01')).current.length,1)
 assert.equal((await post('admin/reservations/ESP-123/reschedule-fee',{changeId:r.reschedules[0].id},true)).status,200);assert.equal(r.reschedules[0].feeStatus,'received');assert.equal(reservationGroups([r],new Date('2100-01-01')).history.length,1)
 assert.equal((await post('admin/reservations/ESP-123/reschedule-fee',{changeId:r.reschedules[0].id},true)).status,404)
})
test('manual rescheduling supports deposit reservations and refuses closed reservations',async()=>{
 reset();r.source='manual';r.paymentStatus='manual-deposit';assert.equal(canReschedule(r),true)
 assert.equal((await post('admin/reservations/ESP-123/reschedule',{decision:'approve',agreed:true,dateISO:body.dateISO,startTime:'08:00',extraFee:0},true)).status,200);assert.equal(r.reschedules[0].source,'owner');assert.equal(r.reschedules[0].feeStatus,'none')
 r.reservationStatus='cancelled';assert.equal(canReschedule(r),false)
 assert.throws(()=>validateRescheduleDate('2099-02-30','2099-01-01'))
})

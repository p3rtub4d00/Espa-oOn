import crypto from 'node:crypto'
import { canReschedule } from '../shared/rescheduling.js'
export { canReschedule } from '../shared/rescheduling.js'
const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode })
export function validateRescheduleDate(date, oldDate, now = new Date()) {
  const parsed = new Date(String(date) + 'T00:00:00Z')
  const today = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Porto_Velho', year:'numeric',month:'2-digit',day:'2-digit' }).format(now)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date || date < today || date === oldDate) throw fail('Escolha outra data válida, atual ou futura.',400)
}
export function installRescheduling(app, deps) {
  const { Reservation, DateLock, Settings, transaction, requireAdmin, limiter, requireBookingLicense, secureEqual, onlyDigits, sendPush, timeSlot, allowedStartTimes, currentSettings, displayDate } = deps
  async function available(dateISO, settings, session = null) {
    if ((settings.blockedDates || []).includes(dateISO)) throw fail('Esta data está bloqueada.')
    let query = DateLock.findById(dateISO)
    if (session) query = query.session(session)
    if (await query.lean()) throw fail('Esta data está ocupada. Escolha outra data.')
  }
  app.post('/api/reservations/reschedule', limiter, requireBookingLicense, async (req,res,next) => {
    try {
      const id=String(req.body?.code || '').toUpperCase().slice(0,60)
      const r=await Reservation.findOne({id}).lean()
      if (!r || !secureEqual(onlyDigits(r.customer?.cpf),onlyDigits(req.body?.cpf)) || !onlyDigits(req.body?.cpf)) throw fail('Código ou CPF não confere.',403)
      if (!canReschedule(r)) throw fail('Esta reserva não permite remarcação neste momento.')
      validateRescheduleDate(req.body.dateISO,r.dateISO)
      const settings=await currentSettings()
      const startTime=String(req.body.startTime || r.startTime || '08:00')
      if (!allowedStartTimes(settings,r.period).includes(startTime)) throw fail('Horário de entrada indisponível.',400)
      const slot=timeSlot(req.body.dateISO,r.period,startTime)
      if (Date.parse(`${slot.endDateISO}T${slot.endTime}:00-04:00`) <= Date.now()) throw fail('O novo período já terminou.',400)
      await available(req.body.dateISO,settings)
      const request={id:crypto.randomUUID(),status:'pending',dateISO:req.body.dateISO,startTime,reason:String(req.body.reason || '').trim().slice(0,500),createdAt:new Date(),originalDateISO:r.dateISO}
      if (request.reason.length<3) throw fail('Informe o motivo da remarcação.',400)
      const saved=await Reservation.findOneAndUpdate({id,dateISO:r.dateISO,paymentStatus:r.paymentStatus,reservationStatus:{$ne:'cancelled'},'rescheduleRequest.status':{$ne:'pending'}},{$set:{rescheduleRequest:request}},{new:true}).lean()
      if (!saved) throw fail('Já existe uma solicitação ou a reserva foi alterada.')
      try { await sendPush({title:'Solicitação de remarcação',body:`${r.customer?.name || 'Cliente'} pediu ${displayDate(request.dateISO)}. Revise no painel.`,url:'/admin',tag:'reschedule-'+request.id}) } catch { console.error('Falha no push de remarcação; solicitação disponível no painel.') }
      res.json(saved)
    } catch(e){next(e)}
  })
  app.post('/api/admin/reservations/:id/reschedule',requireAdmin,limiter,async(req,res,next)=>{
    try {
      let saved
      if (!['approve','reject'].includes(req.body.decision)) throw fail('Escolha aprovar ou recusar.',400)
      await transaction(async(session)=>{
        const r=await Reservation.findOne({id:req.params.id}).session(session).lean()
        if (!r) throw fail('Reserva não encontrada.',404)
        const request=r.rescheduleRequest
        const fromRequest=!!req.body.requestId
        if (fromRequest && (request?.status!=='pending' || request.id!==req.body.requestId)) throw fail('A solicitação já foi respondida.')
        if (!fromRequest && request?.status==='pending') throw fail('Responda à solicitação pendente antes de remarcar manualmente.')
        const dateISO=fromRequest ? request.dateISO : req.body.dateISO
        if (req.body.decision==='reject') {
          if (!fromRequest) throw fail('Solicitação não encontrada.',400)
          const ownerMessage=String(req.body.ownerMessage||'').trim().slice(0,500)
          if(ownerMessage.length<3)throw fail('Informe o motivo da recusa.',400)
          saved=await Reservation.findOneAndUpdate({id:r.id},{$set:{rescheduleRequest:{...request,status:'rejected',ownerMessage,respondedAt:new Date()}}},{new:true,session}).lean()
          return
        }
        if (!canReschedule(r)) throw fail('Esta reserva não permite remarcação neste momento.')
        validateRescheduleDate(dateISO,r.dateISO)
        const fee=Math.round(Number(req.body.extraFee || 0)*100)/100
        if(!Number.isFinite(fee)||fee<0||fee>1000000)throw fail('Valor adicional inválido.',400)
        if(req.body.agreed!==true)throw fail('Confirme que o cliente concordou com a nova data e eventual valor adicional.',400)
        const settings=await Settings.findOne({key:'main'}).session(session).lean() || {}
        const startTime=fromRequest ? request.startTime : String(req.body.startTime || r.startTime || '08:00')
        if(!allowedStartTimes(settings,r.period).includes(startTime))throw fail('Horário de entrada indisponível.',400)
        const slot=timeSlot(dateISO,r.period,startTime)
        if(Date.parse(`${slot.endDateISO}T${slot.endTime}:00-04:00`)<=Date.now())throw fail('O novo período já terminou.',400)
        await available(dateISO,settings,session)
        await DateLock.create([{_id:dateISO,reservationId:r.id,status:r.paymentStatus==='paid'?'paid':'confirmed',expiresAt:null}],{session})
        const change={id:crypto.randomUUID(),fromDateISO:r.dateISO,fromStartTime:r.startTime,fromEndDateISO:r.endDateISO,fromEndTime:r.endTime,dateISO,startTime:slot.startTime,endTime:slot.endTime,endDateISO:slot.endDateISO,extraFee:fee,feeStatus:fee>0?'pending':'none',reason:fromRequest?request.reason:String(req.body.reason||'Remarcação manual').slice(0,500),approvedAt:new Date(),source:fromRequest?'customer':'owner',requestId:fromRequest?request.id:null}
        saved=await Reservation.findOneAndUpdate({id:r.id},{$set:{dateISO,date:displayDate(dateISO),day:Number(dateISO.slice(-2)),...slot,rescheduleRequest:fromRequest?{...request,status:'approved',ownerMessage:String(req.body.ownerMessage||'').trim().slice(0,500),respondedAt:new Date()}:null,pushDayBeforeReminderAt:null,pushSameDayReminderAt:null},$push:{reschedules:change}},{new:true,session}).lean()
        await DateLock.deleteOne({_id:r.dateISO,reservationId:r.id},{session})
      })
      res.json(saved)
    }catch(e){if(e.code===11000)e=fail('A data acabou de ser ocupada. Escolha outra.');next(e)}
  })
  app.post('/api/admin/reservations/:id/reschedule-fee',requireAdmin,limiter,async(req,res,next)=>{
    try {
      const saved=await Reservation.findOneAndUpdate({id:req.params.id,reschedules:{$elemMatch:{id:req.body.changeId,feeStatus:'pending',extraFee:{$gt:0}}}},{$set:{'reschedules.$.feeStatus':'received','reschedules.$.feeReceivedAt':new Date()}},{new:true}).lean()
      if(!saved)throw fail('Remarcação não encontrada.',404)
      res.json(saved)
    }catch(e){next(e)}
  })
}

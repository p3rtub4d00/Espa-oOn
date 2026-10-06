import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import RescheduleForm, { RescheduleHistory } from '../components/RescheduleForm'
import { canReschedule } from '../../shared/rescheduling.js'
import { api } from '../data/api'
export default function OwnerRescheduling({reservation,onSaved,onClose}) {
  const ref=useRef(null),[result,setResult]=useState(null),[error,setError]=useState('')
  useEffect(()=>{const dialog=ref.current,old=document.body.style.overflow;dialog.showModal();document.body.style.overflow='hidden';return()=>{dialog.close();document.body.style.overflow=old}},[])
  const saved=(r)=>{setResult(r);onSaved(r)}
  const current=result||reservation
  let phone=String(current.customer?.phone||'').replace(/\D/g,'');if(phone&&!phone.startsWith('55'))phone='55'+phone
  const latest=current.reschedules?.at(-1)
  const message=current.rescheduleRequest?.status==='rejected'?`Olá! A remarcação da reserva ${current.id} não foi aprovada. Motivo: ${current.rescheduleRequest.ownerMessage}. A data original permanece ${current.date}.`:`Olá! A reserva ${current.id} foi remarcada para ${current.date} às ${current.startTime}. Adicional combinado: R$ ${Number(latest?.extraFee||0).toFixed(2)}. O contrato original permanece preservado e a remarcação está registrada na consulta da reserva.`
  return createPortal(<dialog className="admin-reschedule-modal" ref={ref} aria-label="Remarcação da reserva" onCancel={e=>{e.preventDefault();onClose()}}><header className="reschedule-modal-header"><h2>Remarcação da reserva</h2><button className="admin-category-back" onClick={onClose}>Fechar remarcação</button></header><p className="reschedule-modal-customer">{current.customer?.name} · {current.id}</p>
    {result?<><RescheduleHistory reservation={result}/>{phone&&<a className="reschedule-whatsapp" href={'https://wa.me/'+phone+'?text='+encodeURIComponent(message)} target="_blank" rel="noopener noreferrer">Enviar resposta pelo WhatsApp</a>}</>:canReschedule(reservation)||reservation.rescheduleRequest?.status==='pending'?<RescheduleForm reservation={reservation} owner onSaved={saved} onClose={onClose}/>:<RescheduleHistory reservation={reservation}/>}
    {(current.reschedules||[]).filter(c=>c.feeStatus==='pending'&&c.extraFee>0).map(c=><button className="admin-category-back" key={c.id} onClick={async()=>{if(!window.confirm('Confirma que recebeu o adicional de R$ '+c.extraFee.toFixed(2)+'?'))return;try{saved(await api.markRescheduleFee(current.id,c.id))}catch(e){setError(e.message)}}}>Registrar adicional recebido: R$ {c.extraFee.toFixed(2)}</button>)}
    {error&&<p role="alert">{error}</p>}
  </dialog>,document.body)
}

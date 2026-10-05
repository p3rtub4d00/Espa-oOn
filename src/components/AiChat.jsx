import { useEffect, useRef, useState } from 'react'
import { Send, X, CalendarDays } from 'lucide-react'
import { api } from '../data/api'
import './aiChat.css'
import Clubi from './Clubi'
export default function AiChat({ license, name, hidden, onCalendar }) {
  const [enabled, setEnabled] = useState(false)
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef(null)
  const end = useRef(null)
  const trigger = useRef(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    let current = true
    api.chatConfig().then(x => { if (current) setEnabled(x.enabled === true) }).catch(() => {})
    return () => { current = false }
  }, [license])
  useEffect(() => { if (open && !hidden) { input.current?.focus(); end.current?.scrollIntoView({ block: 'nearest' }) } }, [open, hidden])
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [messages, busy, error])
  const close = () => { setOpen(false); trigger.current?.focus() }
  const send = async (text = draft) => {
    const message = text.trim()
    if (!message || busy) return
    setDraft(''); setError(''); setBusy(true)
    const history = messages.slice(-6).map(({ role, text }) => ({ role, text }))
    setMessages(previous => [...previous, { role: 'user', text: message }])
    try {
      const result = await api.chat(message, history)
      if (alive.current) setMessages(previous => [...previous, { role: 'assistant', text: result.reply, actions: result.actions }])
    } catch (e) {
      if (alive.current) { setError(e.message); setMessages(previous => previous.slice(0, -1)); setDraft(message) }
    } finally { if (alive.current) setBusy(false) }
  }
  if (!enabled || hidden) return null
  const openCalendar = date => { close(); onCalendar(date) }
  return <div className="club-ai-widget">
    {!open && <button ref={trigger} className="club-ai-trigger" aria-label="Abrir chat com Clubi, assistente de IA" aria-haspopup="dialog" onClick={() => setOpen(true)}><span className="club-ai-launcher-mascot"><Clubi wave /></span><span><strong>Fale com o Clubi</strong><small>Tire suas dúvidas</small></span></button>}
    {open && <section className="club-ai-panel" role="dialog" aria-label="Clubi, assistente do clube" onKeyDown={e => { if (e.key === 'Escape') close() }}>
      <header className="club-ai-head"><span className="club-ai-symbol"><Clubi thinking={busy} /></span><div><strong>Clubi · Assistente IA</strong><small>{name} · Atendimento com IA</small></div><button aria-label="Fechar chat" onClick={close}><X size={20} /></button></header>
      <div className="club-ai-messages" role="log" aria-live="polite" aria-relevant="additions text">
        <div className="club-ai-message assistant">Olá! Sou o Clubi, assistente de IA deste espaço. Posso ajudar com datas, valores, estrutura e itens para aluguel. O que você gostaria de saber?</div>
        {!messages.length && <div className="club-ai-suggestions"><button onClick={() => openCalendar()}><CalendarDays size={15} />Ver datas disponíveis</button>{['Quais itens posso alugar?', 'Quais as regras de limpeza?'].map(x => <button key={x} disabled={busy} onClick={() => send(x)}>{x}</button>)}</div>}
        {messages.map((x, i) => <div key={i} className={'club-ai-message ' + x.role}>{x.text}{x.role === 'assistant' && Array.isArray(x.actions) && <div className="club-ai-response-actions">{x.actions.filter(a => a?.type === 'calendar' && /^\d{4}-\d{2}-\d{2}$/.test(a.date || '')).slice(0, 3).map(a => <button key={a.date} onClick={() => openCalendar(a.date)}><CalendarDays size={16} />Ver {a.date.split('-').reverse().join('/')} no calendário</button>)}</div>}</div>)}
        {busy && <div className="club-ai-typing" role="status"><span className="club-ai-typing-mascot"><Clubi thinking /></span><span>Clubi está consultando as informações<span className="club-ai-dots" aria-hidden="true"><i /><i /><i /></span></span></div>}
        {error && <p className="club-ai-error" role="alert">{error}</p>}<div ref={end} />
      </div>
      <div className="club-ai-actions"><button onClick={() => openCalendar()}><CalendarDays size={18} />Reservar no calendário</button><small>Escolha a data e continue sua reserva online.</small></div>
      <form className="club-ai-form" onSubmit={e => { e.preventDefault(); send() }}><label htmlFor="club-ai-question" className="club-ai-label">Sua pergunta</label><textarea ref={input} id="club-ai-question" rows="2" maxLength="800" value={draft} disabled={busy} placeholder="Ex.: tem vaga em 23/10/2026?" onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }} /><button type="submit" aria-label="Enviar pergunta" disabled={busy || !draft.trim()}><Send size={20} /></button></form>
      <p className="club-ai-notice">Não envie CPF, documentos ou dados de pagamento. Perguntas são processadas pelo Google Gemini. A reserva é concluída no calendário. <a href="/privacidade">Privacidade</a></p>
    </section>}
  </div>
}

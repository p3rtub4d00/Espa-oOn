import { useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, Clock3, MapPin, Phone, UserRound, X } from 'lucide-react'
import { api } from '../data/api'
import './visit.css'

function onlyDigits(value) {
  return value.replace(/\D/g, '')
}

function formatPhone(value) {
  const digits = onlyDigits(value).slice(0, 11)
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  }
  return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}

export default function VisitScheduler({ onClose }) {
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({
    name: '',
    phone: '',
    date: '2026-09-30',
    time: '',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const bookingCode = useMemo(
    () => 'VIS-' + Math.floor(100000 + Math.random() * 900000),
    [],
  )

  const update = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: field === 'phone' ? formatPhone(value) : value,
    }))
    setErrors((current) => ({ ...current, [field]: '' }))
  }

  const submit = async () => {
    const next = {}
    if (form.name.trim().length < 3) next.name = 'Informe seu nome.'
    if (onlyDigits(form.phone).length < 10) next.phone = 'Informe um telefone válido.'
    if (!form.date) next.date = 'Escolha uma data.'
    if (!form.time) next.time = 'Informe um horário sugerido.'
    setErrors(next)
    if (Object.keys(next).length) return

    const visit = {
      id: bookingCode,
      ...form,
      requestedDate: form.date,
      requestedTime: form.time,
      confirmedDate: null,
      confirmedTime: null,
      ownerMessage: '',
      createdAt: new Date().toISOString(),
      status: 'pending-owner-confirmation',
    }

    setSaving(true)
    try {
      await api.createVisit(visit)
      setDone(true)
    } catch (error) {
      setErrors((current) => ({ ...current, submit: error.message || 'Não foi possível enviar a solicitação.' }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="visit-backdrop" role="dialog" aria-modal="true" aria-label="Solicitar visita">
      <div className="visit-modal">
        <button className="visit-close" onClick={onClose} aria-label="Fechar">
          <X />
        </button>

        {!done ? (
          <>
            <div className="visit-hero">
              <span>Conheça antes de reservar</span>
              <h2>Solicite uma visita ao espaço.</h2>
              <p>
                Informe a data e o horário que seriam melhores para você. O proprietário precisa confirmar
                a disponibilidade antes da visita ficar agendada.
              </p>
            </div>

            <div className="visit-form">
              <label>
                <span>Nome</span>
                <div className={errors.name ? 'visit-input error' : 'visit-input'}>
                  <UserRound size={17} />
                  <input
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                    placeholder="Seu nome completo"
                  />
                </div>
                {errors.name && <small>{errors.name}</small>}
              </label>

              <label>
                <span>WhatsApp</span>
                <div className={errors.phone ? 'visit-input error' : 'visit-input'}>
                  <Phone size={17} />
                  <input
                    inputMode="tel"
                    value={form.phone}
                    onChange={(e) => update('phone', e.target.value)}
                    placeholder="(69) 99999-9999"
                  />
                </div>
                {errors.phone && <small>{errors.phone}</small>}
              </label>

              <label>
                <span>Data sugerida</span>
                <div className={errors.date ? 'visit-input error' : 'visit-input'}>
                  <CalendarDays size={17} />
                  <input
                    type="date"
                    min="2026-09-27"
                    value={form.date}
                    onChange={(e) => update('date', e.target.value)}
                  />
                </div>
                {errors.date && <small>{errors.date}</small>}
              </label>

              <label>
                <span>Horário sugerido</span>
                <div className={errors.time ? 'visit-input error' : 'visit-input'}>
                  <Clock3 size={17} />
                  <input
                    type="time"
                    value={form.time}
                    onChange={(e) => update('time', e.target.value)}
                  />
                </div>
                {errors.time && <small>{errors.time}</small>}
              </label>

              <div className="visit-note">
                <MapPin />
                <span>
                  <strong>A visita ainda não estará confirmada.</strong>
                  O proprietário poderá aceitar o horário sugerido ou propor outro horário pelo painel.
                </span>
              </div>

              {errors.submit && <small className="visit-submit-error">{errors.submit}</small>}
              <button className="visit-submit" onClick={submit} disabled={saving}>
                {saving ? 'Enviando...' : 'Enviar solicitação de visita'}
              </button>
            </div>
          </>
        ) : (
          <div className="visit-success">
            <div><CheckCircle2 /></div>
            <span>Solicitação enviada</span>
            <h2>Recebemos seu pedido, {form.name.split(' ')[0]}.</h2>
            <p>
              Você sugeriu <strong>{form.date.split('-').reverse().join('/')}</strong> às{' '}
              <strong>{form.time}</strong>. A visita ficará como <strong>aguardando confirmação</strong>
              até o proprietário responder.
            </p>
            <section>
              <small>Código da solicitação</small>
              <strong>{bookingCode}</strong>
            </section>
            <button onClick={onClose}>Voltar para o site</button>
          </div>
        )}
      </div>
    </div>
  )
}

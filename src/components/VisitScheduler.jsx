import { useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, Clock3, MapPin, Phone, UserRound, X } from 'lucide-react'
import './visit.css'

const slots = ['09:00', '10:30', '14:00', '15:30', '17:00']

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
    time: '14:00',
  })
  const [errors, setErrors] = useState({})

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

  const submit = () => {
    const next = {}
    if (form.name.trim().length < 3) next.name = 'Informe seu nome.'
    if (onlyDigits(form.phone).length < 10) next.phone = 'Informe um telefone válido.'
    if (!form.date) next.date = 'Escolha uma data.'
    if (!form.time) next.time = 'Escolha um horário.'
    setErrors(next)
    if (Object.keys(next).length) return

    const visit = {
      id: bookingCode,
      ...form,
      createdAt: new Date().toISOString(),
      status: 'scheduled',
    }

    const stored = JSON.parse(localStorage.getItem('espacoon_visits') || '[]')
    localStorage.setItem('espacoon_visits', JSON.stringify([...stored, visit]))
    setDone(true)
  }

  return (
    <div className="visit-backdrop" role="dialog" aria-modal="true" aria-label="Agendar visita">
      <div className="visit-modal">
        <button className="visit-close" onClick={onClose} aria-label="Fechar">
          <X />
        </button>

        {!done ? (
          <>
            <div className="visit-hero">
              <span>Conheça antes de reservar</span>
              <h2>Agende uma visita ao espaço.</h2>
              <p>Escolha uma data e um horário. O agendamento fica salvo neste navegador nesta fase de testes.</p>
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
                <span>Data da visita</span>
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

              <div className="visit-times">
                <span>Horário</span>
                <div>
                  {slots.map((slot) => (
                    <button
                      key={slot}
                      className={form.time === slot ? 'selected' : ''}
                      onClick={() => update('time', slot)}
                    >
                      <Clock3 size={15} />
                      {slot}
                    </button>
                  ))}
                </div>
              </div>

              <div className="visit-note">
                <MapPin />
                <span>
                  <strong>Visita rápida e sem compromisso</strong>
                  Depois vamos integrar confirmação automática por WhatsApp.
                </span>
              </div>

              <button className="visit-submit" onClick={submit}>
                Confirmar agendamento
              </button>
            </div>
          </>
        ) : (
          <div className="visit-success">
            <div><CheckCircle2 /></div>
            <span>Visita agendada</span>
            <h2>Nos vemos em breve, {form.name.split(' ')[0]}.</h2>
            <p>
              Sua visita foi marcada para <strong>{form.date.split('-').reverse().join('/')}</strong> às{' '}
              <strong>{form.time}</strong>.
            </p>
            <section>
              <small>Código</small>
              <strong>{bookingCode}</strong>
            </section>
            <button onClick={onClose}>Voltar para o site</button>
          </div>
        )}
      </div>
    </div>
  )
}

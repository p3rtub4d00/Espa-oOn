import { useMemo, useState } from 'react'
import ContractFlow from './ContractFlow'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  LockKeyhole,
  QrCode,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react'
import './booking.css'

const PRICES = {
  weekday: { '12h': 450, '24h': 650 },
  fridaySaturday: { '12h': 700, '24h': 950 },
  sunday: { '12h': 650, '24h': 850 },
}

function getPrice(day, period) {
  const date = new Date(2026, 9, day)
  const weekday = date.getDay()
  if (weekday === 0) return PRICES.sunday[period]
  if (weekday === 5 || weekday === 6) return PRICES.fridaySaturday[period]
  return PRICES.weekday[period]
}

function money(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function onlyDigits(value) {
  return value.replace(/\D/g, '')
}

function formatCpf(value) {
  const digits = onlyDigits(value).slice(0, 11)
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function formatPhone(value) {
  const digits = onlyDigits(value).slice(0, 11)
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  }
  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
}

export default function BookingFlow({ day, onClose, onReserved }) {
  const [step, setStep] = useState(1)
  const [period, setPeriod] = useState('12h')
  const [copied, setCopied] = useState(false)
  const [contractOpen, setContractOpen] = useState(false)
  const [confirmedReservation, setConfirmedReservation] = useState(null)
  const [form, setForm] = useState({
    name: '',
    cpf: '',
    phone: '',
    address: '',
  })
  const [errors, setErrors] = useState({})

  const price = getPrice(day, period)
  const dateLabel = String(day).padStart(2, '0') + '/10/2026'
  const reservationId = useMemo(
    () => 'ESP-2026-' + String(day).padStart(2, '0') + '-' + Math.floor(1000 + Math.random() * 9000),
    [day],
  )
  const pixCode = useMemo(
    () => '00020126580014BR.GOV.BCB.PIX0136ESPACOON-PAGAMENTO-SIMULADO-' + reservationId + '5204000053039865802BR5920ESPACOON DEMONSTRACAO6009PORTOVELHO62070503***6304ABCD',
    [reservationId],
  )

  const updateField = (field, value) => {
    let next = value
    if (field === 'cpf') next = formatCpf(value)
    if (field === 'phone') next = formatPhone(value)
    setForm((current) => ({ ...current, [field]: next }))
    setErrors((current) => ({ ...current, [field]: '' }))
  }

  const validate = () => {
    const next = {}
    if (form.name.trim().length < 3) next.name = 'Informe seu nome completo.'
    if (onlyDigits(form.cpf).length !== 11) next.cpf = 'Informe um CPF com 11 dígitos.'
    if (onlyDigits(form.phone).length < 10) next.phone = 'Informe um telefone válido.'
    if (form.address.trim().length < 8) next.address = 'Informe seu endereço.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const goToSummary = () => {
    if (validate()) setStep(3)
  }

  const copyPix = async () => {
    try {
      await navigator.clipboard.writeText(pixCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  const confirmPayment = () => {
    const reservation = {
      id: reservationId,
      day,
      date: dateLabel,
      period,
      price,
      customer: form,
      paymentStatus: 'approved-simulated',
      createdAt: new Date().toISOString(),
    }

    const stored = JSON.parse(localStorage.getItem('espacoon_reservations') || '[]')
    localStorage.setItem('espacoon_reservations', JSON.stringify([...stored, reservation]))
    setConfirmedReservation(reservation)
    setStep(4)
    onReserved?.(day)
  }

  return (
    <div className="booking-backdrop" role="dialog" aria-modal="true" aria-label="Finalizar reserva">
      <div className="booking-modal">
        <div className="booking-top">
          <div>
            <span className="booking-kicker">Reserva online</span>
            <strong>{dateLabel}</strong>
          </div>
          <button className="booking-close" onClick={onClose} aria-label="Fechar reserva">
            <X />
          </button>
        </div>

        <div className="booking-progress">
          {['Período', 'Seus dados', 'Pagamento', 'Confirmado'].map((label, index) => {
            const number = index + 1
            return (
              <div className={number <= step ? 'active' : ''} key={label}>
                <span>{number < step ? <Check size={14} /> : number}</span>
                <small>{label}</small>
              </div>
            )
          })}
        </div>

        <div className="booking-content">
          {step === 1 && (
            <div className="booking-step">
              <div className="booking-heading">
                <span>Etapa 1 de 4</span>
                <h2>Quanto tempo você quer aproveitar o espaço?</h2>
                <p>Escolha o período da locação. O valor é calculado automaticamente conforme o dia.</p>
              </div>

              <div className="period-grid">
                {[
                  ['12h', '12 horas', 'Ideal para eventos durante o dia ou noite'],
                  ['24h', '24 horas', 'Mais liberdade para aproveitar sem pressa'],
                ].map(([value, title, description]) => (
                  <button
                    className={period === value ? 'period-card selected' : 'period-card'}
                    onClick={() => setPeriod(value)}
                    key={value}
                  >
                    <span className="period-icon"><Clock3 /></span>
                    <span>
                      <strong>{title}</strong>
                      <small>{description}</small>
                    </span>
                    <b>{money(getPrice(day, value))}</b>
                    <i>{period === value && <Check size={15} />}</i>
                  </button>
                ))}
              </div>

              <div className="booking-security">
                <ShieldCheck />
                <span>
                  <strong>Data protegida durante o processo</strong>
                  Nesta versão de testes, o bloqueio é simulado no navegador.
                </span>
              </div>

              <button className="booking-primary" onClick={() => setStep(2)}>
                Continuar com {period}
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="booking-step">
              <div className="booking-heading">
                <span>Etapa 2 de 4</span>
                <h2>Agora precisamos dos seus dados.</h2>
                <p>Essas informações serão usadas futuramente para gerar o contrato de locação.</p>
              </div>

              <div className="booking-form">
                <label className="full">
                  <span>Nome completo</span>
                  <div className={errors.name ? 'input-wrap error' : 'input-wrap'}>
                    <UserRound size={18} />
                    <input
                      value={form.name}
                      onChange={(event) => updateField('name', event.target.value)}
                      placeholder="Ex.: João da Silva"
                    />
                  </div>
                  {errors.name && <small>{errors.name}</small>}
                </label>

                <label>
                  <span>CPF</span>
                  <div className={errors.cpf ? 'input-wrap error' : 'input-wrap'}>
                    <input
                      inputMode="numeric"
                      value={form.cpf}
                      onChange={(event) => updateField('cpf', event.target.value)}
                      placeholder="000.000.000-00"
                    />
                  </div>
                  {errors.cpf && <small>{errors.cpf}</small>}
                </label>

                <label>
                  <span>WhatsApp / telefone</span>
                  <div className={errors.phone ? 'input-wrap error' : 'input-wrap'}>
                    <input
                      inputMode="tel"
                      value={form.phone}
                      onChange={(event) => updateField('phone', event.target.value)}
                      placeholder="(69) 99999-9999"
                    />
                  </div>
                  {errors.phone && <small>{errors.phone}</small>}
                </label>

                <label className="full">
                  <span>Endereço</span>
                  <div className={errors.address ? 'input-wrap error' : 'input-wrap'}>
                    <input
                      value={form.address}
                      onChange={(event) => updateField('address', event.target.value)}
                      placeholder="Rua, número e bairro"
                    />
                  </div>
                  {errors.address && <small>{errors.address}</small>}
                </label>
              </div>

              <div className="booking-actions">
                <button className="booking-back" onClick={() => setStep(1)}>
                  <ArrowLeft size={17} /> Voltar
                </button>
                <button className="booking-primary" onClick={goToSummary}>
                  Revisar reserva
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="booking-step">
              <div className="booking-heading">
                <span>Etapa 3 de 4</span>
                <h2>Revise e simule o pagamento por Pix.</h2>
                <p>Nenhuma cobrança real será feita nesta fase do projeto.</p>
              </div>

              <div className="booking-summary">
                <div>
                  <span>Data</span>
                  <strong>{dateLabel}</strong>
                </div>
                <div>
                  <span>Período</span>
                  <strong>{period === '12h' ? '12 horas' : '24 horas'}</strong>
                </div>
                <div>
                  <span>Responsável</span>
                  <strong>{form.name}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong className="summary-price">{money(price)}</strong>
                </div>
              </div>

              <div className="pix-box">
                <div className="fake-qr">
                  <QrCode />
                  <span>PIX</span>
                </div>
                <div className="pix-copy">
                  <span>Pix copia e cola • demonstração</span>
                  <p>{pixCode}</p>
                  <button onClick={copyPix}>
                    {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                    {copied ? 'Copiado' : 'Copiar código'}
                  </button>
                </div>
              </div>

              <div className="simulation-note">
                <CreditCard />
                <span>
                  <strong>Ambiente de demonstração</strong>
                  O botão abaixo simula o webhook de pagamento aprovado do Mercado Pago.
                </span>
              </div>

              <div className="booking-actions">
                <button className="booking-back" onClick={() => setStep(2)}>
                  <ArrowLeft size={17} /> Corrigir dados
                </button>
                <button className="booking-primary payment" onClick={confirmPayment}>
                  <LockKeyhole size={17} />
                  Simular pagamento aprovado
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="booking-success">
              <div className="success-icon"><CheckCircle2 /></div>
              <span>Reserva confirmada</span>
              <h2>Pronto, {form.name.split(' ')[0]}!</h2>
              <p>
                A reserva de <strong>{dateLabel}</strong> foi registrada neste navegador como
                uma simulação. A data agora aparecerá indisponível na agenda.
              </p>

              <div className="success-ticket">
                <div>
                  <span>Reserva</span>
                  <strong>{reservationId}</strong>
                </div>
                <div>
                  <span>Período</span>
                  <strong>{period}</strong>
                </div>
                <div>
                  <span>Valor</span>
                  <strong>{money(price)}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong className="paid-status">Pagamento simulado aprovado</strong>
                </div>
              </div>

              <div className="next-contract">
                <ShieldCheck />
                <span>
                  <strong>Contrato disponível</strong>
                  Gere agora o documento da reserva e registre a assinatura eletrônica demonstrativa.
                </span>
              </div>

              <div className="booking-actions final-actions">
                <button className="booking-back" onClick={onClose}>
                  Voltar para o site
                </button>
                <button className="booking-primary" onClick={() => setContractOpen(true)}>
                  Gerar e assinar contrato
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {contractOpen && confirmedReservation && (
        <ContractFlow
          reservation={confirmedReservation}
          onClose={() => setContractOpen(false)}
        />
      )}
    </div>
  )
}

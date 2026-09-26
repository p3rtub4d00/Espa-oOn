import { useEffect, useMemo, useState } from 'react'
import ContractFlow from './ContractFlow'
import { getPriceForDay, loadSettings } from '../data/settings'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  FileSignature,
  LockKeyhole,
  QrCode,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react'
import './booking.css'

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

export default function BookingFlow({ day, settings = loadSettings(), onClose, onReserved }) {
  const [step, setStep] = useState(1)
  const [period, setPeriod] = useState('12h')
  const [copied, setCopied] = useState(false)
  const [contractOpen, setContractOpen] = useState(false)
  const [signedContract, setSignedContract] = useState(null)
  const [form, setForm] = useState({
    name: '',
    cpf: '',
    phone: '',
    address: '',
  })
  const [errors, setErrors] = useState({})

  const price = getPriceForDay(day, period, settings)
  const dateLabel = String(day).padStart(2, '0') + '/10/2026'
  const reservationId = useMemo(
    () => 'ESP-2026-' + String(day).padStart(2, '0') + '-' + Math.floor(1000 + Math.random() * 9000),
    [day],
  )
  const pixCode = useMemo(
    () => '00020126580014BR.GOV.BCB.PIX0136ESPACOON-PAGAMENTO-SIMULADO-' + reservationId + '5204000053039865802BR5920ESPACOON DEMONSTRACAO6009PORTOVELHO62070503***6304ABCD',
    [reservationId],
  )

  const draftReservation = {
    id: reservationId,
    day,
    date: dateLabel,
    period,
    price,
    customer: form,
    paymentStatus: 'awaiting-payment',
    createdAt: new Date().toISOString(),
  }

  useEffect(() => {
    if (step !== 5) return
    const timer = window.setTimeout(() => {
      onClose()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 1800)
    return () => window.clearTimeout(timer)
  }, [step, onClose])

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

  const goToContract = () => {
    if (!validate()) return
    setStep(3)
    setContractOpen(true)
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
    if (!signedContract) return

    const reservation = {
      ...draftReservation,
      paymentStatus: 'approved-simulated',
      contractId: signedContract.id,
      paidAt: new Date().toISOString(),
    }

    const stored = JSON.parse(localStorage.getItem('espacoon_reservations') || '[]')
    const withoutDuplicate = stored.filter((item) => item.id !== reservation.id)
    localStorage.setItem('espacoon_reservations', JSON.stringify([...withoutDuplicate, reservation]))

    const contracts = JSON.parse(localStorage.getItem('espacoon_contracts') || '[]')
    const updatedContracts = contracts.map((item) =>
      item.id === signedContract.id
        ? { ...item, status: 'signed-paid-demo', paymentStatus: 'approved-simulated', paidAt: reservation.paidAt }
        : item,
    )
    localStorage.setItem('espacoon_contracts', JSON.stringify(updatedContracts))

    onReserved?.(day)
    setStep(5)
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
          {['Período', 'Seus dados', 'Contrato', 'Pagamento', 'Confirmado'].map((label, index) => {
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
                <span>Etapa 1 de 5</span>
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
                    <b>{money(getPriceForDay(day, value, settings))}</b>
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
                <span>Etapa 2 de 5</span>
                <h2>Agora precisamos dos seus dados.</h2>
                <p>Seu nome, data, período e valor serão inseridos automaticamente no contrato.</p>
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
                <button className="booking-primary" onClick={goToContract}>
                  <FileSignature size={17} />
                  Ler e assinar contrato
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="booking-step">
              <div className="booking-heading">
                <span>Etapa 3 de 5</span>
                <h2>Assine o contrato antes do pagamento.</h2>
                <p>O pagamento só será liberado depois que o contrato estiver assinado.</p>
              </div>

              <div className="booking-summary">
                <div><span>Locatário</span><strong>{form.name}</strong></div>
                <div><span>Data</span><strong>{dateLabel}</strong></div>
                <div><span>Período</span><strong>{period}</strong></div>
                <div><span>Valor do contrato</span><strong className="summary-price">{money(price)}</strong></div>
              </div>

              <div className="next-contract">
                <ShieldCheck />
                <span>
                  <strong>{signedContract ? 'Contrato assinado' : 'Assinatura necessária'}</strong>
                  {signedContract
                    ? 'O documento foi assinado. Você já pode seguir para o pagamento.'
                    : 'Leia o documento e faça sua assinatura para liberar a próxima etapa.'}
                </span>
              </div>

              <div className="booking-actions">
                <button className="booking-back" onClick={() => setStep(2)}>
                  <ArrowLeft size={17} /> Corrigir dados
                </button>
                {!signedContract ? (
                  <button className="booking-primary" onClick={() => setContractOpen(true)}>
                    <FileSignature size={17} />
                    Abrir contrato
                  </button>
                ) : (
                  <button className="booking-primary" onClick={() => setStep(4)}>
                    Ir para pagamento
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="booking-step">
              <div className="booking-heading">
                <span>Etapa 4 de 5</span>
                <h2>Contrato assinado. Agora finalize o pagamento.</h2>
                <p>Nenhuma cobrança real será feita nesta fase do projeto.</p>
              </div>

              <div className="booking-summary">
                <div><span>Data</span><strong>{dateLabel}</strong></div>
                <div><span>Período</span><strong>{period === '12h' ? '12 horas' : '24 horas'}</strong></div>
                <div><span>Responsável</span><strong>{form.name}</strong></div>
                <div><span>Total</span><strong className="summary-price">{money(price)}</strong></div>
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
                  <strong>Contrato {signedContract?.id}</strong>
                  O pagamento só aparece porque o contrato já foi assinado.
                </span>
              </div>

              <div className="booking-actions">
                <button className="booking-back" onClick={() => setStep(3)}>
                  <ArrowLeft size={17} /> Voltar
                </button>
                <button className="booking-primary payment" onClick={confirmPayment}>
                  <LockKeyhole size={17} />
                  Simular pagamento aprovado
                </button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="booking-success">
              <div className="success-icon"><CheckCircle2 /></div>
              <span>Reserva confirmada</span>
              <h2>Pagamento confirmado!</h2>
              <p>
                A reserva de <strong>{dateLabel}</strong> foi concluída para <strong>{form.name}</strong>.
                Você será levado de volta para a página inicial.
              </p>

              <div className="success-ticket">
                <div><span>Reserva</span><strong>{reservationId}</strong></div>
                <div><span>Contrato</span><strong>{signedContract?.id}</strong></div>
                <div><span>Valor</span><strong>{money(price)}</strong></div>
                <div><span>Status</span><strong className="paid-status">Pago • simulação</strong></div>
              </div>
            </div>
          )}
        </div>
      </div>

      {contractOpen && (
        <ContractFlow
          reservation={draftReservation}
          onClose={() => setContractOpen(false)}
          onSigned={(contract) => {
            setSignedContract(contract)
            setContractOpen(false)
            setStep(3)
          }}
          continueLabel="Contrato assinado — ir para pagamento"
        />
      )}
    </div>
  )
}

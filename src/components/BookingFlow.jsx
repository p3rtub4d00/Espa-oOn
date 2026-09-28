import { useEffect, useMemo, useState } from 'react'
import ContractFlow from './ContractFlow'
import { getPriceForDate, loadSettings } from '../data/settings'
import { api } from '../data/api'
import { sharePaymentDocuments } from '../utils/documents'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  FileSignature,
  ShieldCheck,
  Share2,
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

function isValidCpf(value) {
  const cpf = onlyDigits(value)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false

  const calcDigit = (base, factor) => {
    let total = 0
    for (const digit of base) {
      total += Number(digit) * factor--
    }
    const remainder = (total * 10) % 11
    return remainder === 10 ? 0 : remainder
  }

  const first = calcDigit(cpf.slice(0, 9), 10)
  const second = calcDigit(cpf.slice(0, 10), 11)
  return first === Number(cpf[9]) && second === Number(cpf[10])
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

export default function BookingFlow({ dateISO, settings = loadSettings(), onClose, onReserved }) {
  const [step, setStep] = useState(1)
  const [period, setPeriod] = useState('12h')
  const [copied, setCopied] = useState(false)
  const [contractOpen, setContractOpen] = useState(false)
  const [signedContract, setSignedContract] = useState(null)
  const [deliveryStatus, setDeliveryStatus] = useState('idle')
  const [paidReservation, setPaidReservation] = useState(null)
  const [pixPayment, setPixPayment] = useState(null)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [checkingPayment, setCheckingPayment] = useState(false)
  const [asaasStatus, setAsaasStatus] = useState('')
  const [holdSeconds, setHoldSeconds] = useState(15 * 60)
  const [form, setForm] = useState({
    name: '',
    cpf: '',
    phone: '',
    address: '',
  })
  const [errors, setErrors] = useState({})

  const parsedDate = useMemo(() => {
    const [year, month, day] = dateISO.split('-').map(Number)
    return new Date(year, month - 1, day, 12)
  }, [dateISO])

  const price = getPriceForDate(dateISO, period, settings)
  const dateLabel = useMemo(() => {
    const [year, month, day] = dateISO.split('-')
    return day + '/' + month + '/' + year
  }, [dateISO])

  const reservationId = useMemo(
    () => 'ESP-' + dateISO.replaceAll('-', '') + '-' + Math.floor(100000 + Math.random() * 900000),
    [dateISO],
  )
  const draftReservation = {
    id: reservationId,
    day: parsedDate.getDate(),
    date: dateLabel,
    dateISO,
    period,
    price,
    customer: form,
    paymentStatus: 'awaiting-payment',
    createdAt: new Date().toISOString(),
  }

  useEffect(() => {
    if (step !== 5 || deliveryStatus === 'sharing') return
    const timer = window.setTimeout(() => {
      onClose()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 4200)
    return () => window.clearTimeout(timer)
  }, [step, deliveryStatus, onClose])

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
    if (!isValidCpf(form.cpf)) next.cpf = 'Informe um CPF válido.'
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
    const payload = pixPayment?.pix?.payload
    if (!payload) return
    try {
      await navigator.clipboard.writeText(payload)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  const finishPaidReservation = async (result) => {
    if (!result?.reservation || !result?.contract || step === 5) return
    setPaidReservation(result.reservation)
    setSignedContract(result.contract)
    onReserved?.(dateISO)
    setStep(5)
    setDeliveryStatus('sharing')

    try {
      const delivery = await sharePaymentDocuments(result.reservation, result.contract)
      setDeliveryStatus(delivery.method)
    } catch {
      setDeliveryStatus('error')
    }
  }

  const createPixCharge = async () => {
    if (!signedContract || paymentLoading || pixPayment) return
    setPaymentLoading(true)
    setPaymentError('')

    try {
      const result = await api.createPixPayment(draftReservation, signedContract.id)

      if (result.paid) {
        await finishPaidReservation(result)
        return
      }

      if (result.manualReview) {
        setPaymentError('O pagamento foi recebido, mas a reserva precisa de conferência manual. Entre em contato com o responsável pelo espaço.')
        return
      }

      setPixPayment(result)
      setAsaasStatus(result.payment?.status || '')
      if (result.reservation?.holdUntil) {
        const remaining = Math.max(
          0,
          Math.floor((new Date(result.reservation.holdUntil).getTime() - Date.now()) / 1000),
        )
        setHoldSeconds(remaining)
      }
    } catch (error) {
      setPaymentError(error.message || 'Não foi possível gerar o Pix.')
    } finally {
      setPaymentLoading(false)
    }
  }

  const verifyPayment = async () => {
    if (!pixPayment || checkingPayment || step !== 4) return
    setCheckingPayment(true)
    try {
      const result = await api.paymentStatus(reservationId)
      setAsaasStatus(result.asaasStatus || '')
      if (result.paid) {
        await finishPaidReservation(result)
      } else if (result.manualReview) {
        setPaymentError('O pagamento foi recebido, mas a reserva precisa de conferência manual. Entre em contato com o responsável pelo espaço.')
      } else if (result.expired) {
        setPaymentError('O prazo desta cobrança expirou. A data foi liberada e você precisa gerar um novo Pix.')
        setPixPayment(null)
        setHoldSeconds(0)
      }
    } catch (error) {
      setPaymentError(error.message || 'Não foi possível verificar o pagamento.')
    } finally {
      setCheckingPayment(false)
    }
  }

  useEffect(() => {
    if (step === 4 && signedContract && !pixPayment && !paymentLoading) {
      createPixCharge()
    }
  }, [step, signedContract])

  useEffect(() => {
    if (step !== 4 || !pixPayment) return

    const timer = window.setInterval(() => {
      verifyPayment()
    }, 10000)

    return () => window.clearInterval(timer)
  }, [step, pixPayment, reservationId])

  useEffect(() => {
    if (step !== 4 || !pixPayment) return

    const timer = window.setInterval(() => {
      setHoldSeconds((current) => Math.max(0, current - 1))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [step, pixPayment])

  const resendDocuments = async () => {
    if (!signedContract || !paidReservation) return

    setDeliveryStatus('sharing')
    try {
      const result = await sharePaymentDocuments(paidReservation, signedContract)
      setDeliveryStatus(result.method)
    } catch {
      setDeliveryStatus('error')
    }
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
                    <b>{money(getPriceForDate(dateISO, value, settings))}</b>
                    <i>{period === value && <Check size={15} />}</i>
                  </button>
                ))}
              </div>

              <div className="booking-security">
                <ShieldCheck />
                <span>
                  <strong>Data protegida durante o processo</strong>
                  A data é verificada no servidor e fica bloqueada quando a cobrança Pix é criada.
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
                <h2>Contrato assinado. Agora pague por Pix.</h2>
                <p>A cobrança é gerada pelo Asaas e a confirmação acontece automaticamente.</p>
              </div>

              <div className="booking-summary">
                <div><span>Data</span><strong>{dateLabel}</strong></div>
                <div><span>Período</span><strong>{period === '12h' ? '12 horas' : '24 horas'}</strong></div>
                <div><span>Responsável</span><strong>{form.name}</strong></div>
                <div><span>Total</span><strong className="summary-price">{money(price)}</strong></div>
              </div>

              {paymentLoading && (
                <div className="asaas-payment-loading">
                  Gerando cobrança Pix segura...
                </div>
              )}

              {paymentError && (
                <div className="asaas-payment-error">
                  <strong>Não foi possível continuar.</strong>
                  <span>{paymentError}</span>
                  {!pixPayment && (
                    <button onClick={createPixCharge}>Tentar gerar Pix novamente</button>
                  )}
                </div>
              )}

              {pixPayment && (
                <>
                  <div className="pix-box asaas-pix-box">
                    <div className="asaas-qr">
                      {pixPayment.pix?.encodedImage ? (
                        <img
                          src={'data:image/png;base64,' + pixPayment.pix.encodedImage}
                          alt="QR Code Pix da reserva"
                        />
                      ) : (
                        <div className="qr-placeholder">QR</div>
                      )}
                    </div>

                    <div className="pix-copy">
                      <span>Pix copia e cola • Asaas</span>
                      <p>{pixPayment.pix?.payload}</p>
                      <button onClick={copyPix}>
                        {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                        {copied ? 'Copiado' : 'Copiar código Pix'}
                      </button>
                    </div>
                  </div>

                  <div className="asaas-payment-status">
                    <span className="payment-pulse" />
                    <div>
                      <strong>
                        {asaasStatus === 'CONFIRMED'
                          ? 'Pagamento confirmado, aguardando liquidação'
                          : 'Aguardando pagamento'}
                      </strong>
                      <small>
                        {checkingPayment
                          ? 'Verificando agora...'
                          : 'O sistema verifica automaticamente. Você também pode conferir manualmente.'}
                      </small>
                      {asaasStatus !== 'CONFIRMED' && (
                        <small>
                          Reserva temporária da data: {String(Math.floor(holdSeconds / 60)).padStart(2, '0')}:
                          {String(holdSeconds % 60).padStart(2, '0')}
                        </small>
                      )}
                    </div>
                    <button onClick={verifyPayment} disabled={checkingPayment}>
                      {checkingPayment ? 'Verificando...' : 'Verificar pagamento'}
                    </button>
                  </div>

                  {pixPayment.pix?.expirationDate && (
                    <p className="pix-expiration">
                      QR Code válido até {new Date(pixPayment.pix.expirationDate).toLocaleString('pt-BR')}.
                    </p>
                  )}
                </>
              )}

              <div className="payment-note">
                <ShieldCheck />
                <span>
                  <strong>Contrato {signedContract?.id}</strong>
                  A reserva só será confirmada depois que o Asaas informar o recebimento do Pix.
                </span>
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
                O pagamento foi confirmado pelo Asaas. O comprovante e o contrato foram preparados para compartilhamento.
              </p>

              <div className="success-ticket">
                <div><span>Reserva</span><strong>{reservationId}</strong></div>
                <div><span>Contrato</span><strong>{signedContract?.id}</strong></div>
                <div><span>Valor</span><strong>{money(price)}</strong></div>
                <div><span>Status</span><strong className="paid-status">Pago via Pix</strong></div>
              </div>

              <div className="document-delivery-status">
                <Share2 />
                <span>
                  <strong>
                    {deliveryStatus === 'share'
                      ? 'Documentos compartilhados'
                      : deliveryStatus === 'download-whatsapp'
                        ? 'PDFs gerados e WhatsApp aberto'
                        : deliveryStatus === 'cancelled'
                          ? 'Compartilhamento cancelado'
                          : deliveryStatus === 'error'
                            ? 'Não foi possível compartilhar automaticamente'
                            : 'Preparando documentos'}
                  </strong>
                  Comprovante de pagamento + contrato assinado.
                </span>
              </div>

              {(deliveryStatus === 'cancelled' || deliveryStatus === 'error') && (
                <button className="booking-primary resend-documents" onClick={resendDocuments}>
                  <Share2 size={17} />
                  Enviar documentos novamente
                </button>
              )}
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

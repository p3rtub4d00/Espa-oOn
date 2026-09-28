import { useMemo, useState } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  KeyRound,
  Phone,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import { createContractPdf, createReceiptPdf, downloadPdf } from '../utils/documents'
import { api } from '../data/api'
import './reservationLookup.css'

function money(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0))
}

function digits(value = '') {
  return String(value).replace(/\D/g, '')
}

function maskPhone(phone = '') {
  const d = digits(phone)
  if (d.length < 4) return phone || '-'
  return '•••• ••••-' + d.slice(-4)
}

export default function ReservationLookup({ onClose }) {
  const [code, setCode] = useState('')
  const [phoneEnd, setPhoneEnd] = useState('')
  const [error, setError] = useState('')
  const [reservation, setReservation] = useState(null)
  const [contract, setContract] = useState(null)
  const [loading, setLoading] = useState(false)

  const paymentLabel = useMemo(() => {
    if (!reservation) return ''
    return reservation.paymentStatus === 'paid'
      ? 'Pagamento confirmado'
      : reservation.paymentStatus === 'confirmed-asaas'
        ? 'Confirmado, aguardando liquidação'
        : reservation.paymentStatus === 'manual-review'
          ? 'Pagamento em conferência'
          : reservation.paymentStatus === 'refunded'
            ? 'Pagamento estornado'
            : reservation.paymentStatus === 'cancelled'
              ? 'Reserva cancelada'
              : 'Aguardando pagamento'
  }, [reservation])

  const search = async (event) => {
    event.preventDefault()
    setError('')
    setReservation(null)
    setContract(null)

    const normalizedCode = code.trim().toUpperCase()
    if (!normalizedCode.startsWith('ESP-')) {
      setError('Informe um código de reserva válido.')
      return
    }

    if (digits(phoneEnd).length !== 4) {
      setError('Informe os 4 últimos dígitos do telefone.')
      return
    }

    setLoading(true)
    try {
      const result = await api.lookupReservation(normalizedCode, digits(phoneEnd))
      setReservation(result.reservation)
      setContract(result.contract || null)
    } catch (error) {
      setError(error.message || 'Reserva não encontrada.')
    } finally {
      setLoading(false)
    }
  }

  const downloadReceipt = () => {
    if (!reservation) return
    const doc = createReceiptPdf(reservation, contract)
    downloadPdf(doc, 'comprovante-' + reservation.id + '.pdf')
  }

  const downloadContract = () => {
    if (!contract) return
    const doc = createContractPdf(contract)
    downloadPdf(doc, 'contrato-' + contract.id + '.pdf')
  }

  const reset = () => {
    setReservation(null)
    setContract(null)
    setError('')
    setCode('')
    setPhoneEnd('')
  }

  return (
    <div className="lookup-backdrop" role="dialog" aria-modal="true" aria-label="Consultar reserva">
      <div className="lookup-modal">
        <div className="lookup-top">
          <div>
            <span>Área do cliente</span>
            <strong>Consultar minha reserva</strong>
          </div>
          <button onClick={onClose} aria-label="Fechar consulta">
            <X />
          </button>
        </div>

        {!reservation ? (
          <div className="lookup-content">
            <div className="lookup-heading">
              <div className="lookup-icon"><Search /></div>
              <h2>Consulte os dados da sua reserva.</h2>
              <p>
                Informe o código recebido no momento da reserva e os 4 últimos dígitos do telefone
                usado no cadastro.
              </p>
            </div>

            <form onSubmit={search} className="lookup-form">
              <label>
                <span>Código da reserva</span>
                <div>
                  <KeyRound size={18} />
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="ESP-2026-15-4832"
                    autoComplete="off"
                  />
                </div>
              </label>

              <label>
                <span>4 últimos dígitos do telefone</span>
                <div>
                  <Phone size={18} />
                  <input
                    inputMode="numeric"
                    maxLength={4}
                    value={phoneEnd}
                    onChange={(e) => setPhoneEnd(digits(e.target.value).slice(0, 4))}
                    placeholder="1234"
                  />
                </div>
              </label>

              {error && <p className="lookup-error">{error}</p>}

              <button className="lookup-submit" disabled={loading}>
                <Search size={17} />
                {loading ? 'Consultando...' : 'Consultar reserva'}
              </button>
            </form>

            <div className="lookup-note">
              <ShieldCheck />
              <span>
                <strong>Consulta protegida</strong>
                A consulta usa o código da reserva e os últimos dígitos do telefone informado no cadastro.
              </span>
            </div>
          </div>
        ) : (
          <div className="lookup-content">
            <div className="lookup-success-head">
              <div><CheckCircle2 /></div>
              <span>Reserva localizada</span>
              <h2>{reservation.id}</h2>
              <p>Confira abaixo os dados registrados para sua locação.</p>
            </div>

            <div className="lookup-summary">
              <div>
                <span>Cliente</span>
                <strong>{reservation.customer?.name || '-'}</strong>
                <small>{maskPhone(reservation.customer?.phone)}</small>
              </div>
              <div>
                <span>Data</span>
                <strong>{reservation.date || '-'}</strong>
              </div>
              <div>
                <span>Período</span>
                <strong>{reservation.period || '-'}</strong>
              </div>
              <div>
                <span>Valor</span>
                <strong>{money(reservation.price)}</strong>
              </div>
            </div>

            <div className="lookup-status-grid">
              <article>
                <CalendarDays />
                <div>
                  <span>Status da reserva</span>
                  <strong>Confirmada</strong>
                </div>
              </article>
              <article>
                <CheckCircle2 />
                <div>
                  <span>Pagamento</span>
                  <strong>{paymentLabel}</strong>
                </div>
              </article>
              <article>
                <FileCheck2 />
                <div>
                  <span>Contrato</span>
                  <strong>{contract ? 'Assinado' : 'Não localizado'}</strong>
                </div>
              </article>
            </div>

            {contract && (
              <div className="lookup-contract">
                <div>
                  <span>Contrato</span>
                  <strong>{contract.id}</strong>
                  <small>Hash {contract.hash || '-'}</small>
                </div>
                <i className={contract.paymentStatus === 'paid' ? 'paid' : 'pending'}>
                  {contract.paymentStatus === 'paid' ? 'Assinado e pago' : 'Assinado'}
                </i>
              </div>
            )}

            <div className="lookup-actions">
              {reservation.paymentStatus === 'paid' && (
                <button onClick={downloadReceipt}>
                  <Download size={17} />
                  Baixar comprovante
                </button>
              )}
              {contract && (
                <button onClick={downloadContract}>
                  <FileText size={17} />
                  Baixar contrato
                </button>
              )}
            </div>

            <button className="lookup-new-search" onClick={reset}>
              Consultar outra reserva
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  CalendarCheck2,
  CircleDollarSign,
  Clock3,
  Gauge,
  Settings2,
  Users,
  WalletCards,
  FileCheck2,
  Images,
  ListPlus,
  ChevronLeft,
  ChevronRight,
  X,
  Phone,
  FileText,
  CheckCircle2,
} from 'lucide-react'
import ContractsPanel from './ContractsPanel'
import ContentManager from './ContentManager'
import { loadSettings } from '../data/settings'
import { api } from '../data/api'
import './admin.css'

const menu = [
  ['overview', 'Visão geral', Gauge],
  ['calendar', 'Agenda', CalendarDays],
  ['reservations', 'Reservas', WalletCards],
  ['visits', 'Visitas', CalendarCheck2],
  ['contracts', 'Contratos', FileCheck2],
  ['gallery', 'Galeria', Images],
  ['amenities', 'Estrutura', ListPlus],
  ['prices', 'Preços', CircleDollarSign],
]

function money(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function normalizeWhatsAppNumber(phone = '') {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  return digits.startsWith('55') ? digits : '55' + digits
}

function openWhatsAppConfirmation(visit, date, time) {
  const number = normalizeWhatsAppNumber(visit.phone)
  if (!number) return

  const formattedDate = date ? date.split('-').reverse().join('/') : ''
  const message = [
    'Olá, ' + visit.name + '!',
    '',
    'Sua visita ao EspaçoOn foi confirmada.',
    'Data: ' + formattedDate,
    'Horário: ' + time,
    '',
    'Se precisar alterar o horário, responda por aqui.',
  ].join('\n')

  window.open(
    'https://wa.me/' + number + '?text=' + encodeURIComponent(message),
    '_blank',
    'noopener,noreferrer',
  )
}

export default function AdminPanel({ onClose }) {
  const [active, setActive] = useState('overview')
  const [reservations, setReservations] = useState([])
  const [visits, setVisits] = useState([])
  const [settings, setSettings] = useState(loadSettings)
  const [loading, setLoading] = useState(true)
  const [adminError, setAdminError] = useState('')
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selectedReservation, setSelectedReservation] = useState(null)

  useEffect(() => {
    let activeRequest = true

    Promise.all([
      api.adminReservations(),
      api.adminVisits(),
      api.getSettings(),
    ])
      .then(([reservationData, visitData, settingsData]) => {
        if (!activeRequest) return
        setReservations(reservationData)
        setVisits(visitData)
        setSettings(settingsData)
      })
      .catch((error) => {
        if (activeRequest) setAdminError(error.message || 'Não foi possível carregar o painel.')
      })
      .finally(() => {
        if (activeRequest) setLoading(false)
      })

    return () => {
      activeRequest = false
    }
  }, [])
  const prices = settings.prices
  const blockedDates = new Set(settings.blockedDates || [])

  const adminMonthDays = useMemo(() => {
    const year = calendarMonth.getFullYear()
    const month = calendarMonth.getMonth()
    const count = new Date(year, month + 1, 0).getDate()
    return Array.from({ length: count }, (_, i) => i + 1)
  }, [calendarMonth])

  const adminFirstWeekday = useMemo(
    () => new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay(),
    [calendarMonth],
  )

  const adminMonthLabel = useMemo(
    () => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
      .format(calendarMonth)
      .replace(/^./, (letter) => letter.toUpperCase()),
    [calendarMonth],
  )

  const toISODate = (year, monthIndex, day) =>
    [year, String(monthIndex + 1).padStart(2, '0'), String(day).padStart(2, '0')].join('-')

  const reservationISO = (reservation) => {
    if (reservation.dateISO) return reservation.dateISO
    const match = String(reservation.date || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    return match ? match[3] + '-' + match[2] + '-' + match[1] : ''
  }

  const persistSettings = async (next) => {
    setSettings(next)
    try {
      const saved = await api.saveSettings(next)
      setSettings(saved)
    } catch (error) {
      setAdminError(error.message || 'Não foi possível salvar as configurações.')
    }
  }

  const revenue = useMemo(
    () => reservations
      .filter((item) => ['paid', 'approved-simulated'].includes(item.paymentStatus))
      .reduce((sum, item) => sum + Number(item.price || 0), 0),
    [reservations],
  )

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span>E</span>
          <strong>EspaçoOn</strong>
          <small>Admin</small>
        </div>

        <nav>
          {menu.map(([id, label, Icon]) => (
            <button className={active === id ? 'active' : ''} onClick={() => setActive(id)} key={id}>
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <button className="admin-back" onClick={onClose}>
          <ArrowLeft size={17} />
          Voltar ao site
        </button>
      </aside>

      <main className="admin-main">
        <header className="admin-header">
          <div>
            <span>Painel administrativo</span>
            <h1>{menu.find(([id]) => id === active)?.[1]}</h1>
          </div>
          <div className="admin-user">
            <div>AD</div>
            <span><strong>Administrador</strong><small>Sistema online</small></span>
          </div>
        </header>

        {adminError && <div className="admin-demo-note">{adminError}</div>}
        {loading && <div className="admin-demo-note">Carregando dados online...</div>}

        {active === 'overview' && (
          <>
            <section className="admin-stats">
              <article>
                <div><WalletCards /></div>
                <span>Reservas</span>
                <strong>{reservations.length}</strong>
                <small>salvas no sistema</small>
              </article>
              <article>
                <div><CircleDollarSign /></div>
                <span>Receita confirmada</span>
                <strong>{money(revenue)}</strong>
                <small>pagamentos recebidos</small>
              </article>
              <article>
                <div><CalendarCheck2 /></div>
                <span>Visitas</span>
                <strong>{visits.length}</strong>
                <small>solicitações online</small>
              </article>
              <article>
                <div><Users /></div>
                <span>Clientes</span>
                <strong>{new Set(reservations.map((r) => r.customer?.phone)).size}</strong>
                <small>contatos cadastrados</small>
              </article>
            </section>

            <section className="admin-grid">
              <div className="admin-card">
                <div className="admin-card-title">
                  <div><span>Próximas reservas</span><strong>Outubro 2026</strong></div>
                  <button onClick={() => setActive('reservations')}>Ver todas</button>
                </div>
                <div className="admin-list">
                  {reservations.slice(0, 5).map((reservation) => (
                    <div key={reservation.id}>
                      <span className="date-box">
                        <b>{String(reservation.day).padStart(2, '0')}</b>
                        <small>OUT</small>
                      </span>
                      <span className="list-main">
                        <strong>{reservation.customer?.name || 'Cliente'}</strong>
                        <small>{reservation.period} • {reservation.customer?.phone || 'Sem telefone'}</small>
                      </span>
                      <span className="list-value">{money(reservation.price)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="admin-card">
                <div className="admin-card-title">
                  <div><span>Visitas</span><strong>Próximos agendamentos</strong></div>
                  <button onClick={() => setActive('visits')}>Ver todas</button>
                </div>
                <div className="admin-list compact">
                  {visits.length ? visits.slice(0, 5).map((visit) => (
                    <div key={visit.id}>
                      <span className="round-icon"><Clock3 /></span>
                      <span className="list-main">
                        <strong>{visit.name}</strong>
                        <small>{(visit.confirmedDate || visit.requestedDate || '-').split('-').reverse().join('/')} às {visit.confirmedTime || visit.requestedTime || '-'}</small>
                      </span>
                    </div>
                  )) : (
                    <div className="admin-empty">Nenhuma visita foi solicitada ainda.</div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {active === 'calendar' && (
          <section className="admin-card large">
            <div className="admin-card-title admin-calendar-title">
              <div><span>Agenda mensal</span><strong>{adminMonthLabel}</strong></div>
              <div className="admin-calendar-nav">
                <button
                  onClick={() => setCalendarMonth(
                    new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)
                  )}
                  aria-label="Mês anterior"
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  onClick={() => setCalendarMonth(
                    new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)
                  )}
                  aria-label="Próximo mês"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>

            <div className="admin-calendar-weekdays">
              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((label, index) => (
                <span key={label + index}>{label}</span>
              ))}
            </div>

            <div className="admin-calendar">
              {Array.from({ length: adminFirstWeekday }).map((_, i) => <span key={'e'+i} />)}
              {adminMonthDays.map((day) => {
                const iso = toISODate(calendarMonth.getFullYear(), calendarMonth.getMonth(), day)
                const reservation = reservations.find((r) => reservationISO(r) === iso)
                const legacyBlocked = calendarMonth.getFullYear() === 2026
                  && calendarMonth.getMonth() === 9
                  && (settings.blockedDays || []).includes(day)
                const blocked = blockedDates.has(iso) || legacyBlocked

                const toggleBlocked = () => {
                  if (reservation) return

                  const current = settings.blockedDates || []
                  const nextDates = blocked
                    ? current.filter((item) => item !== iso)
                    : [...current, iso]

                  const next = {
                    ...settings,
                    blockedDates: nextDates,
                    blockedDays: legacyBlocked
                      ? (settings.blockedDays || []).filter((item) => Number(item) !== day)
                      : (settings.blockedDays || []),
                  }
                  persistSettings(next)
                }

                return (
                  <button
                    className={reservation ? 'reserved' : blocked ? 'blocked' : ''}
                    key={iso}
                    onClick={() => reservation ? setSelectedReservation(reservation) : toggleBlocked()}
                    title={reservation ? 'Clique para ver os dados da reserva' : blocked ? 'Clique para liberar' : 'Clique para bloquear'}
                  >
                    <b>{day}</b>
                    <small>{reservation ? reservation.period : blocked ? 'Bloqueado' : 'Livre'}</small>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {active === 'reservations' && (
          <section className="admin-card large">
            <div className="admin-card-title">
              <div><span>Gestão de reservas</span><strong>{reservations.length} registros</strong></div>
            </div>
            <div className="admin-table">
              <div className="table-head"><span>Cliente</span><span>Data</span><span>Período</span><span>Valor</span><span>Status</span></div>
              {reservations.map((r) => (
                <div className="table-row" key={r.id}>
                  <span><strong>{r.customer?.name || 'Cliente'}</strong><small>{r.customer?.phone || r.id}</small></span>
                  <span>{r.date}</span>
                  <span>{r.period}</span>
                  <span>{money(r.price)}</span>
                  <span>
                    <i className={['paid', 'approved-simulated'].includes(r.paymentStatus) ? 'status-ok' : 'visit-status pending'}>
                      {['paid', 'approved-simulated'].includes(r.paymentStatus)
                        ? 'Pago'
                        : r.paymentStatus === 'confirmed-asaas'
                          ? 'Confirmado • processando'
                          : r.paymentStatus === 'pending-asaas'
                            ? 'Aguardando Pix'
                            : 'Pendente'}
                    </i>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {active === 'contracts' && <ContractsPanel />}

        {active === 'gallery' && (
          <ContentManager mode="gallery" settings={settings} setSettings={setSettings} />
        )}

        {active === 'amenities' && (
          <ContentManager mode="amenities" settings={settings} setSettings={setSettings} />
        )}

        {active === 'visits' && (
          <section className="admin-card large">
            <div className="admin-card-title">
              <div><span>Solicitações de visita</span><strong>{visits.length} registros</strong></div>
            </div>

            {visits.length ? (
              <div className="visit-admin-list">
                {visits.map((v) => {
                  const requestedDate = v.requestedDate || v.date
                  const requestedTime = v.requestedTime || v.time
                  const updateVisit = async (nextVisit) => {
                    const next = visits.map((item) => item.id === v.id ? nextVisit : item)
                    setVisits(next)
                    try {
                      const saved = await api.updateVisit(v.id, nextVisit)
                      setVisits((current) => current.map((item) => item.id === v.id ? saved : item))
                      return saved
                    } catch (error) {
                      setAdminError(error.message || 'Não foi possível atualizar a visita.')
                      return nextVisit
                    }
                  }

                  return (
                    <article className="visit-admin-card" key={v.id}>
                      <div className="visit-admin-head">
                        <div>
                          <strong>{v.name}</strong>
                          <span>{v.phone} • {v.id}</span>
                        </div>
                        <i className={
                          v.status === 'confirmed'
                            ? 'visit-status confirmed'
                            : v.status === 'rejected'
                              ? 'visit-status rejected'
                              : v.status === 'counter-proposed'
                                ? 'visit-status proposed'
                                : 'visit-status pending'
                        }>
                          {v.status === 'confirmed'
                            ? 'Confirmada'
                            : v.status === 'rejected'
                              ? 'Recusada'
                              : v.status === 'counter-proposed'
                                ? 'Novo horário sugerido'
                                : 'Aguardando confirmação'}
                        </i>
                      </div>

                      <div className="visit-admin-details">
                        <div>
                          <span>Data sugerida</span>
                          <strong>{requestedDate ? requestedDate.split('-').reverse().join('/') : '-'}</strong>
                        </div>
                        <div>
                          <span>Horário sugerido</span>
                          <strong>{requestedTime || '-'}</strong>
                        </div>
                      </div>

                      {v.status === 'confirmed' ? (
                        <div className="visit-confirmed-locked">
                          <div>
                            <span>Visita confirmada</span>
                            <strong>
                              {(v.confirmedDate || requestedDate)?.split('-').reverse().join('/')} às{' '}
                              {v.confirmedTime || requestedTime}
                            </strong>
                          </div>
                          <button
                            className="reopen"
                            onClick={() => updateVisit({
                              ...v,
                              status: 'pending-owner-confirmation',
                              respondedAt: null,
                            })}
                          >
                            Reabrir solicitação
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="visit-admin-response">
                            <label>
                              <span>Data confirmada / sugerida pelo proprietário</span>
                              <input
                                type="date"
                                value={v.confirmedDate || requestedDate || ''}
                                onChange={(e) => updateVisit({ ...v, confirmedDate: e.target.value })}
                              />
                            </label>
                            <label>
                              <span>Horário confirmado / sugerido</span>
                              <input
                                type="time"
                                value={v.confirmedTime || requestedTime || ''}
                                onChange={(e) => updateVisit({ ...v, confirmedTime: e.target.value })}
                              />
                            </label>
                            <label className="visit-message-field">
                              <span>Mensagem para o cliente</span>
                              <input
                                value={v.ownerMessage || ''}
                                onChange={(e) => updateVisit({ ...v, ownerMessage: e.target.value })}
                                placeholder="Ex.: Posso receber você às 16h."
                              />
                            </label>
                          </div>

                          <div className="visit-admin-actions">
                            <button
                              className="confirm"
                              onClick={() => {
                                const confirmedDate = v.confirmedDate || requestedDate
                                const confirmedTime = v.confirmedTime || requestedTime
                                const nextVisit = {
                                  ...v,
                                  status: 'confirmed',
                                  confirmedDate,
                                  confirmedTime,
                                  respondedAt: new Date().toISOString(),
                                }
                                updateVisit(nextVisit)
                                openWhatsAppConfirmation(nextVisit, confirmedDate, confirmedTime)
                              }}
                            >
                              Confirmar e avisar no WhatsApp
                            </button>
                            <button
                              className="propose"
                              onClick={() => updateVisit({
                                ...v,
                                status: 'counter-proposed',
                                confirmedDate: v.confirmedDate || requestedDate,
                                confirmedTime: v.confirmedTime || requestedTime,
                                respondedAt: new Date().toISOString(),
                              })}
                            >
                              Sugerir outro horário
                            </button>
                            <button
                              className="reject"
                              onClick={() => updateVisit({
                                ...v,
                                status: 'rejected',
                                respondedAt: new Date().toISOString(),
                              })}
                            >
                              Recusar
                            </button>
                          </div>
                        </>
                      )}
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="admin-empty large">Ainda não existem solicitações de visita neste navegador.</div>
            )}
          </section>
        )}

        {active === 'prices' && (
          <section className="admin-card large">
            <div className="admin-card-title">
              <div><span>Tabela de preços</span><strong>Valores de demonstração</strong></div>
              <Settings2 />
            </div>
            <div className="price-settings">
              {[
                ['Segunda a quinta • 12h', 'weekday12'],
                ['Segunda a quinta • 24h', 'weekday24'],
                ['Sexta e sábado • 12h', 'weekend12'],
                ['Sexta e sábado • 24h', 'weekend24'],
                ['Domingo • 12h', 'sunday12'],
                ['Domingo • 24h', 'sunday24'],
              ].map(([label, key]) => (
                <label key={key}>
                  <span>{label}</span>
                  <div>
                    <small>R$</small>
                    <input
                      type="number"
                      value={prices[key]}
                      onChange={(e) => {
                        const next = {
                          ...settings,
                          prices: { ...settings.prices, [key]: Number(e.target.value) },
                        }
                        persistSettings(next)
                      }}
                    />
                  </div>
                </label>
              ))}
            </div>
            <div className="admin-demo-note">
              Os valores são salvos neste navegador e passam a ser usados no site público quando você voltar ao site.
            </div>
          </section>
        )}
      </main>

      {selectedReservation && (
        <div className="reservation-detail-backdrop" role="dialog" aria-modal="true" aria-label="Detalhes da reserva">
          <div className="reservation-detail-modal">
            <div className="reservation-detail-top">
              <div>
                <span>Reserva do dia</span>
                <strong>{selectedReservation.date}</strong>
              </div>
              <button onClick={() => setSelectedReservation(null)} aria-label="Fechar detalhes">
                <X size={20} />
              </button>
            </div>

            <div className="reservation-detail-body">
              <div className="reservation-detail-status">
                <CheckCircle2 />
                <div>
                  <span>Status</span>
                  <strong>
                    {['paid', 'approved-simulated'].includes(selectedReservation.paymentStatus)
                      ? 'Pagamento confirmado'
                      : selectedReservation.paymentStatus === 'confirmed-asaas'
                        ? 'Confirmado • aguardando liquidação'
                        : selectedReservation.paymentStatus === 'pending-asaas'
                          ? 'Aguardando Pix'
                          : 'Pendente'}
                  </strong>
                </div>
              </div>

              <div className="reservation-detail-grid">
                <div>
                  <span>Cliente</span>
                  <strong>{selectedReservation.customer?.name || '-'}</strong>
                </div>
                <div>
                  <span>Telefone</span>
                  <strong>{selectedReservation.customer?.phone || '-'}</strong>
                </div>
                <div>
                  <span>CPF</span>
                  <strong>{selectedReservation.customer?.cpf || '-'}</strong>
                </div>
                <div>
                  <span>Período</span>
                  <strong>{selectedReservation.period || '-'}</strong>
                </div>
                <div>
                  <span>Valor</span>
                  <strong>{money(selectedReservation.price)}</strong>
                </div>
                <div>
                  <span>Código da reserva</span>
                  <strong>{selectedReservation.id}</strong>
                </div>
                <div>
                  <span>Contrato</span>
                  <strong>{selectedReservation.contractId || 'Não vinculado'}</strong>
                </div>
                <div>
                  <span>Pagamento</span>
                  <strong>{selectedReservation.asaasStatus || selectedReservation.paymentStatus || '-'}</strong>
                </div>
              </div>

              {selectedReservation.customer?.address && (
                <div className="reservation-detail-address">
                  <span>Endereço do cliente</span>
                  <strong>{selectedReservation.customer.address}</strong>
                </div>
              )}

              <div className="reservation-detail-actions">
                {selectedReservation.customer?.phone && (
                  <button
                    className="whatsapp"
                    onClick={() => {
                      const number = normalizeWhatsAppNumber(selectedReservation.customer.phone)
                      if (number) window.open('https://wa.me/' + number, '_blank', 'noopener,noreferrer')
                    }}
                  >
                    <Phone size={16} />
                    Abrir WhatsApp
                  </button>
                )}

                {selectedReservation.contractId && (
                  <button
                    className="contract"
                    onClick={() => {
                      setSelectedReservation(null)
                      setActive('contracts')
                    }}
                  >
                    <FileText size={16} />
                    Ver contratos
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

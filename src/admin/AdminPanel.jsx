import { useMemo, useState } from 'react'
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
} from 'lucide-react'
import ContractsPanel from './ContractsPanel'
import { loadSettings, saveSettings } from '../data/settings'
import './admin.css'

const menu = [
  ['overview', 'Visão geral', Gauge],
  ['calendar', 'Agenda', CalendarDays],
  ['reservations', 'Reservas', WalletCards],
  ['visits', 'Visitas', CalendarCheck2],
  ['contracts', 'Contratos', FileCheck2],
  ['prices', 'Preços', CircleDollarSign],
]

function money(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function getReservations() {
  const local = JSON.parse(localStorage.getItem('espacoon_reservations') || '[]')
  const examples = [
    { id: 'ESP-2026-03-1042', day: 3, date: '03/10/2026', period: '24h', price: 950, customer: { name: 'Reserva demonstrativa', phone: '(69) 99999-1001' }, paymentStatus: 'approved-simulated' },
    { id: 'ESP-2026-10-1058', day: 10, date: '10/10/2026', period: '12h', price: 700, customer: { name: 'Cliente exemplo', phone: '(69) 99999-1002' }, paymentStatus: 'approved-simulated' },
  ]
  return [...local, ...examples]
}

function getVisits() {
  return JSON.parse(localStorage.getItem('espacoon_visits') || '[]')
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
  const [reservations] = useState(getReservations)
  const [visits, setVisits] = useState(getVisits)
  const [settings, setSettings] = useState(loadSettings)
  const prices = settings.prices
  const blockedDays = new Set(settings.blockedDays || [])

  const revenue = useMemo(
    () => reservations.reduce((sum, item) => sum + Number(item.price || 0), 0),
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
            <span><strong>Administrador</strong><small>Modo demonstração</small></span>
          </div>
        </header>

        {active === 'overview' && (
          <>
            <section className="admin-stats">
              <article>
                <div><WalletCards /></div>
                <span>Reservas</span>
                <strong>{reservations.length}</strong>
                <small>registradas neste navegador</small>
              </article>
              <article>
                <div><CircleDollarSign /></div>
                <span>Receita simulada</span>
                <strong>{money(revenue)}</strong>
                <small>pagamentos de demonstração</small>
              </article>
              <article>
                <div><CalendarCheck2 /></div>
                <span>Visitas</span>
                <strong>{visits.length}</strong>
                <small>agendamentos locais</small>
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
                        <small>{visit.date.split('-').reverse().join('/')} às {visit.time}</small>
                      </span>
                    </div>
                  )) : (
                    <div className="admin-empty">Nenhuma visita foi agendada neste navegador ainda.</div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {active === 'calendar' && (
          <section className="admin-card large">
            <div className="admin-card-title">
              <div><span>Agenda mensal</span><strong>Outubro 2026</strong></div>
              <button>Bloquear data</button>
            </div>
            <div className="admin-calendar">
              {Array.from({ length: 4 }).map((_, i) => <span key={'e'+i} />)}
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                const reservation = reservations.find((r) => Number(r.day) === day)
                const blocked = blockedDays.has(day)
                const toggleBlocked = () => {
                  if (reservation) return
                  const nextDays = blocked
                    ? settings.blockedDays.filter((item) => Number(item) !== day)
                    : [...settings.blockedDays, day]
                  const next = { ...settings, blockedDays: nextDays }
                  setSettings(next)
                  saveSettings(next)
                }
                return (
                  <button
                    className={reservation ? 'reserved' : blocked ? 'blocked' : ''}
                    key={day}
                    onClick={toggleBlocked}
                    title={reservation ? 'Data reservada' : blocked ? 'Clique para liberar' : 'Clique para bloquear'}
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
                  <span><i className="status-ok">Confirmada</i></span>
                </div>
              ))}
            </div>
          </section>
        )}

        {active === 'contracts' && <ContractsPanel />}

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
                  const updateVisit = (nextVisit) => {
                    const next = visits.map((item) => item.id === v.id ? nextVisit : item)
                    setVisits(next)
                    localStorage.setItem('espacoon_visits', JSON.stringify(next))
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
                        setSettings(next)
                        saveSettings(next)
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
    </div>
  )
}

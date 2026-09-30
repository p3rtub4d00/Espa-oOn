import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  BarChart3,
  Trash2,
  ShieldAlert,
  KeyRound,
  BellRing,
  Download,
  Menu,
  Building2,
  Palette,
  Upload,
  MapPin,
} from 'lucide-react'
import ContractsPanel from './ContractsPanel'
import ContentManager from './ContentManager'
import BrandLogo from '../components/BrandLogo'
import { loadSettings } from '../data/settings'
import { api } from '../data/api'
import './admin.css'

const menu = [
  ['overview', 'Visão geral', Gauge],
  ['calendar', 'Agenda', CalendarDays],
  ['reservations', 'Reservas', WalletCards],
  ['revenue', 'Faturamento', BarChart3],
  ['visits', 'Visitas', CalendarCheck2],
  ['contracts', 'Contratos', FileCheck2],
  ['gallery', 'Galeria', Images],
  ['amenities', 'Estrutura', ListPlus],
  ['extras', 'Adicionais', ListPlus],
  ['prices', 'Preços', CircleDollarSign],
  ['establishment', 'Estabelecimento', Building2],
  ['branding', 'Marca', Palette],
  ['policies', 'Cancelamento', FileText],
  ['notifications', 'Notificações', BellRing],
  ['system', 'Dados', ShieldAlert],
]

function money(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function maskCpf(value = '') {
  const digits = String(value).replace(/\D/g, '')
  if (digits.length !== 11) return '-'
  return '***.' + digits.slice(3, 6) + '.' + digits.slice(6, 9) + '-**'
}

function paymentStatusLabel(status, paymentMethod = '', holdUntil = null) {
  if (status === 'paid') return 'Pago'
  if (status === 'confirmed-asaas') return 'Confirmado • processando'

  const remainingLabel = (() => {
    if (!holdUntil) return ''
    const ms = new Date(holdUntil).getTime() - Date.now()
    if (!Number.isFinite(ms) || ms <= 0) return ' • expirando'
    const minutes = Math.max(1, Math.ceil(ms / 60000))
    return ' • ' + minutes + ' min'
  })()

  if (status === 'pending-mercadopago') {
    return (paymentMethod === 'card' ? 'Aguardando cartão' : 'Aguardando Pix') + remainingLabel
  }
  if (status === 'pending-asaas') return 'Aguardando Pix' + remainingLabel
  if (status === 'manual-review') return 'Conferência manual'
  if (status === 'refunded') return 'Estornado'
  if (status === 'cancelled') return 'Cancelado'
  if (status === 'expired') return 'Expirado'
  return 'Pendente'
}

function isActiveReservation(reservation) {
  return reservation?.reservationStatus !== 'cancelled' &&
    ['paid', 'confirmed-asaas', 'manual-review'].includes(reservation?.paymentStatus)
}

function normalizeWhatsAppNumber(phone = '') {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  return digits.startsWith('55') ? digits : '55' + digits
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
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

function openWhatsAppVisitProposal(visit, date, time, ownerMessage = '') {
  const number = normalizeWhatsAppNumber(visit.phone)
  if (!number) return

  const formattedDate = date ? date.split('-').reverse().join('/') : ''
  const message = [
    'Olá, ' + visit.name + '!',
    '',
    'Recebemos sua solicitação de visita ao EspaçoOn.',
    'Gostaríamos de sugerir outro horário:',
    'Data: ' + formattedDate,
    'Horário: ' + time,
    ownerMessage ? '' : null,
    ownerMessage || null,
    '',
    'Se estiver de acordo, responda por aqui para confirmarmos.',
  ].filter(Boolean).join('\n')

  window.open(
    'https://wa.me/' + number + '?text=' + encodeURIComponent(message),
    '_blank',
    'noopener,noreferrer',
  )
}

function openWhatsAppVisitRejection(visit, reason) {
  const number = normalizeWhatsAppNumber(visit.phone)
  if (!number) return

  const message = [
    'Olá, ' + visit.name + '!',
    '',
    'Sobre sua solicitação de visita ao EspaçoOn, infelizmente não conseguiremos atender neste momento.',
    '',
    'Motivo: ' + reason,
    '',
    'Se desejar, responda por aqui para verificarmos outra possibilidade.',
  ].join('\n')

  window.open(
    'https://wa.me/' + number + '?text=' + encodeURIComponent(message),
    '_blank',
    'noopener,noreferrer',
  )
}

export default function AdminPanel({
  onClose,
  onInstall,
  appInstalled = false,
  initialBranding = {},
  initialBrandName = 'EspaçoOn',
  onSettingsSaved = () => {},
}) {
  const [active, setActive] = useState('overview')
  const [reservations, setReservations] = useState([])
  const [visits, setVisits] = useState([])
  const [settings, setSettings] = useState(loadSettings)
  const settingsDirtyRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [adminError, setAdminError] = useState('')
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selectedReservation, setSelectedReservation] = useState(null)
  const [revenueMonth, setRevenueMonth] = useState(() => {
    const now = new Date()
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
  })
  const [revenueData, setRevenueData] = useState(null)
  const [revenueLoading, setRevenueLoading] = useState(false)
  const [revenueError, setRevenueError] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirmation, setResetConfirmation] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')
  const [deletingReservationId, setDeletingReservationId] = useState('')
  const [cancellingReservation, setCancellingReservation] = useState(null)
  const [cancellationReason, setCancellationReason] = useState('')
  const [cancellationRefund, setCancellationRefund] = useState('0')
  const [cancellationBusy, setCancellationBusy] = useState(false)
  const [cancellationError, setCancellationError] = useState('')
  const [policySaveMessage, setPolicySaveMessage] = useState('')
  const [settingsSaveMessage, setSettingsSaveMessage] = useState('')
  const [settingsSaveType, setSettingsSaveType] = useState('success')
  const [establishmentMissing, setEstablishmentMissing] = useState({})
  const [newExtra, setNewExtra] = useState({
    name: '',
    description: '',
    price: '',
    active: true,
  })
  const [pushStatus, setPushStatus] = useState(null)
  const [pushSubscription, setPushSubscription] = useState(null)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMessage, setPushMessage] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [brandingUploadBusy, setBrandingUploadBusy] = useState(false)
  const [paymentConfig, setPaymentConfig] = useState(null)
  const [paymentConfigBusy, setPaymentConfigBusy] = useState(false)
  const [paymentConfigMessage, setPaymentConfigMessage] = useState(
    new URLSearchParams(window.location.search).get('mercadopago') === 'connected'
      ? 'Mercado Pago autorizado. Atualizando o status da conexão...'
      : ''
  )

  useEffect(() => {
    let alive = true

    const refreshAdminData = async (showLoader = false) => {
      if (showLoader) setLoading(true)

      try {
        const [reservationData, visitData, settingsData] = await Promise.all([
          api.adminReservations(),
          api.adminVisits(),
          api.getAdminSettings(),
        ])

        if (!alive) return
        setReservations(reservationData)
        setVisits(visitData)
        // Não substitui o formulário enquanto o administrador está digitando.
        // O refresh automático continua atualizando reservas/visitas sem apagar rascunhos.
        if (!settingsDirtyRef.current) setSettings(settingsData)
        setAdminError('')
      } catch (error) {
        if (alive) setAdminError(error.message || 'Não foi possível atualizar o painel.')
      } finally {
        if (alive && showLoader) setLoading(false)
      }
    }

    refreshAdminData(true)

    const timer = window.setInterval(() => {
      refreshAdminData(false)
    }, 30000)

    const handleFocus = () => refreshAdminData(false)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshAdminData(false)
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      alive = false
      window.clearInterval(timer)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])
  useEffect(() => {
    if (active !== 'revenue') return

    let alive = true
    setRevenueLoading(true)
    setRevenueError('')

    api.adminRevenue(revenueMonth)
      .then((data) => {
        if (alive) setRevenueData(data)
      })
      .catch((error) => {
        if (alive) setRevenueError(error.message || 'Não foi possível carregar o faturamento.')
      })
      .finally(() => {
        if (alive) setRevenueLoading(false)
      })

    return () => {
      alive = false
    }
  }, [active, revenueMonth])

  useEffect(() => {
    let alive = true
    setPaymentConfigBusy(true)

    api.paymentProviderStatus()
      .then((data) => {
        if (!alive) return
        setPaymentConfig(data)
        if (
          new URLSearchParams(window.location.search).get('mercadopago') === 'connected' &&
          data?.mercadoPagoConnected
        ) {
          setPaymentConfigMessage('Conta Mercado Pago conectada com sucesso.')
          window.history.replaceState({}, '', '/admin')
        }
      })
      .catch((error) => {
        if (alive) setPaymentConfigMessage(error.message || 'Não foi possível consultar os recebimentos.')
      })
      .finally(() => {
        if (alive) setPaymentConfigBusy(false)
      })

    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (active !== 'notifications') return

    let alive = true

    const loadPush = async () => {
      try {
        const status = await api.pushStatus()
        if (!alive) return
        setPushStatus(status)

        if ('serviceWorker' in navigator && 'PushManager' in window) {
          const registration = await navigator.serviceWorker.ready
          const subscription = await registration.pushManager.getSubscription()
          if (alive) setPushSubscription(subscription)
        }
      } catch (error) {
        if (alive) setPushMessage(error.message || 'Não foi possível carregar as notificações.')
      }
    }

    loadPush()

    return () => {
      alive = false
    }
  }, [active])

  const prices = settings.prices
  const extras = Array.isArray(settings.extras) ? settings.extras : []
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

  const openReservationDetails = (event, reservation) => {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    if (!reservation) return
    setSelectedReservation({ ...reservation })
  }

  const updateSettingsDraft = (updater) => {
    settingsDirtyRef.current = true
    setSettings(updater)
  }

  const persistSettings = async (next) => {
    settingsDirtyRef.current = true
    setSettings(next)

    try {
      const saved = await api.saveSettings(next)
      settingsDirtyRef.current = false
      setSettings(saved)
      onSettingsSaved(saved)
      return saved
    } catch (error) {
      settingsDirtyRef.current = true
      setAdminError(error.message || 'Não foi possível salvar as configurações.')
      throw error
    }
  }

  const showSettingsMessage = (message, type = 'success') => {
    setSettingsSaveMessage(message)
    setSettingsSaveType(type)
    window.setTimeout(() => {
      setSettingsSaveMessage('')
    }, 3500)
  }

  const revenue = useMemo(
    () => reservations
      .filter((item) => item.paymentStatus === 'paid')
      .reduce((sum, item) => sum + Number(item.price || 0), 0),
    [reservations],
  )

  const upcomingReservations = useMemo(() => {
    const today = new Date()
    const todayISO = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-')

    return reservations
      .filter((item) => isActiveReservation(item) && reservationISO(item) >= todayISO)
      .sort((a, b) => reservationISO(a).localeCompare(reservationISO(b)))
  }, [reservations])

  const currentBranding = settings.branding || initialBranding || {}
  const currentBrandName = settings.establishment?.name || initialBrandName || 'EspaçoOn'

  const establishmentSetupComplete = Boolean(
    settings.onboarding?.establishmentConfigured === true
  )
  const pricesSetupComplete = Boolean(
    settings.onboarding?.pricesConfigured === true
  )
  const mercadoPagoSetupComplete = Boolean(
    paymentConfig?.paymentProvider === 'mercadopago' &&
    paymentConfig?.mercadoPagoConnected
  )
  const showSetupChecklist = Boolean(
    paymentConfig &&
    paymentConfig.demoMode !== true &&
    paymentConfig.paymentProvider === 'mercadopago' &&
    !(establishmentSetupComplete && pricesSetupComplete && mercadoPagoSetupComplete)
  )

  const startMercadoPagoConnection = async () => {
    if (paymentConfigBusy) return

    setPaymentConfigBusy(true)
    setPaymentConfigMessage('')
    const oauthWindow = window.open('about:blank', '_blank')

    try {
      const result = await api.connectMercadoPago()
      if (!result?.authorizationUrl) {
        throw new Error('O Mercado Pago não retornou o link de autorização.')
      }

      if (oauthWindow && !oauthWindow.closed) {
        oauthWindow.opener = null
        oauthWindow.location.replace(result.authorizationUrl)
        setPaymentConfigMessage(
          'O Mercado Pago foi aberto no navegador. Conclua a autorização e depois volte ao EspaçoOn.'
        )
      } else {
        setPaymentConfigMessage(
          'Não foi possível abrir o navegador automaticamente. Tente novamente permitindo pop-ups para este site.'
        )
      }
    } catch (error) {
      if (oauthWindow && !oauthWindow.closed) oauthWindow.close()
      setPaymentConfigMessage(error.message || 'Não foi possível iniciar a conexão.')
    } finally {
      setPaymentConfigBusy(false)
    }
  }

  const adminThemeStyle = {
    '--brand-primary': currentBranding.primaryColor || '#0f3554',
    '--brand-secondary': currentBranding.secondaryColor || '#1f8efa',
    '--brand-accent': currentBranding.accentColor || '#53b9ff',
  }

  return (
    <div className="admin-shell" style={adminThemeStyle}>
      {mobileMenuOpen && (
        <button
          className="admin-mobile-overlay"
          aria-label="Fechar menu"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside className={`admin-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <button
          className="admin-mobile-close"
          aria-label="Fechar menu"
          onClick={() => setMobileMenuOpen(false)}
        >
          <X size={20} />
        </button>
        <div className="admin-brand">
          <BrandLogo
            className="brand-logo-admin"
            showAdmin
            name={currentBrandName}
            logoUrl={currentBranding.logoUrl}
            primaryColor={currentBranding.primaryColor}
            secondaryColor={currentBranding.secondaryColor}
            accentColor={currentBranding.accentColor}
          />
        </div>

        <nav>
          {menu.map(([id, label, Icon]) => (
            <button
              className={active === id ? 'active' : ''}
              onClick={() => {
                setActive(id)
                setMobileMenuOpen(false)
              }}
              key={id}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {!appInstalled && (
          <button className="admin-install-app" onClick={onInstall}>
            <Download size={17} />
            Instalar EspaçoOn
          </button>
        )}

        <button className="admin-back" onClick={onClose}>
          <ArrowLeft size={17} />
          Voltar ao site
        </button>
      </aside>

      <main className="admin-main">
        <button
          className="admin-mobile-menu-button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Abrir menu administrativo"
        >
          <Menu size={20} />
          <span>Menu</span>
        </button>

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
        {settingsSaveMessage && (
          <div className={'admin-save-toast ' + settingsSaveType}>
            <CheckCircle2 size={17} />
            <span>{settingsSaveMessage}</span>
          </div>
        )}
        {loading && <div className="admin-demo-note">Carregando dados online...</div>}

        {active === 'overview' && (
          <>
            {showSetupChecklist && (
              <section className="admin-card club-setup-card">
                <div className="club-setup-head">
                  <div>
                    <span>Configuração inicial</span>
                    <strong>Prepare seu clube para receber reservas</strong>
                    <p>Conclua estas três etapas para deixar o EspaçoOn pronto para seus clientes.</p>
                  </div>
                  <div className="club-setup-progress">
                    {[mercadoPagoSetupComplete, establishmentSetupComplete, pricesSetupComplete].filter(Boolean).length}/3
                  </div>
                </div>

                <div className="club-setup-list">
                  <article className={mercadoPagoSetupComplete ? 'done' : ''}>
                    <CheckCircle2 size={18} />
                    <div>
                      <strong>Conectar Mercado Pago</strong>
                      <span>{mercadoPagoSetupComplete ? 'Conta conectada e pronta para receber.' : 'Autorize sua conta para receber os pagamentos das reservas.'}</span>
                    </div>
                    {!mercadoPagoSetupComplete && (
                      <button onClick={startMercadoPagoConnection} disabled={paymentConfigBusy}>
                        {paymentConfigBusy ? 'Abrindo...' : 'Conectar'}
                      </button>
                    )}
                  </article>

                  <article className={establishmentSetupComplete ? 'done' : ''}>
                    <CheckCircle2 size={18} />
                    <div>
                      <strong>Preencher dados do clube</strong>
                      <span>{establishmentSetupComplete ? 'Dados do estabelecimento concluídos.' : 'Cadastre nome, responsável, contato e localização.'}</span>
                    </div>
                    {!establishmentSetupComplete && (
                      <button onClick={() => setActive('establishment')}>Preencher dados</button>
                    )}
                  </article>

                  <article className={pricesSetupComplete ? 'done' : ''}>
                    <CheckCircle2 size={18} />
                    <div>
                      <strong>Definir valores das reservas</strong>
                      <span>{pricesSetupComplete ? 'Tabela de preços configurada.' : 'Revise os valores de 12h e 24h antes de começar a vender.'}</span>
                    </div>
                    {!pricesSetupComplete && (
                      <button onClick={() => setActive('prices')}>Configurar valores</button>
                    )}
                  </article>
                </div>

                {paymentConfigMessage && (
                  <div className="payment-settings-message">{paymentConfigMessage}</div>
                )}
              </section>
            )}

            {paymentConfig?.paymentProvider === 'mercadopago' && (
              <section className="admin-card payment-home-card">
                <div className="payment-home-content">
                  <div className="payment-home-icon">
                    <CircleDollarSign size={28} />
                  </div>
                  <div>
                    <span>Recebimentos das reservas</span>
                    <strong>
                      {paymentConfig.mercadoPagoConnected
                        ? 'Mercado Pago conectado'
                        : 'Conecte sua conta Mercado Pago'}
                    </strong>
                    <p>
                      {paymentConfig.demoMode
                        ? 'Este ambiente está em demonstração e não processa pagamentos reais.'
                        : paymentConfig.mercadoPagoConnected
                          ? 'Sua conta está autorizada e pronta para receber as novas reservas.'
                          : 'Entre na sua própria conta Mercado Pago e autorize o EspaçoOn. Sua senha não é compartilhada conosco.'}
                    </p>
                  </div>
                </div>

                {!paymentConfig.demoMode && (
                  paymentConfig.mercadoPagoConnected ? (
                    <button
                      className="payment-home-secondary"
                      disabled={paymentConfigBusy}
                      onClick={async () => {
                        if (!confirm('Desconectar sua conta Mercado Pago do EspaçoOn?')) return
                        setPaymentConfigBusy(true)
                        setPaymentConfigMessage('')
                        try {
                          await api.disconnectMercadoPago()
                          const status = await api.paymentProviderStatus()
                          setPaymentConfig(status)
                          setPaymentConfigMessage('Conta Mercado Pago desconectada.')
                        } catch (error) {
                          setPaymentConfigMessage(error.message || 'Não foi possível desconectar a conta.')
                        } finally {
                          setPaymentConfigBusy(false)
                        }
                      }}
                    >
                      Desconectar Mercado Pago
                    </button>
                  ) : (
                    <button
                      className="payment-home-primary"
                      disabled={paymentConfigBusy}
                      onClick={startMercadoPagoConnection}
                    >
                      {paymentConfigBusy ? 'Abrindo Mercado Pago...' : 'Conectar Mercado Pago'}
                    </button>
                  )
                )}

                {paymentConfig.demoMode && (
                  <span className="payment-home-demo-badge">Demonstração</span>
                )}

                {paymentConfigMessage && (
                  <div className="payment-settings-message payment-home-message">
                    {paymentConfigMessage}
                  </div>
                )}
              </section>
            )}

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
                  <div><span>Próximas reservas</span><strong>{upcomingReservations.length} agendamentos</strong></div>
                  <button onClick={() => setActive('reservations')}>Ver todas</button>
                </div>
                <div className="admin-list">
                  {upcomingReservations.slice(0, 5).map((reservation) => (
                    <div key={reservation.id}>
                      <span className="date-box">
                        <b>{String((reservationISO(reservation).split('-')[2] || reservation.day || '')).padStart(2, '0')}</b>
                        <small>
                          {reservationISO(reservation)
                            ? new Intl.DateTimeFormat('pt-BR', { month: 'short' })
                                .format(new Date(reservationISO(reservation) + 'T12:00:00'))
                                .replace('.', '')
                                .toUpperCase()
                            : ''}
                        </small>
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
                const reservation = reservations.find((r) => reservationISO(r) === iso && isActiveReservation(r))
                const blocked = blockedDates.has(iso)

                const toggleBlocked = () => {
                  if (reservation) return

                  const current = settings.blockedDates || []
                  const nextDates = blocked
                    ? current.filter((item) => item !== iso)
                    : [...current, iso]

                  const next = {
                    ...settings,
                    blockedDates: nextDates,
                  }
                  persistSettings(next)
                }

                return (
                  <button
                    type="button"
                    className={reservation ? 'reserved' : blocked ? 'blocked' : ''}
                    key={iso}
                    onClick={(event) => reservation ? openReservationDetails(event, reservation) : toggleBlocked()}
                    title={reservation ? 'Clique para ver os dados da reserva' : blocked ? 'Clique para liberar' : 'Clique para bloquear'}
                  >
                    <b>{day}</b>
                    <small>
                      {reservation ? (
                        <>
                          {reservation.period}
                          <em className="calendar-view-hint">Ver reserva</em>
                        </>
                      ) : blocked ? 'Bloqueado' : 'Livre'}
                    </small>
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
              <div className="table-head reservations-head"><span>Cliente</span><span>Data</span><span>Período</span><span>Valor</span><span>Status</span><span>Ações</span></div>
              {reservations.map((r) => (
                <div className="table-row" key={r.id}>
                  <span><strong>{r.customer?.name || 'Cliente'}</strong><small>{r.customer?.phone || r.id}</small></span>
                  <span>{r.date}</span>
                  <span>{r.period}</span>
                  <span>{money(r.price)}</span>
                  <span>
                    <i className={
                      r.reservationStatus === 'cancelled'
                        ? 'visit-status rejected'
                        : r.paymentStatus === 'paid'
                          ? 'status-ok'
                          : 'visit-status pending'
                    }>
                      {r.reservationStatus === 'cancelled'
                        ? (
                            Number(r.cancellation?.refundAmount || 0) > 0
                              ? r.cancellation?.refundStatus === 'pending'
                                ? 'Cancelada • reembolso pendente'
                                : 'Cancelada • reembolso registrado'
                              : 'Cancelada'
                          )
                        : paymentStatusLabel(r.paymentStatus, r.paymentMethod, r.holdUntil)}
                    </i>
                  </span>
                  <span className="reservation-row-actions">
                    {r.reservationStatus === 'cancelled' ? (
                      r.cancellation?.refundStatus === 'pending' ? (
                        <button
                          className="refund-record-button"
                          onClick={async () => {
                            const confirmed = window.confirm(
                              'Confirma que o valor de ' +
                              money(r.cancellation?.refundAmount || 0) +
                              ' já foi devolvido ao cliente?'
                            )
                            if (!confirmed) return

                            setAdminError('')
                            try {
                              const saved = await api.markRefundRecorded(r.id)
                              setReservations((current) =>
                                current.map((item) => item.id === r.id ? saved : item)
                              )
                            } catch (error) {
                              setAdminError(error.message || 'Não foi possível registrar o reembolso.')
                            }
                          }}
                        >
                          <CheckCircle2 size={14} />
                          Marcar devolvido
                        </button>
                      ) : (
                        <small className="reservation-protected">Histórico</small>
                      )
                    ) : r.paymentStatus === 'paid' ? (
                      <button
                        className="cancel-paid-reservation"
                        onClick={() => {
                          setCancellingReservation(r)
                          setCancellationReason('')
                          setCancellationRefund('0')
                          setCancellationError('')
                        }}
                      >
                        <X size={14} />
                        Cancelar
                      </button>
                    ) : ['pending-asaas', 'pending-mercadopago', 'awaiting-payment', 'expired', 'cancelled'].includes(r.paymentStatus) ? (
                      <button
                        className="delete-pending-reservation"
                        disabled={deletingReservationId === r.id}
                        onClick={async () => {
                          const confirmed = window.confirm(
                            'Excluir esta tentativa pendente? O pagamento será encerrado quando possível e a data será liberada.'
                          )
                          if (!confirmed) return

                          setDeletingReservationId(r.id)
                          setAdminError('')
                          try {
                            await api.deletePendingReservation(r.id)
                            setReservations((current) => current.filter((item) => item.id !== r.id))
                          } catch (error) {
                            setAdminError(error.message || 'Não foi possível excluir a reserva.')
                          } finally {
                            setDeletingReservationId('')
                          }
                        }}
                      >
                        <Trash2 size={14} />
                        {deletingReservationId === r.id ? 'Excluindo...' : 'Excluir'}
                      </button>
                    ) : (
                      <small className="reservation-protected">Protegida</small>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {active === 'revenue' && (
          <section className="admin-card large revenue-panel">
            <div className="admin-card-title revenue-title">
              <div>
                <span>Faturamento recebido</span>
                <strong>Consulta mensal</strong>
              </div>
              <label className="revenue-month-picker">
                <span>Mês</span>
                <input
                  type="month"
                  value={revenueMonth}
                  onChange={(event) => setRevenueMonth(event.target.value)}
                />
              </label>
            </div>

            {revenueError && <div className="admin-demo-note">{revenueError}</div>}

            <div className="revenue-stats">
              <article>
                <span>Faturamento</span>
                <strong>{money(revenueData?.total || 0)}</strong>
                <small>pagamentos recebidos no mês</small>
              </article>
              <article>
                <span>Reservas pagas</span>
                <strong>{revenueData?.count || 0}</strong>
                <small>recebimentos confirmados</small>
              </article>
              <article>
                <span>Ticket médio</span>
                <strong>{money(revenueData?.averageTicket || 0)}</strong>
                <small>valor médio por reserva</small>
              </article>
            </div>

            <div className="revenue-list-head">
              <div>
                <span>Movimentação do mês</span>
                <strong>{revenueLoading ? 'Carregando...' : (revenueData?.count || 0) + ' pagamentos'}</strong>
              </div>
            </div>

            {revenueLoading ? (
              <div className="admin-empty large">Carregando faturamento...</div>
            ) : revenueData?.reservations?.length ? (
              <div className="admin-table revenue-table">
                <div className="table-head">
                  <span>Cliente</span>
                  <span>Reserva</span>
                  <span>Pago em</span>
                  <span>Data locação</span>
                  <span>Valor</span>
                </div>
                {revenueData.reservations.map((reservation) => (
                  <div className="table-row" key={reservation.id}>
                    <span>
                      <strong>{reservation.customer?.name || 'Cliente'}</strong>
                      <small>{reservation.customer?.phone || '-'}</small>
                    </span>
                    <span>{reservation.id}</span>
                    <span>
                      {reservation.paidAt
                        ? new Date(reservation.paidAt).toLocaleString('pt-BR')
                        : '-'}
                    </span>
                    <span>{reservation.date || '-'}</span>
                    <span><strong>{money(reservation.price)}</strong></span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="admin-empty large">Nenhum pagamento recebido neste mês.</div>
            )}
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
                      return null
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
                                updateVisit(nextVisit).then((savedVisit) => {
                                  if (savedVisit?.status === 'confirmed') {
                                    openWhatsAppConfirmation(savedVisit, confirmedDate, confirmedTime)
                                  }
                                })
                              }}
                            >
                              Confirmar e avisar no WhatsApp
                            </button>
                            <button
                              className="propose"
                              onClick={async () => {
                                const proposedDate = v.confirmedDate || requestedDate
                                const proposedTime = v.confirmedTime || requestedTime

                                if (!proposedDate || !proposedTime) {
                                  setAdminError('Informe a nova data e o novo horário antes de enviar a sugestão.')
                                  return
                                }

                                const savedVisit = await updateVisit({
                                  ...v,
                                  status: 'counter-proposed',
                                  confirmedDate: proposedDate,
                                  confirmedTime: proposedTime,
                                  respondedAt: new Date().toISOString(),
                                })

                                if (savedVisit?.status === 'counter-proposed') {
                                  openWhatsAppVisitProposal(
                                    savedVisit,
                                    proposedDate,
                                    proposedTime,
                                    savedVisit.ownerMessage || '',
                                  )
                                }
                              }}
                            >
                              Sugerir outro horário
                            </button>
                            <button
                              className="reject"
                              onClick={async () => {
                                const reason = String(v.ownerMessage || '').trim()

                                if (reason.length < 3) {
                                  setAdminError('Informe a justificativa no campo “Mensagem para o cliente” antes de recusar.')
                                  return
                                }

                                const savedVisit = await updateVisit({
                                  ...v,
                                  ownerMessage: reason,
                                  status: 'rejected',
                                  respondedAt: new Date().toISOString(),
                                })

                                if (savedVisit?.status === 'rejected') {
                                  openWhatsAppVisitRejection(savedVisit, reason)
                                }
                              }}
                            >
                              Recusar e avisar no WhatsApp
                            </button>
                          </div>
                        </>
                      )}
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="admin-empty large">Ainda não existem solicitações de visita.</div>
            )}
          </section>
        )}

        {active === 'extras' && (
          <section className="admin-card large extras-settings">
            <div className="admin-card-title">
              <div>
                <span>Serviços adicionais</span>
                <strong>Itens opcionais que o cliente pode incluir na reserva</strong>
              </div>
              <ListPlus />
            </div>

            <div className="extras-admin-note">
              Somente itens marcados como ativos aparecem para o cliente. O preço é por unidade e o cliente escolhe a quantidade na reserva.
            </div>

            <div className="extras-create-grid">
              <label>
                <span>Nome</span>
                <input
                  value={newExtra.name}
                  onChange={(e) => setNewExtra((current) => ({ ...current, name: e.target.value }))}
                  placeholder="Ex.: Jogo de mesa"
                />
              </label>
              <label>
                <span>Preço unitário</span>
                <div className="extra-price-input">
                  <small>R$</small>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={newExtra.price}
                    onChange={(e) => setNewExtra((current) => ({ ...current, price: e.target.value }))}
                    placeholder="25,00"
                  />
                </div>
              </label>
              <label className="extra-description-field">
                <span>Descrição</span>
                <input
                  value={newExtra.description}
                  onChange={(e) => setNewExtra((current) => ({ ...current, description: e.target.value }))}
                  placeholder="Ex.: Mesa com 4 cadeiras"
                />
              </label>
              <label className="extra-active-field">
                <input
                  type="checkbox"
                  checked={newExtra.active}
                  onChange={(e) => setNewExtra((current) => ({ ...current, active: e.target.checked }))}
                />
                <span>Ativo</span>
              </label>
              <button
                className="extra-add-button"
                onClick={() => {
                  const name = newExtra.name.trim()
                  const description = newExtra.description.trim()
                  const price = Number(newExtra.price)
                  if (name.length < 2 || !Number.isFinite(price) || price <= 0) {
                    showSettingsMessage('Informe um nome e um preço unitário válido.', 'warning')
                    return
                  }

                  updateSettingsDraft((current) => ({
                    ...current,
                    extras: [
                      ...(Array.isArray(current.extras) ? current.extras : []),
                      {
                        id: 'extra-' + Date.now().toString(36),
                        name,
                        description,
                        price: Math.round(price * 100) / 100,
                        active: newExtra.active,
                      },
                    ],
                  }))
                  setNewExtra({ name: '', description: '', price: '', active: true })
                }}
              >
                <ListPlus size={16} />
                Adicionar
              </button>
            </div>

            <div className="extras-admin-list">
              {extras.length ? extras.map((extra) => (
                <article key={extra.id} className={extra.active ? 'extra-admin-item active' : 'extra-admin-item'}>
                  <div className="extra-admin-main">
                    <label>
                      <span>Nome</span>
                      <input
                        value={extra.name || ''}
                        onChange={(e) => {
                          const value = e.target.value
                          updateSettingsDraft((current) => ({
                            ...current,
                            extras: (current.extras || []).map((item) =>
                              item.id === extra.id ? { ...item, name: value } : item
                            ),
                          }))
                        }}
                      />
                    </label>
                    <label>
                      <span>Descrição</span>
                      <input
                        value={extra.description || ''}
                        onChange={(e) => {
                          const value = e.target.value
                          updateSettingsDraft((current) => ({
                            ...current,
                            extras: (current.extras || []).map((item) =>
                              item.id === extra.id ? { ...item, description: value } : item
                            ),
                          }))
                        }}
                      />
                    </label>
                    <label>
                      <span>Preço unitário</span>
                      <div className="extra-price-input">
                        <small>R$</small>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={extra.price}
                          onChange={(e) => {
                            const value = e.target.value
                            updateSettingsDraft((current) => ({
                              ...current,
                              extras: (current.extras || []).map((item) =>
                                item.id === extra.id
                                  ? { ...item, price: value === '' ? '' : Number(value) }
                                  : item
                              ),
                            }))
                          }}
                        />
                      </div>
                    </label>
                  </div>
                  <div className="extra-admin-actions">
                    <label className="extra-switch">
                      <input
                        type="checkbox"
                        checked={extra.active === true}
                        onChange={(e) => {
                          const active = e.target.checked
                          updateSettingsDraft((current) => ({
                            ...current,
                            extras: (current.extras || []).map((item) =>
                              item.id === extra.id ? { ...item, active } : item
                            ),
                          }))
                        }}
                      />
                      <span>{extra.active ? 'Ativo' : 'Inativo'}</span>
                    </label>
                    <button
                      className="extra-remove-button"
                      onClick={() => {
                        if (!window.confirm('Remover este adicional?')) return
                        updateSettingsDraft((current) => ({
                          ...current,
                          extras: (current.extras || []).filter((item) => item.id !== extra.id),
                        }))
                      }}
                    >
                      <Trash2 size={14} />
                      Remover
                    </button>
                  </div>
                </article>
              )) : (
                <div className="admin-empty">Nenhum serviço adicional cadastrado.</div>
              )}
            </div>

            <div className="establishment-actions">
              <button
                onClick={async () => {
                  setAdminError('')
                  try {
                    await persistSettings(settings)
                    showSettingsMessage('Serviços adicionais salvos com sucesso.', 'success')
                  } catch (error) {
                    showSettingsMessage(error.message || 'Não foi possível salvar os adicionais.', 'error')
                  }
                }}
              >
                <CheckCircle2 size={16} />
                Salvar adicionais
              </button>
            </div>
          </section>
        )}

        {active === 'prices' && (
          <section className="admin-card large">
            <div className="admin-card-title">
              <div><span>Tabela de preços</span><strong>Valores publicados no site</strong></div>
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
                        const value = e.target.value
                        updateSettingsDraft((current) => ({
                          ...current,
                          prices: {
                            ...current.prices,
                            [key]: value === '' ? '' : Number(value),
                          },
                        }))
                      }}
                    />
                  </div>
                </label>
              ))}
            </div>
            <div className="establishment-actions">
              <button
                onClick={async () => {
                  setAdminError('')
                  try {
                    await persistSettings({
                      ...settings,
                      onboarding: {
                        ...(settings.onboarding || {}),
                        pricesConfigured: true,
                      },
                    })
                    showSettingsMessage('Tabela de preços salva com sucesso.', 'success')
                  } catch (error) {
                    showSettingsMessage(error.message || 'Não foi possível salvar a tabela de preços.', 'error')
                  }
                }}
              >
                <CheckCircle2 size={16} />
                Salvar valores
              </button>
            </div>
            <div className="admin-demo-note">
              Edite os valores e clique em “Salvar valores”. As novas reservas usarão a tabela salva.
            </div>
          </section>
        )}
        {active === 'establishment' && (
          <section className="admin-card large establishment-settings">
            <div className="admin-card-title">
              <div>
                <span>Dados públicos</span>
                <strong>Configurações do estabelecimento</strong>
              </div>
              <Building2 />
            </div>

            <div className="establishment-grid">
              <label className={establishmentMissing.name ? 'field-missing' : ''}>
                <span>Nome do espaço</span>
                <input
                  value={settings.establishment?.name || ''}
                  onChange={(event) => {
                    setEstablishmentMissing((current) => ({ ...current, name: false }))
                    updateSettingsDraft((current) => ({
                      ...current,
                      establishment: {
                        ...(current.establishment || {}),
                        name: event.target.value,
                      },
                    }))
                  }}
                  placeholder="Ex.: EspaçoOn"
                />
                {establishmentMissing.name && <small className="field-error-text">Preencha o nome do espaço.</small>}
              </label>

              <label className={establishmentMissing.ownerName ? 'field-missing' : ''}>
                <span>Responsável</span>
                <input
                  value={settings.establishment?.ownerName || ''}
                  onChange={(event) => {
                    setEstablishmentMissing((current) => ({ ...current, ownerName: false }))
                    updateSettingsDraft((current) => ({
                      ...current,
                      establishment: {
                        ...(current.establishment || {}),
                        ownerName: event.target.value,
                      },
                    }))
                  }}
                  placeholder="Nome do responsável"
                />
                {establishmentMissing.ownerName && <small className="field-error-text">Informe o responsável.</small>}
              </label>

              <label className={establishmentMissing.phone ? 'field-missing' : ''}>
                <span>Telefone / WhatsApp de contato</span>
                <input
                  inputMode="tel"
                  value={settings.establishment?.phone || ''}
                  onChange={(event) => {
                    setEstablishmentMissing((current) => ({ ...current, phone: false }))
                    updateSettingsDraft((current) => ({
                      ...current,
                      establishment: {
                        ...(current.establishment || {}),
                        phone: event.target.value.replace(/\D/g, '').slice(0, 13),
                      },
                    }))
                  }}
                  placeholder="Ex.: 5569999999999"
                />
                {establishmentMissing.phone && <small className="field-error-text">Informe um telefone válido.</small>}
              </label>

              <label>
                <span>Horário de atendimento</span>
                <input
                  value={settings.establishment?.openingHours || ''}
                  onChange={(event) => updateSettingsDraft((current) => ({
                    ...current,
                    establishment: {
                      ...(current.establishment || {}),
                      openingHours: event.target.value,
                    },
                  }))}
                  placeholder="Ex.: Seg a sáb, 08h às 18h"
                />
              </label>

              <label className="establishment-wide">
                <span>Endereço completo</span>
                <input
                  value={settings.establishment?.address || ''}
                  onChange={(event) => {
                    setEstablishmentMissing((current) => ({ ...current, address: false }))
                    updateSettingsDraft((current) => ({
                      ...current,
                      establishment: {
                        ...(current.establishment || {}),
                        address: event.target.value,
                      },
                    }))
                  }}
                  placeholder="Rua, número, bairro"
                />
                {establishmentMissing.address && <small className="field-error-text">Informe o endereço.</small>}
              </label>

              <label className={establishmentMissing.city ? 'field-missing' : ''}>
                <span>Cidade</span>
                <input
                  value={settings.establishment?.city || ''}
                  onChange={(event) => {
                    setEstablishmentMissing((current) => ({ ...current, city: false }))
                    updateSettingsDraft((current) => ({
                      ...current,
                      establishment: {
                        ...(current.establishment || {}),
                        city: event.target.value,
                      },
                    }))
                  }}
                  placeholder="Cidade"
                />
                {establishmentMissing.city && <small className="field-error-text">Informe a cidade.</small>}
              </label>

              <label className={establishmentMissing.state ? 'field-missing' : ''}>
                <span>UF</span>
                <input
                  maxLength={2}
                  value={settings.establishment?.state || ''}
                  onChange={(event) => {
                    setEstablishmentMissing((current) => ({ ...current, state: false }))
                    updateSettingsDraft((current) => ({
                      ...current,
                      establishment: {
                        ...(current.establishment || {}),
                        state: event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2),
                      },
                    }))
                  }}
                  placeholder="RO"
                />
                {establishmentMissing.state && <small className="field-error-text">Informe a UF com 2 letras.</small>}
              </label>

              <label className="establishment-wide">
                <span>Referência / observação de localização</span>
                <textarea
                  rows={3}
                  value={settings.establishment?.locationNote || ''}
                  onChange={(event) => updateSettingsDraft((current) => ({
                    ...current,
                    establishment: {
                      ...(current.establishment || {}),
                      locationNote: event.target.value,
                    },
                  }))}
                  placeholder="Ex.: Entrada pelo portão azul, próximo ao mercado..."
                />
              </label>
            </div>

            <div className="establishment-actions">
              <button
                onClick={async () => {
                  setAdminError('')
                  try {
                    const establishment = settings.establishment || {}
                    const missing = {
                      name: String(establishment.name || '').trim().length < 2,
                      ownerName: String(establishment.ownerName || '').trim().length < 3,
                      phone: String(establishment.phone || '').replace(/\D/g, '').length < 10,
                      address: String(establishment.address || '').trim().length < 5,
                      city: String(establishment.city || '').trim().length < 2,
                      state: !/^[A-Z]{2}$/.test(String(establishment.state || '').trim()),
                    }

                    setEstablishmentMissing(missing)
                    const complete = !Object.values(missing).some(Boolean)

                    await persistSettings({
                      ...settings,
                      onboarding: {
                        ...(settings.onboarding || {}),
                        establishmentConfigured: complete,
                      },
                    })

                    if (complete) {
                      showSettingsMessage('Dados do estabelecimento salvos com sucesso.', 'success')
                    } else {
                      showSettingsMessage('Dados salvos, mas ainda faltam campos obrigatórios destacados em vermelho.', 'warning')
                    }
                  } catch (error) {
                    showSettingsMessage(error.message || 'Não foi possível salvar os dados do estabelecimento.', 'error')
                  }
                }}
              >
                <CheckCircle2 size={16} />
                Salvar dados
              </button>

              {settings.establishment?.address && (
                <button
                  className="secondary"
                  onClick={() => {
                    const destination = [
                      settings.establishment.address,
                      settings.establishment.city,
                      settings.establishment.state,
                    ].filter(Boolean).join(', ')
                    window.open(
                      'https://www.google.com/maps/dir/?api=1&destination=' +
                        encodeURIComponent(destination),
                      '_blank',
                      'noopener,noreferrer',
                    )
                  }}
                >
                  <MapPin size={16} />
                  Testar rota
                </button>
              )}
            </div>
          </section>
        )}

        {active === 'branding' && (
          <section className="admin-card large branding-settings">
            <div className="admin-card-title">
              <div>
                <span>Identidade visual</span>
                <strong>Personalização da marca</strong>
              </div>
              <Palette />
            </div>

            <div className="branding-preview">
              <span>Pré-visualização</span>
              <div className="branding-preview-box">
                <BrandLogo
                  className="brand-logo-preview"
                  name={currentBrandName}
                  logoUrl={currentBranding.logoUrl}
                  primaryColor={currentBranding.primaryColor}
                  secondaryColor={currentBranding.secondaryColor}
                  accentColor={currentBranding.accentColor}
                />
              </div>
              <small>
                O nome exibido vem de Estabelecimento. Para mudar o nome da marca, altere o campo “Nome do espaço”.
              </small>
            </div>

            <div className="branding-logo-control">
              <div>
                <strong>Logo personalizada</strong>
                <span>Envie PNG, JPG ou WebP de até 5 MB. Se não houver logo, o símbolo padrão será utilizado.</span>
              </div>

              <div className="branding-logo-actions">
                <label className="branding-upload-button">
                  <Upload size={16} />
                  {brandingUploadBusy ? 'Enviando...' : 'Enviar logo'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={brandingUploadBusy}
                    onChange={async (event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (!file) return

                      setBrandingUploadBusy(true)
                      setAdminError('')
                      try {
                        const uploaded = await api.uploadImage(file)
                        const next = {
                          ...settings,
                          branding: {
                            ...(settings.branding || {}),
                            logoUrl: uploaded.url,
                          },
                        }
                        const saved = await api.saveSettings(next)
                        setSettings(saved)
                        settingsDirtyRef.current = false
                        onSettingsSaved(saved)
                        showSettingsMessage('Logo atualizada com sucesso.', 'success')
                      } catch (error) {
                        setAdminError(error.message || 'Não foi possível enviar a logo.')
                      } finally {
                        setBrandingUploadBusy(false)
                      }
                    }}
                  />
                </label>

                {currentBranding.logoUrl && (
                  <button
                    className="branding-remove-button"
                    disabled={brandingUploadBusy}
                    onClick={async () => {
                      setBrandingUploadBusy(true)
                      setAdminError('')
                      const oldUrl = currentBranding.logoUrl
                      try {
                        const next = {
                          ...settings,
                          branding: {
                            ...(settings.branding || {}),
                            logoUrl: '',
                          },
                        }
                        const saved = await api.saveSettings(next)
                        setSettings(saved)
                        settingsDirtyRef.current = false
                        onSettingsSaved(saved)

                        const match = String(oldUrl).match(/^\/api\/images\/([a-f0-9]{24})$/i)
                        if (match) {
                          await api.deleteImage(match[1]).catch(() => {})
                        }

                        showSettingsMessage('Logo personalizada removida. A identidade padrão voltou a ser usada.', 'success')
                      } catch (error) {
                        setAdminError(error.message || 'Não foi possível remover a logo.')
                      } finally {
                        setBrandingUploadBusy(false)
                      }
                    }}
                  >
                    <Trash2 size={15} />
                    Usar logo padrão
                  </button>
                )}
              </div>
            </div>

            <div className="branding-colors">
              {[
                ['Cor principal', 'primaryColor', '#0f3554'],
                ['Cor secundária', 'secondaryColor', '#1f8efa'],
                ['Cor de destaque', 'accentColor', '#53b9ff'],
              ].map(([label, key, fallback]) => (
                <label key={key}>
                  <span>{label}</span>
                  <div>
                    <input
                      type="color"
                      value={currentBranding[key] || fallback}
                      onChange={(event) => {
                        setSettings((current) => ({
                          ...current,
                          branding: {
                            ...(current.branding || {}),
                            [key]: event.target.value,
                          },
                        }))
                      }}
                    />
                    <input
                      className="branding-hex"
                      value={currentBranding[key] || fallback}
                      maxLength={7}
                      onChange={(event) => {
                        setSettings((current) => ({
                          ...current,
                          branding: {
                            ...(current.branding || {}),
                            [key]: event.target.value,
                          },
                        }))
                      }}
                    />
                  </div>
                </label>
              ))}
            </div>

            <div className="branding-actions">
              <button
                onClick={async () => {
                  setAdminError('')
                  try {
                    const saved = await api.saveSettings(settings)
                    setSettings(saved)
                    settingsDirtyRef.current = false
                    onSettingsSaved(saved)
                    showSettingsMessage('Identidade visual salva com sucesso.', 'success')
                  } catch (error) {
                    setAdminError(error.message || 'Não foi possível salvar a identidade visual.')
                  }
                }}
              >
                <CheckCircle2 size={16} />
                Salvar identidade visual
              </button>

              <button
                className="secondary"
                onClick={() => {
                  updateSettingsDraft((current) => ({
                    ...current,
                    branding: {
                      ...(current.branding || {}),
                      primaryColor: '#0f3554',
                      secondaryColor: '#1f8efa',
                      accentColor: '#53b9ff',
                    },
                  }))
                }}
              >
                Restaurar cores padrão
              </button>
            </div>
          </section>
        )}

        {active === 'policies' && (
          <section className="admin-card large cancellation-policy-panel">
            <div className="admin-card-title">
              <div>
                <span>Regras comerciais</span>
                <strong>Política de cancelamento e reembolso</strong>
              </div>
              <FileText />
            </div>

            <div className="cancellation-policy-info">
              <ShieldAlert size={20} />
              <span>
                Este texto aparece no contrato antes da assinatura. Use uma regra clara e compatível
                com a política real do estabelecimento.
              </span>
            </div>

            <label className="cancellation-policy-field">
              <span>Texto da política</span>
              <textarea
                rows={8}
                value={settings.cancellationPolicy?.text || ''}
                onChange={(event) => {
                  setSettings((current) => ({
                    ...current,
                    cancellationPolicy: {
                      ...(current.cancellationPolicy || {}),
                      text: event.target.value,
                    },
                  }))
                }}
                placeholder="Descreva as condições de cancelamento e eventual reembolso."
              />
            </label>

            <div className="cancellation-policy-actions">
              <button
                className="cancellation-policy-save"
                onClick={async () => {
                  const text = String(settings.cancellationPolicy?.text || '').trim()
                  setPolicySaveMessage('')

                  if (text.length < 20) {
                    setPolicySaveMessage('A política precisa ter pelo menos 20 caracteres para ser salva.')
                    return
                  }

                  try {
                    const saved = await api.saveSettings({
                      ...settings,
                      cancellationPolicy: { text },
                    })
                    setSettings(saved)
                    settingsDirtyRef.current = false
                    onSettingsSaved(saved)
                    setPolicySaveMessage('Política salva. Ela aparecerá nos novos contratos antes da assinatura.')
                  } catch (error) {
                    setPolicySaveMessage(error.message || 'Não foi possível salvar a política.')
                  }
                }}
              >
                <FileCheck2 size={16} />
                Salvar política
              </button>
              <small>
                Contratos já assinados permanecem com o texto vigente na data da assinatura.
              </small>
            </div>

            {policySaveMessage && (
              <div className="cancellation-policy-message">{policySaveMessage}</div>
            )}
          </section>
        )}

        {active === 'notifications' && (
          <section className="admin-card large push-settings">
            <div className="admin-card-title push-settings-title">
              <div>
                <span>Avisos automáticos</span>
                <strong>Notificações Push</strong>
              </div>
              <BellRing />
            </div>

            <div className="push-device-card">
              <div className="push-device-info">
                <div className={pushSubscription ? 'push-status-icon active' : 'push-status-icon'}>
                  <BellRing size={20} />
                </div>
                <div>
                  <strong>
                    {pushSubscription
                      ? 'Este dispositivo está recebendo notificações'
                      : 'Ative as notificações neste dispositivo'}
                  </strong>
                  <span>
                    {pushSubscription
                      ? 'O EspaçoOn pode avisar sobre novas visitas e reservas pagas.'
                      : 'Autorize uma vez para receber avisos mesmo com o painel fechado.'}
                  </span>
                </div>
              </div>

              <div className="push-device-actions">
                {!pushSubscription ? (
                  <button
                    className="push-enable-button"
                    disabled={pushBusy || !pushStatus?.publicKey}
                    onClick={async () => {
                      setPushBusy(true)
                      setPushMessage('')

                      try {
                        if (
                          !('serviceWorker' in navigator) ||
                          !('PushManager' in window) ||
                          !('Notification' in window)
                        ) {
                          throw new Error('Este navegador não oferece suporte a notificações Push.')
                        }

                        const permission = await Notification.requestPermission()
                        if (permission !== 'granted') {
                          throw new Error('A permissão de notificações não foi autorizada.')
                        }

                        const registration = await navigator.serviceWorker.ready
                        let subscription = await registration.pushManager.getSubscription()

                        if (!subscription) {
                          subscription = await registration.pushManager.subscribe({
                            userVisibleOnly: true,
                            applicationServerKey: urlBase64ToUint8Array(pushStatus.publicKey),
                          })
                        }

                        await api.subscribePush(subscription.toJSON())
                        setPushSubscription(subscription)

                        const status = await api.pushStatus()
                        setPushStatus(status)
                        setPushMessage('Notificações ativadas neste dispositivo.')
                      } catch (error) {
                        setPushMessage(error.message || 'Não foi possível ativar as notificações.')
                      } finally {
                        setPushBusy(false)
                      }
                    }}
                  >
                    <BellRing size={17} />
                    {pushBusy ? 'Ativando...' : 'Ativar neste dispositivo'}
                  </button>
                ) : (
                  <>
                    <button
                      className="push-test-button"
                      disabled={pushBusy}
                      onClick={async () => {
                        setPushBusy(true)
                        setPushMessage('')
                        try {
                          await api.testPush(pushSubscription.endpoint)
                          setPushMessage('Notificação de teste enviada.')
                        } catch (error) {
                          setPushMessage(error.message || 'Não foi possível enviar o teste.')
                        } finally {
                          setPushBusy(false)
                        }
                      }}
                    >
                      <BellRing size={17} />
                      Enviar teste
                    </button>

                    <button
                      className="push-test-button"
                      disabled={pushBusy}
                      onClick={async () => {
                        setPushBusy(true)
                        setPushMessage('')
                        try {
                          await api.testPushBackground(pushSubscription.endpoint)
                          setPushMessage('Teste agendado. Feche o app agora e aguarde 15 segundos.')
                        } catch (error) {
                          setPushMessage(error.message || 'Não foi possível agendar o teste.')
                        } finally {
                          setPushBusy(false)
                        }
                      }}
                    >
                      <BellRing size={17} />
                      Testar com app fechado
                    </button>

                    <button
                      className="push-disable-button"
                      disabled={pushBusy}
                      onClick={async () => {
                        setPushBusy(true)
                        setPushMessage('')
                        try {
                          await api.unsubscribePush(pushSubscription.endpoint)
                          await pushSubscription.unsubscribe()
                          setPushSubscription(null)
                          const status = await api.pushStatus()
                          setPushStatus(status)
                          setPushMessage('Notificações removidas deste dispositivo.')
                        } catch (error) {
                          setPushMessage(error.message || 'Não foi possível remover o dispositivo.')
                        } finally {
                          setPushBusy(false)
                        }
                      }}
                    >
                      Desativar
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="push-summary">
              <article>
                <span>Dispositivos ativos</span>
                <strong>{pushStatus?.subscriptions ?? 0}</strong>
                <small>celulares ou computadores autorizados</small>
              </article>
              <article>
                <span>Permissão neste navegador</span>
                <strong>
                  {'Notification' in window
                    ? Notification.permission === 'granted'
                      ? 'Permitida'
                      : Notification.permission === 'denied'
                        ? 'Bloqueada'
                        : 'Pendente'
                    : 'Indisponível'}
                </strong>
                <small>controle feito pelo próprio navegador</small>
              </article>
            </div>

            <div className="push-notification-options">
              <article>
                <div>
                  <CheckCircle2 size={18} />
                  <span>
                    <strong>Reserva paga</strong>
                    <small>Notificar quando o Asaas confirmar o recebimento de uma reserva.</small>
                  </span>
                </div>
                <button
                  className={settings.notifications?.notifyPaidReservation !== false ? 'enabled' : ''}
                  onClick={async () => {
                    const next = {
                      ...settings,
                      notifications: {
                        ...(settings.notifications || {}),
                        notifyPaidReservation:
                          settings.notifications?.notifyPaidReservation === false,
                      },
                    }
                    await persistSettings(next)
                  }}
                >
                  {settings.notifications?.notifyPaidReservation !== false ? 'Ativado' : 'Desativado'}
                </button>
              </article>

              <article>
                <div>
                  <CalendarCheck2 size={18} />
                  <span>
                    <strong>Nova solicitação de visita</strong>
                    <small>Notificar assim que um cliente solicitar uma visita ao espaço.</small>
                  </span>
                </div>
                <button
                  className={settings.notifications?.notifyNewVisit !== false ? 'enabled' : ''}
                  onClick={async () => {
                    const next = {
                      ...settings,
                      notifications: {
                        ...(settings.notifications || {}),
                        notifyNewVisit:
                          settings.notifications?.notifyNewVisit === false,
                      },
                    }
                    await persistSettings(next)
                  }}
                >
                  {settings.notifications?.notifyNewVisit !== false ? 'Ativado' : 'Desativado'}
                </button>
              </article>

              <article className="push-reminder-option">
                <div>
                  <Clock3 size={18} />
                  <span>
                    <strong>Lembrete no dia anterior</strong>
                    <small>Avisar o proprietário um dia antes de uma reserva paga.</small>
                  </span>
                </div>
                <div className="push-reminder-controls">
                  <input
                    type="time"
                    value={settings.notifications?.reservationDayBeforeTime || '18:00'}
                    onChange={(event) => {
                      setSettings((current) => ({
                        ...current,
                        notifications: {
                          ...(current.notifications || {}),
                          reservationDayBeforeTime: event.target.value,
                        },
                      }))
                    }}
                    onBlur={() => persistSettings(settings)}
                    aria-label="Horário do lembrete no dia anterior"
                  />
                  <button
                    className={settings.notifications?.notifyReservationDayBefore !== false ? 'enabled' : ''}
                    onClick={async () => {
                      const next = {
                        ...settings,
                        notifications: {
                          ...(settings.notifications || {}),
                          notifyReservationDayBefore:
                            settings.notifications?.notifyReservationDayBefore === false,
                        },
                      }
                      await persistSettings(next)
                    }}
                  >
                    {settings.notifications?.notifyReservationDayBefore !== false
                      ? 'Ativado'
                      : 'Desativado'}
                  </button>
                </div>
              </article>

              <article className="push-reminder-option">
                <div>
                  <CalendarDays size={18} />
                  <span>
                    <strong>Lembrete no dia da reserva</strong>
                    <small>Avisar o proprietário no próprio dia da locação.</small>
                  </span>
                </div>
                <div className="push-reminder-controls">
                  <input
                    type="time"
                    value={settings.notifications?.reservationSameDayTime || '07:00'}
                    onChange={(event) => {
                      setSettings((current) => ({
                        ...current,
                        notifications: {
                          ...(current.notifications || {}),
                          reservationSameDayTime: event.target.value,
                        },
                      }))
                    }}
                    onBlur={() => persistSettings(settings)}
                    aria-label="Horário do lembrete no dia da reserva"
                  />
                  <button
                    className={settings.notifications?.notifyReservationSameDay !== false ? 'enabled' : ''}
                    onClick={async () => {
                      const next = {
                        ...settings,
                        notifications: {
                          ...(settings.notifications || {}),
                          notifyReservationSameDay:
                            settings.notifications?.notifyReservationSameDay === false,
                        },
                      }
                      await persistSettings(next)
                    }}
                  >
                    {settings.notifications?.notifyReservationSameDay !== false
                      ? 'Ativado'
                      : 'Desativado'}
                  </button>
                </div>
              </article>
            </div>

            {pushMessage && <div className="admin-demo-note">{pushMessage}</div>}

            <div className="push-help">
              <strong>Como usar no celular</strong>
              <span>
                Android/Chrome: toque em “Ativar neste dispositivo” e permita as notificações.
                No iPhone, adicione o EspaçoOn à Tela de Início pelo Safari e depois abra o painel pelo ícone instalado.
                Os lembretes de reserva usam o horário de Porto Velho (RO).
              </span>
            </div>
          </section>
        )}

        {active === 'system' && (
          <section className="admin-card large danger-zone">
            <div className="danger-zone-header">
              <div className="danger-zone-icon"><ShieldAlert /></div>
              <div>
                <span>Zona de segurança</span>
                <h2>Apagar todos os dados do site</h2>
                <p>
                  Remove os dados operacionais do EspaçoOn, incluindo reservas, pagamentos,
                  contratos, visitas, bloqueios e informações relacionadas.
                </p>
              </div>
            </div>

            <button className="danger-reset-button" onClick={() => {
              setResetPassword('')
              setResetConfirmation('')
              setResetError('')
              setResetOpen(true)
            }}>
              <Trash2 size={17} />
              Apagar todos os dados
            </button>
          </section>
        )}

      </main>

      {resetOpen && createPortal(
        <div
          className="reset-data-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar exclusão de todos os dados"
          onClick={() => !resetLoading && setResetOpen(false)}
        >
          <div className="reset-data-modal" onClick={(event) => event.stopPropagation()}>
            <div className="reset-data-top">
              <div>
                <span>Confirmação obrigatória</span>
                <strong>Apagar todos os dados?</strong>
              </div>
              <button
                onClick={() => !resetLoading && setResetOpen(false)}
                aria-label="Fechar"
                disabled={resetLoading}
              >
                <X />
              </button>
            </div>

            <div className="reset-data-body">
              <div className="reset-data-alert">
                <ShieldAlert />
                <p>
                  Esta operação não pode ser desfeita. Todos os dados operacionais armazenados
                  pelo EspaçoOn serão removidos.
                </p>
              </div>

              <label>
                <span>Senha do administrador</span>
                <div>
                  <KeyRound size={17} />
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={resetPassword}
                    onChange={(event) => setResetPassword(event.target.value)}
                    placeholder="Digite sua senha"
                    disabled={resetLoading}
                  />
                </div>
              </label>

              <label>
                <span>Digite exatamente: <b>APAGAR TODOS OS DADOS</b></span>
                <input
                  className="reset-confirmation-input"
                  value={resetConfirmation}
                  onChange={(event) => setResetConfirmation(event.target.value.toUpperCase())}
                  placeholder="APAGAR TODOS OS DADOS"
                  disabled={resetLoading}
                />
              </label>

              {resetError && <p className="reset-data-error">{resetError}</p>}

              <div className="reset-data-actions">
                <button
                  className="cancel"
                  onClick={() => setResetOpen(false)}
                  disabled={resetLoading}
                >
                  Cancelar
                </button>
                <button
                  className="confirm"
                  disabled={
                    resetLoading ||
                    !resetPassword ||
                    resetConfirmation !== 'APAGAR TODOS OS DADOS'
                  }
                  onClick={async () => {
                    setResetLoading(true)
                    setResetError('')
                    try {
                      await api.resetSiteData(resetPassword, resetConfirmation)
                      setReservations([])
                      setVisits([])
                      setSettings(loadSettings())
                      setRevenueData(null)
                      setResetOpen(false)
                      setResetPassword('')
                      setResetConfirmation('')
                      setActive('overview')
                      setAdminError('Todos os dados do site foram apagados com sucesso.')
                    } catch (error) {
                      setResetError(error.message || 'Não foi possível apagar os dados.')
                    } finally {
                      setResetLoading(false)
                    }
                  }}
                >
                  <Trash2 size={17} />
                  {resetLoading ? 'Apagando...' : 'Apagar definitivamente'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {cancellingReservation && createPortal(
        <div
          className="cancel-reservation-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Cancelar reserva paga"
          onClick={() => !cancellationBusy && setCancellingReservation(null)}
        >
          <div className="cancel-reservation-modal" onClick={(event) => event.stopPropagation()}>
            <div className="cancel-reservation-top">
              <div>
                <span>Cancelamento controlado</span>
                <strong>{cancellingReservation.id}</strong>
              </div>
              <button
                onClick={() => !cancellationBusy && setCancellingReservation(null)}
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            <div className="cancel-reservation-body">
              <div className="cancel-reservation-summary">
                <span>{cancellingReservation.customer?.name || 'Cliente'}</span>
                <strong>{cancellingReservation.date} • {money(cancellingReservation.price)}</strong>
              </div>

              <label>
                <span>Motivo do cancelamento</span>
                <textarea
                  rows={4}
                  value={cancellationReason}
                  onChange={(event) => setCancellationReason(event.target.value)}
                  placeholder="Ex.: Cliente solicitou cancelamento com antecedência."
                />
              </label>

              <label>
                <span>Valor que deverá ser devolvido ao cliente</span>
                <div className="cancel-refund-input">
                  <small>R$</small>
                  <input
                    type="number"
                    min="0"
                    max={Number(cancellingReservation.price || 0)}
                    step="0.01"
                    value={cancellationRefund}
                    onChange={(event) => setCancellationRefund(event.target.value)}
                  />
                </div>
                <small>
                  Informe 0,00 quando não houver reembolso. O sistema apenas registra o valor;
                  nenhum Pix será devolvido automaticamente.
                </small>
              </label>

              {cancellationError && (
                <div className="cancel-reservation-error">{cancellationError}</div>
              )}

              <div className="cancel-reservation-warning">
                <ShieldAlert size={18} />
                <span>
                  Ao confirmar, a data será liberada para novas reservas e este registro permanecerá
                  no histórico.
                </span>
              </div>

              <div className="cancel-reservation-actions">
                <button
                  className="cancel"
                  disabled={cancellationBusy}
                  onClick={() => setCancellingReservation(null)}
                >
                  Voltar
                </button>
                <button
                  className="confirm"
                  disabled={cancellationBusy}
                  onClick={async () => {
                    const refundAmount = Number(cancellationRefund || 0)
                    if (cancellationReason.trim().length < 5) {
                      setCancellationError('Informe o motivo do cancelamento.')
                      return
                    }
                    if (
                      !Number.isFinite(refundAmount) ||
                      refundAmount < 0 ||
                      refundAmount > Number(cancellingReservation.price || 0)
                    ) {
                      setCancellationError('Informe um valor de reembolso válido.')
                      return
                    }

                    setCancellationBusy(true)
                    setCancellationError('')
                    try {
                      const saved = await api.cancelPaidReservation(
                        cancellingReservation.id,
                        cancellationReason.trim(),
                        refundAmount,
                      )
                      setReservations((current) =>
                        current.map((item) => item.id === saved.id ? saved : item)
                      )
                      setCancellingReservation(null)
                      setAdminError('Reserva cancelada. A data foi liberada e o histórico foi preservado.')
                    } catch (error) {
                      setCancellationError(error.message || 'Não foi possível cancelar a reserva.')
                    } finally {
                      setCancellationBusy(false)
                    }
                  }}
                >
                  <Trash2 size={16} />
                  {cancellationBusy ? 'Cancelando...' : 'Confirmar cancelamento'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {selectedReservation && createPortal(
        <div
          className="reservation-detail-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Detalhes da reserva"
          onClick={() => setSelectedReservation(null)}
        >
          <div className="reservation-detail-modal" onClick={(event) => event.stopPropagation()}>
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
                    {paymentStatusLabel(selectedReservation.paymentStatus, selectedReservation.paymentMethod, selectedReservation.holdUntil)}
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
                  <strong>{maskCpf(selectedReservation.customer?.cpf)}</strong>
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
                  <strong>{selectedReservation.providerStatus || selectedReservation.asaasStatus || selectedReservation.paymentStatus || '-'}</strong>
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
        </div>,
        document.body,
      )}
    </div>
  )
}

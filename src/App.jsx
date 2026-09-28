import { useEffect, useMemo, useState } from 'react'
import BookingFlow from './components/BookingFlow'
import VisitScheduler from './components/VisitScheduler'
import ReservationLookup from './components/ReservationLookup'
import AdminPanel from './admin/AdminPanel'
import AdminLogin from './admin/AdminLogin'
import { getPriceForDay, loadSettings } from './data/settings'
import { api } from './data/api'
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Menu,
  ShieldCheck,
  Sparkles,
  Waves,
  X,
  Goal,
  Gamepad2,
  UtensilsCrossed,
  Car,
  Users,
  Snowflake,
  Armchair,
} from 'lucide-react'

const heroSlides = [
  {
    image:
      'https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=2000&q=88',
    eyebrow: 'Clube para família e amigos',
    title: 'Piscina, lazer e espaço para curtir o dia.',
    text: 'Veja as fotos, confira os valores e escolha uma data disponível sem complicação.',
  },
  {
    image:
      'https://images.unsplash.com/photo-1572331165267-854da2b10ccc?auto=format&fit=crop&w=2000&q=88',
    eyebrow: 'Reserva simples',
    title: 'Escolha 12h ou 24h e faça tudo pelo celular.',
    text: 'A agenda mostra as datas disponíveis e você segue direto para a reserva.',
  },
  {
    image:
      'https://images.unsplash.com/photo-1544984243-ec57ea16fe25?auto=format&fit=crop&w=2000&q=88',
    eyebrow: 'Quer conhecer antes?',
    title: 'Veja o espaço ou solicite uma visita.',
    text: 'Escolha um horário sugerido e aguarde a confirmação do proprietário pelo WhatsApp.',
  },
]

const amenities = [
  { icon: Waves, label: 'Piscina', text: 'Área de lazer para aproveitar o dia.' },
  { icon: Goal, label: 'Campo de futebol', text: 'Espaço para jogar com a turma.' },
  { icon: Gamepad2, label: 'Sinuca', text: 'Diversão para todas as idades.' },
  { icon: UtensilsCrossed, label: 'Área de apoio', text: 'Estrutura para confraternizações.' },
  { icon: Car, label: 'Acesso prático', text: 'Chegada simples para seus convidados.' },
  { icon: Users, label: 'Eventos privados', text: 'Seu grupo com mais privacidade.' },
]

const gallery = [
  'https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1572331165267-854da2b10ccc?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1601918774946-25832a4be0d6?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1560184897-ae75f418493e?auto=format&fit=crop&w=1200&q=85',
]

const priceCards = [
  {
    title: 'Segunda a quinta',
    subtitle: 'Ideal para encontros durante a semana',
    twelve: 'R$ 450',
    full: 'R$ 650',
    featured: false,
  },
  {
    title: 'Sexta e sábado',
    subtitle: 'Para aproveitar o fim de semana',
    twelve: 'R$ 700',
    full: 'R$ 950',
    featured: true,
  },
  {
    title: 'Domingos',
    subtitle: 'Seu domingo com a família e amigos',
    twelve: 'R$ 650',
    full: 'R$ 850',
    featured: false,
  },
]

function App() {
  const [slide, setSlide] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [selectedDay, setSelectedDay] = useState(null)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [visitOpen, setVisitOpen] = useState(false)
  const [lookupOpen, setLookupOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(() => window.location.pathname === '/admin')
  const [adminAuthenticated, setAdminAuthenticated] = useState(false)
  const [adminSessionChecked, setAdminSessionChecked] = useState(false)
  const [siteSettings, setSiteSettings] = useState(loadSettings)
  const [reservedDays, setReservedDays] = useState(new Set())

  useEffect(() => {
    const id = setInterval(() => {
      setSlide((current) => (current + 1) % heroSlides.length)
    }, 6500)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let active = true

    Promise.all([api.getSettings(), api.getAvailability()])
      .then(([settingsData, availability]) => {
        if (!active) return
        setSiteSettings(settingsData)
        setReservedDays(new Set(availability.reservedDays || []))
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!adminOpen) {
      setAdminSessionChecked(false)
      return
    }

    let active = true
    api.adminSession()
      .then(() => {
        if (active) setAdminAuthenticated(true)
      })
      .catch(() => {
        if (active) setAdminAuthenticated(false)
      })
      .finally(() => {
        if (active) setAdminSessionChecked(true)
      })

    return () => {
      active = false
    }
  }, [adminOpen])

  const monthDays = useMemo(() => Array.from({ length: 31 }, (_, i) => i + 1), [])

  const amenityIcon = (type) => {
    if (type === 'pool') return Waves
    if (type === 'field' || type === 'sport') return Goal
    if (type === 'food') return UtensilsCrossed
    if (type === 'cold') return Snowflake
    if (type === 'chair') return Armchair
    return Gamepad2
  }

  const publicGallery = Array.isArray(siteSettings.gallery) ? siteSettings.gallery : gallery

  const nextSlide = () => setSlide((current) => (current + 1) % heroSlides.length)
  const prevSlide = () =>
    setSlide((current) => (current - 1 + heroSlides.length) % heroSlides.length)

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setMobileOpen(false)
  }

  if (adminOpen) {
    if (!adminSessionChecked) {
      return <div className="admin-session-loading">Carregando painel...</div>
    }

    if (!adminAuthenticated) {
      return (
        <AdminLogin
          onAuthenticated={() => {
            setAdminAuthenticated(true)
            setAdminSessionChecked(true)
          }}
          onBack={() => {
            window.history.pushState({}, '', '/')
            setAdminOpen(false)
          }}
        />
      )
    }

    return (
      <AdminPanel
        onClose={async () => {
          try {
            await api.adminLogout()
          } catch {}
          try {
            const refreshed = await api.getSettings()
            setSiteSettings(refreshed)
          } catch {}
          setAdminAuthenticated(false)
          window.history.pushState({}, '', '/')
          setAdminOpen(false)
        }}
      />
    )
  }

  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="EspaçoOn">
          <span className="brand-mark">E</span>
          <span>Espaço<span>On</span></span>
        </a>

        <nav className="desktop-nav">
          <button onClick={() => scrollTo('estrutura')}>O espaço</button>
          <button onClick={() => scrollTo('galeria')}>Galeria</button>
          <button onClick={() => scrollTo('precos')}>Preços</button>
          <button onClick={() => scrollTo('agenda')}>Disponibilidade</button>
        </nav>

        <div className="header-actions">
          <button className="header-lookup" onClick={() => setLookupOpen(true)}>
            Consultar reserva
          </button>
          <button className="header-cta" onClick={() => scrollTo('agenda')}>
            Ver datas
            <ArrowRight size={17} />
          </button>
        </div>

        <button
          className="mobile-menu-btn"
          onClick={() => setMobileOpen((value) => !value)}
          aria-label="Abrir menu"
        >
          {mobileOpen ? <X /> : <Menu />}
        </button>

        {mobileOpen && (
          <div className="mobile-menu">
            <button onClick={() => scrollTo('estrutura')}>O espaço</button>
            <button onClick={() => scrollTo('galeria')}>Galeria</button>
            <button onClick={() => scrollTo('precos')}>Preços</button>
            <button onClick={() => scrollTo('agenda')}>Disponibilidade</button>
            <button
              onClick={() => {
                setLookupOpen(true)
                setMobileOpen(false)
              }}
            >
              Consultar reserva
            </button>
          </div>
        )}
      </header>

      <main>
        <section className="hero" id="inicio">
          {heroSlides.map((item, index) => (
            <div
              className={`hero-slide ${index === slide ? 'is-active' : ''}`}
              key={item.title}
              style={{
                backgroundImage: `url("${publicGallery.length ? publicGallery[index % publicGallery.length] : item.image}")`,
              }}
            />
          ))}
          <div className="hero-overlay" />

          <div className="hero-content">
            <div className="hero-copy">
              <span className="eyebrow">
                <Sparkles size={16} />
                {heroSlides[slide].eyebrow}
              </span>
              <h1>{heroSlides[slide].title}</h1>
              <p>{heroSlides[slide].text}</p>
              <div className="hero-actions">
                <button className="btn-primary" onClick={() => scrollTo('agenda')}>
                  <CalendarDays size={19} />
                  Consultar disponibilidade
                </button>
                <button className="btn-secondary" onClick={() => scrollTo('galeria')}>
                  Conhecer o espaço
                </button>
              </div>
            </div>

            <div className="trust-card">
              <div className="trust-icon">
                <ShieldCheck />
              </div>
              <div>
                <strong>Reserva simples e segura</strong>
                <span>Consulte tudo pelo celular antes de reservar.</span>
              </div>
            </div>
          </div>

          <button className="hero-arrow hero-arrow-left" onClick={prevSlide} aria-label="Foto anterior">
            <ChevronLeft />
          </button>
          <button className="hero-arrow hero-arrow-right" onClick={nextSlide} aria-label="Próxima foto">
            <ChevronRight />
          </button>

          <div className="hero-dots">
            {heroSlides.map((_, index) => (
              <button
                key={index}
                className={index === slide ? 'active' : ''}
                onClick={() => setSlide(index)}
                aria-label={`Ir para foto ${index + 1}`}
              />
            ))}
          </div>
        </section>

        <section className="quick-info">
          <div>
            <Clock3 />
            <span><strong>12h ou 24h</strong>Escolha o período ideal</span>
          </div>
          <div>
            <CalendarDays />
            <span><strong>Agenda online</strong>Veja datas disponíveis</span>
          </div>
          <div>
            <MapPin />
            <span><strong>Visita agendada</strong>Conheça antes de reservar</span>
          </div>
        </section>

        <section className="section amenities-section" id="estrutura">
          <div className="section-heading">
            <span className="section-kicker">O que tem no clube</span>
            <h2>Estrutura disponível.</h2>
            <p>Confira o que você terá disponível durante a locação.</p>
          </div>

          <div className="amenities-grid">
            {siteSettings.amenities.map((item) => {
              const Icon = amenityIcon(item.icon)
              return (
                <article className="amenity-card" key={item.id}>
                  <div className="amenity-icon"><Icon /></div>
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section className="gallery-section" id="galeria">
          <div className="section gallery-inner">
            <div className="section-heading light">
              <span className="section-kicker">Fotos do espaço</span>
              <h2>Veja como é o clube.</h2>
              <p>Fotos cadastradas pelo proprietário.</p>
            </div>

            <div className="gallery-grid">
              {publicGallery.map((src, index) => (
                <button className={index === 0 ? 'gallery-main' : ''} key={src}>
                  <img src={src} alt={`Área do espaço ${index + 1}`} />
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="section pricing-section" id="precos">
          <div className="section-heading">
            <span className="section-kicker">Preços</span>
            <h2>Veja os valores antes de reservar.</h2>
            <p>Escolha o período e depois consulte uma data disponível.</p>
          </div>

          <div className="pricing-grid">
            {[
              {
                title: 'Segunda a quinta',
                subtitle: 'Ideal para encontros durante a semana',
                twelve: siteSettings.prices.weekday12,
                full: siteSettings.prices.weekday24,
                featured: false,
              },
              {
                title: 'Sexta e sábado',
                subtitle: 'Para aproveitar o fim de semana',
                twelve: siteSettings.prices.weekend12,
                full: siteSettings.prices.weekend24,
                featured: true,
              },
              {
                title: 'Domingos',
                subtitle: 'Seu domingo com a família e amigos',
                twelve: siteSettings.prices.sunday12,
                full: siteSettings.prices.sunday24,
                featured: false,
              },
            ].map((card) => (
              <article className={`price-card ${card.featured ? 'featured' : ''}`} key={card.title}>
                {card.featured && <span className="popular-badge">Mais procurado</span>}
                <h3>{card.title}</h3>
                <p>{card.subtitle}</p>

                <div className="price-row">
                  <span><Clock3 size={17} /> 12 horas</span>
                  <strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(card.twelve)}</strong>
                </div>
                <div className="price-row">
                  <span><CalendarDays size={17} /> 24 horas</span>
                  <strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(card.full)}</strong>
                </div>

                <button onClick={() => scrollTo('agenda')}>
                  Ver disponibilidade
                  <ArrowRight size={17} />
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="availability-section" id="agenda">
          <div className="section availability-layout">
            <div className="availability-copy">
              <span className="section-kicker">Disponibilidade</span>
              <h2>Escolha uma data livre.</h2>
              <p>Selecione o dia desejado para começar sua reserva ou solicite uma visita antes.</p>

              <div className="legend">
                <span><i className="dot available" /> Disponível</span>
                <span><i className="dot busy" /> Reservado</span>
                <span><i className="dot selected" /> Selecionado</span>
              </div>

              <button className="visit-button" onClick={() => setVisitOpen(true)}>
                <MapPin size={19} />
                Agendar uma visita
              </button>
            </div>

            <div className="calendar-card">
              <div className="calendar-header">
                <div>
                  <span>Disponibilidade</span>
                  <strong>Outubro 2026</strong>
                </div>
                <div className="calendar-nav">
                  <button><ChevronLeft /></button>
                  <button><ChevronRight /></button>
                </div>
              </div>

              <div className="weekdays">
                {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, index) => (
                  <span key={`${day}-${index}`}>{day}</span>
                ))}
              </div>

              <div className="calendar-days">
                <span className="calendar-empty" />
                <span className="calendar-empty" />
                <span className="calendar-empty" />
                <span className="calendar-empty" />
                {monthDays.map((day) => {
                  const busy = reservedDays.has(day) || siteSettings.blockedDays.includes(day)
                  const selected = selectedDay === day
                  return (
                    <button
                      key={day}
                      disabled={busy}
                      onClick={() => !busy && setSelectedDay(day)}
                      className={`${busy ? 'busy' : ''} ${selected ? 'selected' : ''}`}
                    >
                      {day}
                    </button>
                  )
                })}
              </div>

              <div className="calendar-footer">
                {selectedDay ? (
                  <>
                    <div>
                      <span>Data selecionada</span>
                      <strong>{String(selectedDay).padStart(2, '0')}/10/2026</strong>
                    </div>
                    <button onClick={() => setBookingOpen(true)}>
                      Continuar
                      <ArrowRight size={17} />
                    </button>
                  </>
                ) : (
                  <p>Selecione uma data disponível para continuar.</p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="final-cta">
          <div>
            <span className="section-kicker">Pronto para reservar?</span>
            <h2>Veja as datas disponíveis.</h2>
            <p>Escolha o dia e siga para a reserva.</p>
          </div>
          <button onClick={() => scrollTo('agenda')}>
            Ver datas disponíveis
            <ArrowRight />
          </button>
        </section>
      </main>

      {visitOpen && (
        <VisitScheduler onClose={() => setVisitOpen(false)} />
      )}

      {lookupOpen && (
        <ReservationLookup onClose={() => setLookupOpen(false)} />
      )}

      {bookingOpen && selectedDay && (
        <BookingFlow
          day={selectedDay}
          settings={siteSettings}
          onClose={() => setBookingOpen(false)}
          onReserved={(day) => {
            setReservedDays((current) => new Set([...current, day]))
          }}
        />
      )}

      <footer>
        <a className="brand footer-brand" href="#inicio">
          <span className="brand-mark">E</span>
          <span>Espaço<span>On</span></span>
        </a>
        <p>Locação de espaço de lazer • Sistema em desenvolvimento</p>
        <span>© 2026 EspaçoOn</span>
      </footer>
    </div>
  )
}

export default App

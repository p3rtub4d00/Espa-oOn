import PasswordRecovery from './PasswordRecovery'
import { useEffect, useState } from 'react'
import { CheckCircle2, Copy, KeyRound, LockKeyhole, QrCode, RefreshCcw } from 'lucide-react'
import { api } from '../data/api'
import BrandLogo from '../components/BrandLogo'

const money = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))

const dateBR = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('pt-BR')
}

export default function AdminLogin({
  onAuthenticated,
  onBack,
  name = 'ClubeOn',
  branding = {},
  demoMode = false,
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [billingMode, setBillingMode] = useState(false)
  const [billing, setBilling] = useState(null)
  const [pix, setPix] = useState(null)
  const [pixLoading, setPixLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [paidDetected, setPaidDetected] = useState(false)

  const loadBilling = async () => {
    setPixLoading(true)
    setError('')
    try {
      const billingData = await api.licenseBilling()
      setBilling(billingData)

      if (!billingData.cpfCnpjConfigured) {
        setPix(null)
        setError('O CPF/CNPJ do responsável ainda não foi cadastrado. Entre em contato com o suporte do ClubeOn.')
        return
      }

      setPix(await api.createLicensePix())
    } catch (err) {
      setError(err.message || 'Não foi possível gerar a cobrança.')
    } finally {
      setPixLoading(false)
    }
  }

  useEffect(() => {
    if (!billingMode || paidDetected) return

    let cancelled = false

    const check = async () => {
      try {
        const status = await api.licenseStatus(true)
        const regular =
          status.active &&
          !['past_due', 'suspended', 'cancelled'].includes(status.billingStatus)

        if (!cancelled && regular) {
          setPaidDetected(true)
          setError('')
          setTimeout(async () => {
            try {
              await api.adminLogin(password)
              if (!cancelled) onAuthenticated()
            } catch {
              // O botão de login volta a funcionar normalmente após a liberação.
            }
          }, 1200)
        }
      } catch {
        // O próximo ciclo tentará novamente.
      }
    }

    check()
    const id = setInterval(check, 6000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [billingMode, paidDetected, password, onAuthenticated])

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (!demoMode && !password) {
      setError('Informe a senha.')
      return
    }

    setLoading(true)
    try {
      await api.adminLogin(password)
      onAuthenticated()
    } catch (err) {
      if (err.code === 'LICENSE_SUSPENDED' || err.status === 423) {
        setBillingMode(true)
        await loadBilling()
      } else {
        setError(err.message || 'Não foi possível entrar.')
      }
    } finally {
      setLoading(false)
    }
  }

  const copyPix = async () => {
    if (!pix?.payload) return
    await navigator.clipboard.writeText(pix.payload)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div
      className="admin-login-shell"
      style={{
        '--brand-primary': branding.primaryColor || '#1f2937',
        '--brand-secondary': branding.secondaryColor || '#1769ff',
        '--brand-accent': branding.accentColor || '#76d900',
      }}
    >
      <div className={`admin-login-card ${billingMode ? 'admin-billing-card' : ''}`}>
        <div className="admin-login-brand">
          <BrandLogo
            className="brand-logo-login"
            name={name}
            logoUrl={branding.logoUrl}
            primaryColor={branding.primaryColor}
            secondaryColor={branding.secondaryColor}
            accentColor={branding.accentColor}
          />
          <small>Painel administrativo</small>
        </div>

        {!billingMode ? (
          <>
            <div className="admin-login-icon"><LockKeyhole /></div>
            <div className="admin-login-copy">
              <span>{demoMode ? 'Modo demonstração' : 'Acesso restrito'}</span>
              <h1>{demoMode ? 'Teste o painel administrativo.' : 'Digite sua senha.'}</h1>
              <p>
                {demoMode
                  ? 'Nesta demonstração o painel está liberado sem senha para você conhecer todos os recursos.'
                  : 'Entre no painel administrativo para gerenciar reservas e configurações do espaço.'}
              </p>
            </div>

            <form onSubmit={submit}>
              {!demoMode && (
                <label>
                  <span>Senha</span>
                  <div className="admin-login-input">
                    <KeyRound size={18} />
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Senha administrativa"
                      autoFocus
                    />
                  </div>
                </label>
              )}

              {demoMode && (
                <div className="admin-demo-notice">
                  Nenhuma senha é necessária neste ambiente de demonstração.
                </div>
              )}

              {error && <p className="admin-login-error">{error}</p>}
              <button className="admin-login-submit" disabled={loading}>
                {loading ? 'Abrindo...' : (demoMode ? 'Entrar na demonstração' : 'Entrar no painel')}
              </button>
            </form>
            {!demoMode && <PasswordRecovery />}
          </>
        ) : (
          <div className="admin-billing-view">
            <div className="admin-login-icon billing">
              {paidDetected ? <CheckCircle2 /> : <QrCode />}
            </div>

            <div className="admin-login-copy">
              <span>Assinatura ClubeOn</span>
              <h1>{paidDetected ? 'Pagamento confirmado.' : 'Mensalidade pendente.'}</h1>
              <p>
                {paidDetected
                  ? 'Seu sistema foi liberado. Estamos abrindo o painel automaticamente.'
                  : 'Pague a mensalidade para liberar novamente o painel e a agenda de reservas.'}
              </p>
            </div>

            {!paidDetected && (
              <>
                <div className="billing-plan-box">
                  <div>
                    <span>Plano mensal</span>
                    <strong>{money(pix?.amount || billing?.amount || 49.9)}</strong>
                  </div>
                  <div>
                    <span>Vencimento</span>
                    <strong>{dateBR(pix?.dueDate || billing?.nextDueDate)}</strong>
                  </div>
                </div>

                {pixLoading && (
                  <div className="billing-loading">
                    <RefreshCcw className="spin" />
                    Gerando cobrança segura...
                  </div>
                )}

                {pix?.encodedImage && (
                  <div className="billing-qr">
                    <img src={'data:image/png;base64,' + pix.encodedImage} alt="QR Code Pix da mensalidade ClubeOn" />
                    <strong>Escaneie para pagar via Pix</strong>
                    <span>A liberação é automática após a confirmação do Asaas.</span>
                  </div>
                )}

                {pix?.payload && (
                  <button className="billing-copy-pix" onClick={copyPix}>
                    <Copy size={16} />
                    {copied ? 'Código Pix copiado' : 'Copiar Pix Copia e Cola'}
                  </button>
                )}

                {error && <p className="admin-login-error">{error}</p>}

                {!pixLoading && !pix && billing?.cpfCnpjConfigured && (
                  <button className="billing-retry" onClick={loadBilling}>
                    <RefreshCcw size={16} />
                    Gerar cobrança novamente
                  </button>
                )}

                <div className="billing-waiting">
                  <span />
                  Aguardando confirmação do pagamento...
                </div>
              </>
            )}
          </div>
        )}

        <button className="admin-login-back" onClick={onBack}>Voltar para o site</button>
      </div>
    </div>
  )
}

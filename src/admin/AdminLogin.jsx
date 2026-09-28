import { useState } from 'react'
import { KeyRound, LockKeyhole } from 'lucide-react'
import { api } from '../data/api'
import BrandLogo from '../components/BrandLogo'

export default function AdminLogin({
  onAuthenticated,
  onBack,
  name = 'EspaçoOn',
  branding = {},
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (!password) {
      setError('Informe a senha.')
      return
    }

    setLoading(true)
    try {
      await api.adminLogin(password)
      onAuthenticated()
    } catch (err) {
      setError(err.message || 'Não foi possível entrar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="admin-login-shell"
      style={{
        '--brand-primary': branding.primaryColor || '#0f3554',
        '--brand-secondary': branding.secondaryColor || '#1f8efa',
        '--brand-accent': branding.accentColor || '#53b9ff',
      }}
    >
      <div className="admin-login-card">
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

        <div className="admin-login-icon">
          <LockKeyhole />
        </div>

        <div className="admin-login-copy">
          <span>Acesso restrito</span>
          <h1>Digite sua senha.</h1>
          <p>
            A autenticação agora é feita no servidor. A senha é configurada no Render e não fica exposta no navegador.
          </p>
        </div>

        <form onSubmit={submit}>
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

          {error && <p className="admin-login-error">{error}</p>}

          <button className="admin-login-submit" disabled={loading}>
            {loading ? 'Verificando...' : 'Entrar no painel'}
          </button>
        </form>

        <button className="admin-login-back" onClick={onBack}>
          Voltar para o site
        </button>
      </div>
    </div>
  )
}

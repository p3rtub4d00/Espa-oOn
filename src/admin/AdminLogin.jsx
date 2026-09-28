import { useState } from 'react'
import { KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react'

async function hashPassword(value) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export default function AdminLogin({ onAuthenticated, onBack }) {
  const hasPassword = Boolean(localStorage.getItem('espacoon_admin_password'))
  const [mode, setMode] = useState(hasPassword ? 'login' : 'setup')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Use uma senha com pelo menos 6 caracteres.')
      return
    }

    if (mode === 'setup' && password !== confirm) {
      setError('As senhas não conferem.')
      return
    }

    setLoading(true)
    const hashed = await hashPassword(password)

    if (mode === 'setup') {
      localStorage.setItem('espacoon_admin_password', hashed)
      sessionStorage.setItem('espacoon_admin_session', 'authenticated')
      onAuthenticated()
      return
    }

    const stored = localStorage.getItem('espacoon_admin_password')
    if (hashed !== stored) {
      setLoading(false)
      setError('Senha incorreta.')
      return
    }

    sessionStorage.setItem('espacoon_admin_session', 'authenticated')
    onAuthenticated()
  }

  return (
    <div className="admin-login-shell">
      <div className="admin-login-card">
        <div className="admin-login-brand">
          <span>E</span>
          <div>
            <strong>EspaçoOn</strong>
            <small>Painel administrativo</small>
          </div>
        </div>

        <div className="admin-login-icon">
          {mode === 'setup' ? <ShieldCheck /> : <LockKeyhole />}
        </div>

        <div className="admin-login-copy">
          <span>{mode === 'setup' ? 'Primeiro acesso' : 'Acesso restrito'}</span>
          <h1>{mode === 'setup' ? 'Crie a senha do painel.' : 'Digite sua senha.'}</h1>
          <p>
            {mode === 'setup'
              ? 'Esta senha ficará salva somente neste navegador durante a fase de testes.'
              : 'O painel administrativo não fica mais disponível diretamente na página pública.'}
          </p>
        </div>

        <form onSubmit={submit}>
          <label>
            <span>Senha</span>
            <div className="admin-login-input">
              <KeyRound size={18} />
              <input
                type="password"
                autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo de 6 caracteres"
                autoFocus
              />
            </div>
          </label>

          {mode === 'setup' && (
            <label>
              <span>Confirme a senha</span>
              <div className="admin-login-input">
                <LockKeyhole size={18} />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Digite novamente"
                />
              </div>
            </label>
          )}

          {error && <p className="admin-login-error">{error}</p>}

          <button className="admin-login-submit" disabled={loading}>
            {loading ? 'Verificando...' : mode === 'setup' ? 'Criar senha e entrar' : 'Entrar no painel'}
          </button>
        </form>

        <button className="admin-login-back" onClick={onBack}>
          Voltar para o site
        </button>
      </div>
    </div>
  )
}

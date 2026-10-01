const browserTypes = new Set(['visit', 'admin_open', 'contact_click'])
const completed = new Set()
const pending = new Set()
let temporarySessionId
function sessionId() {
  if (!temporarySessionId) temporarySessionId = crypto.randomUUID()
  try {
    const stored = sessionStorage.getItem('clubeon_demo_session')
    if (stored && /^[A-Za-z0-9-]{8,80}$/.test(stored)) return stored
    sessionStorage.setItem('clubeon_demo_session', temporarySessionId)
  } catch { /* A blocked browser store must not prevent using the demo. */ }
  return temporarySessionId
}
export async function trackDemoEvent(type) {
  if (!browserTypes.has(type) || navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return false
  let key
  try {
    const eventId = sessionId()
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Manaus', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    key = type + ':' + day
    if (completed.has(key) || pending.has(key)) return false
    pending.add(key)
    const response = await fetch('/api/demo/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', keepalive: true,
      body: JSON.stringify({ type, eventId }),
    })
    const data = await response.json().catch(() => ({}))
    const recorded = response.ok && data.recorded === true
    if (recorded) completed.add(key)
    return recorded
  } catch { return false } finally { if (key) pending.delete(key) }
}

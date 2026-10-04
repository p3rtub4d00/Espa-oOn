import { BlockList, isIP } from 'node:net'
import { createHmac, randomBytes } from 'node:crypto'

const reserved = new BlockList()
for (const [ip, bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) reserved.addSubnet(ip,bits,'ipv4')
for (const [ip, bits] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8],['2001:db8::',32]]) reserved.addSubnet(ip,bits,'ipv6')
export function publicVisitorIp(value) {
  const ip = String(value || '').trim()
  const version = isIP(ip)
  if (!version || reserved.check(ip, version === 4 ? 'ipv4' : 'ipv6')) return null
  // Only global IPv6 unicast or IPv4-mapped global addresses.
  if (version === 6 && !/^::ffff:/i.test(ip) && !/^[23]/i.test(ip)) return null
  if (version === 6 && /^::ffff:/i.test(ip)) {
    const expanded = ip.split(':').slice(-2)
    if (expanded[1].includes('.')) return expanded[1]
    const value = parseInt(expanded[0],16)*65536 + parseInt(expanded[1],16)
    return [24,16,8,0].map(shift => (value >>> shift) & 255).join('.')
  }
  return ip
}

// Only analytics uses this Render edge header; authentication/rate-limit trust is unchanged.
export function demoVisitorIp(req, { render = process.env.RENDER === 'true' } = {}) {
  const peer = req.socket?.remoteAddress
  if (render && isIP(peer || '') && !publicVisitorIp(peer)) {
    const edgeIp = publicVisitorIp(req.get('CF-Connecting-IP'))
    if (edgeIp) return edgeIp
  }
  return publicVisitorIp(req.ip)
}
const clean = value => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0,80) : ''
export function approximateLocation(data) {
  if (data?.success !== true) return null
  const countryCode = clean(data.country_code).toUpperCase()
  if (!/^[A-Z]{2}$/.test(countryCode)) return null
  return { city: clean(data.city), region: clean(data.region), country: clean(data.country), countryCode }
}

export function createDemoLocationLookup({ fetcher = (...args) => fetch(...args), now = Date.now } = {}) {
  const secret = randomBytes(32)
  const cache = new Map(), pending = new Map()
  let day = '', used = 0, retryAfter = 0
  const diagnose = async value => {
    const ip = publicVisitorIp(value)
    if (!ip) return {location:null,status:'no_public_ip'}
    const time = now(), key = createHmac('sha256', secret).update(ip).digest('hex')
    for (const [id, entry] of cache) if (entry.expiresAt <= time) cache.delete(id)
    if (cache.has(key)) return cache.get(key).result
    if (pending.has(key)) return pending.get(key)
    const today = new Date(time).toISOString().slice(0,10)
    if (day !== today) { day = today; used = 0 }
    if (retryAfter > time) return {location:null,status:'provider_rate_limit'}
    if (used >= 1000 || pending.size >= 8) return {location:null,status:'local_limit'}
    used++
    const request = (async () => {
      let location = null, status = 'provider_error'
      try {
        const url = 'https://ipwho.is/' + encodeURIComponent(ip) + '?fields=success,city,region,country,country_code&lang=pt-BR'
        const response = await fetcher(url, { signal: AbortSignal.timeout(4000), redirect: 'error' })
        if (response.status === 429) {
          const seconds = Number(response.headers?.get('retry-after'))
          retryAfter = now() + (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds,86400)*1000 : 3600000)
          status = 'provider_rate_limit'
        }
        if (response.ok) {
          location = approximateLocation(await response.json())
          status = location ? 'identified' : 'not_available'
        }
      } catch (error) { status = ['TimeoutError','AbortError'].includes(error?.name) ? 'provider_timeout' : 'provider_error' }
      if (cache.size >= 1000) cache.delete(cache.keys().next().value)
      const result = {location,status}
      cache.set(key, { result, expiresAt: now() + (location ? 900000 : 60000) })
      return result
    })()
    pending.set(key,request)
    try { return await request } finally { pending.delete(key) }
  }
  const lookup = async value => (await diagnose(value)).location
  lookup.diagnose = diagnose
  return lookup
}
export const lookupDemoLocation = createDemoLocationLookup()

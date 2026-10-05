import { rateLimit } from 'express-rate-limit'
export function installClubRecoveryRequest({ app, configured, sendRequest }) {
  const limiter = rateLimit({ windowMs: 15 * 60000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'Aguarde alguns minutos antes de solicitar novamente.' } })
  app.post('/api/admin/recovery-request', limiter, async (req, res) => {
    res.set('Cache-Control', 'no-store')
    const phone = req.body?.phone
    if (typeof phone !== 'string' || phone.length > 30 || !/^[+\d\s()-]+$/.test(phone) || ![10, 11, 12, 13].includes(phone.replace(/\D/g, '').length)) return res.status(400).json({ error: 'Informe o celular com DDD cadastrado no clube.' })
    if (!configured) return res.status(503).json({ error: 'A recuperação de senha ainda não está configurada neste clube.' })
    try {
      await sendRequest({ phone, company: req.body?.company ? 'invalid' : '' })
      res.json({ ok: true, message: 'Se o celular corresponder ao cadastro deste clube, nossa equipe receberá o pedido e enviará um link pelo WhatsApp cadastrado. Aguarde o atendimento.' })
    } catch {
      res.status(503).json({ error: 'Não foi possível enviar o pedido agora. Tente novamente em alguns minutos.' })
    }
  })
}

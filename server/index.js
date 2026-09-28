import express from 'express'
import mongoose from 'mongoose'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import crypto from 'crypto'
import QRCode from 'qrcode'
import { GridFSBucket, ObjectId } from 'mongodb'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const app = express()
const PORT = process.env.PORT || 10000
const MONGODB_URI = process.env.MONGODB_URI
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
const JWT_SECRET = process.env.JWT_SECRET
const ASAAS_API_KEY = process.env.ASAAS_API_KEY
const ASAAS_ENV = String(process.env.ASAAS_ENV || 'production').toLowerCase()
const ASAAS_WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN
const ASAAS_BASE_URL = ASAAS_ENV === 'production'
  ? 'https://api.asaas.com/v3'
  : 'https://api-sandbox.asaas.com/v3'

app.set('trust proxy', 1)

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}))

app.use(express.json({ limit: '4mb' }))
app.use(cookieParser())

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.' },
})

const publicWriteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas solicitações. Aguarde alguns minutos e tente novamente.' },
})

const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de pagamento. Aguarde alguns minutos e tente novamente.' },
})

const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas consultas. Aguarde alguns minutos e tente novamente.' },
})

const reservationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    day: Number,
    date: String,
    dateISO: { type: String, index: true },
    period: String,
    price: Number,
    customer: {
      name: String,
      cpf: String,
      phone: String,
      address: String,
    },
    paymentStatus: { type: String, default: 'awaiting-payment', index: true },
    contractId: String,
    asaasCustomerId: String,
    asaasPaymentId: { type: String, index: true },
    asaasStatus: String,
    pixExpirationDate: String,
    holdUntil: Date,
    paidAt: Date,
  },
  { timestamps: true },
)

const contractSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    reservationId: { type: String, required: true, index: true },
    reservationDate: String,
    period: String,
    price: Number,
    customer: {
      name: String,
      cpf: String,
      phone: String,
      address: String,
    },
    signedAt: Date,
    signature: String,
    hash: String,
    status: { type: String, default: 'signed-awaiting-payment' },
    paymentStatus: { type: String, default: 'awaiting-payment' },
    paidAt: Date,
  },
  { timestamps: true },
)

const visitSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: String,
    phone: String,
    requestedDate: String,
    requestedTime: String,
    confirmedDate: String,
    confirmedTime: String,
    ownerMessage: String,
    status: { type: String, default: 'pending-owner-confirmation' },
    respondedAt: Date,
  },
  { timestamps: true },
)

const webhookEventSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    event: String,
    paymentId: String,
    status: { type: String, default: 'processing', index: true },
    attempts: { type: Number, default: 1 },
    lastError: String,
    receivedAt: { type: Date, default: Date.now },
    processedAt: Date,
  },
  { timestamps: true },
)

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'main', unique: true },
    prices: mongoose.Schema.Types.Mixed,
    blockedDays: [Number],
    blockedDates: [String],
    specialDates: [mongoose.Schema.Types.Mixed],
    rentalHours: mongoose.Schema.Types.Mixed,
    gallery: [String],
    amenities: [mongoose.Schema.Types.Mixed],
  },
  { timestamps: true },
)

const Reservation = mongoose.model('Reservation', reservationSchema)
const Contract = mongoose.model('Contract', contractSchema)
const Visit = mongoose.model('Visit', visitSchema)
const Settings = mongoose.model('Settings', settingsSchema)
const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema)

const DEFAULT_SETTINGS = {
  key: 'main',
  prices: {
    weekday12: 450,
    weekday24: 650,
    weekend12: 700,
    weekend24: 950,
    sunday12: 650,
    sunday24: 850,
  },
  blockedDays: [],
  blockedDates: [],
  specialDates: [],
  rentalHours: {
    '12h': '08:00 às 20:00',
    '24h': '08:00 às 08:00 do dia seguinte',
  },
  gallery: [
    'https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=1200&q=85',
    'https://images.unsplash.com/photo-1572331165267-854da2b10ccc?auto=format&fit=crop&w=1200&q=85',
    'https://images.unsplash.com/photo-1601918774946-25832a4be0d6?auto=format&fit=crop&w=1200&q=85',
    'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=85',
  ],
  amenities: [
    { id: 'pool', name: 'Piscina', description: 'Área de lazer para aproveitar o dia.', icon: 'pool' },
    { id: 'field', name: 'Campo de futebol', description: 'Espaço para jogar com a turma.', icon: 'field' },
    { id: 'snooker', name: 'Sinuca', description: 'Mesa de sinuca disponível para os convidados.', icon: 'game' },
    { id: 'support', name: 'Área de apoio', description: 'Estrutura para confraternizações.', icon: 'food' },
  ],
}

function normalizePhone(value = '') {
  return String(value).replace(/\D/g, '')
}

function onlyDigits(value = '') {
  return String(value).replace(/\D/g, '')
}

function isValidCpf(value = '') {
  const cpf = onlyDigits(value)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false

  const calcDigit = (base, factor) => {
    let total = 0
    for (const digit of base) total += Number(digit) * factor--
    const remainder = (total * 10) % 11
    return remainder === 10 ? 0 : remainder
  }

  const first = calcDigit(cpf.slice(0, 9), 10)
  const second = calcDigit(cpf.slice(0, 10), 11)
  return first === Number(cpf[9]) && second === Number(cpf[10])
}

function textValue(value, maxLength = 160) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function isValidPhone(value = '') {
  const digits = onlyDigits(value)
  return digits.length >= 10 && digits.length <= 13
}

function isValidPeriod(value) {
  return value === '12h' || value === '24h'
}

function isValidId(value, prefix) {
  return new RegExp('^' + prefix + '-[A-Z0-9-]{6,40}
function displayDate(value) {
  const [year, month, day] = String(value || '').split('-')
  return year && month && day ? day + '/' + month + '/' + year : value
}

async function asaasRequest(endpoint, options = {}) {
  if (!ASAAS_API_KEY) {
    const error = new Error('ASAAS_API_KEY não configurada no Render.')
    error.statusCode = 503
    throw error
  }

  const productionKey = ASAAS_API_KEY.startsWith('$aact_prod_')
  const sandboxKey = ASAAS_API_KEY.startsWith('$aact_hmlg_')
  if ((ASAAS_ENV === 'production' && sandboxKey) || (ASAAS_ENV !== 'production' && productionKey)) {
    const error = new Error(
      'ASAAS_ENV e ASAAS_API_KEY pertencem a ambientes diferentes. ' +
      'Use production com chave $aact_prod_ ou sandbox com chave $aact_hmlg_.'
    )
    error.statusCode = 503
    throw error
  }

  const response = await fetch(ASAAS_BASE_URL + endpoint, {
    method: options.method || 'GET',
    headers: {
      accept: 'application/json',
      'User-Agent': 'EspacoOn/1.0 (Node.js; ' + ASAAS_ENV + ')',
      access_token: ASAAS_API_KEY,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const description = data?.errors?.map((item) => item.description).join(' ') ||
      data?.message ||
      'Erro na comunicação com o Asaas.'
    const error = new Error(description)
    error.statusCode = response.status
    error.asaas = data
    throw error
  }

  return data
}

async function getOrCreateAsaasCustomer(customer, reservationId) {
  const cpfCnpj = onlyDigits(customer?.cpf)
  const mobilePhone = onlyDigits(customer?.phone)

  if (!cpfCnpj) {
    const error = new Error('CPF é obrigatório para gerar a cobrança Pix.')
    error.statusCode = 400
    throw error
  }

  if (!isValidCpf(cpfCnpj)) {
    const error = new Error('CPF inválido. Confira o número informado antes de gerar o Pix.')
    error.statusCode = 400
    throw error
  }

  const search = await asaasRequest('/customers?cpfCnpj=' + encodeURIComponent(cpfCnpj) + '&limit=1')
  if (search?.data?.length) return search.data[0]

  return asaasRequest('/customers', {
    method: 'POST',
    body: {
      name: customer?.name,
      cpfCnpj,
      mobilePhone,
      externalReference: reservationId,
      notificationDisabled: true,
    },
  })
}

async function currentSettings() {
  return (await Settings.findOne({ key: 'main' }).lean()) || DEFAULT_SETTINGS
}

function priceForDate(dateISO, period, settings) {
  const [year, month, day] = String(dateISO || '').split('-').map(Number)
  const date = new Date(year, month - 1, day, 12)
  if (Number.isNaN(date.getTime())) {
    const error = new Error('Data da reserva inválida.')
    error.statusCode = 400
    throw error
  }

  const special = (settings.specialDates || []).find((item) =>
    item.date === dateISO ||
    (
      item.date == null &&
      Number(item.day) === day &&
      month === 10 &&
      year === 2026
    )
  )

  if (special) {
    return Number(period === '12h' ? special.price12 : special.price24)
  }

  const weekday = date.getDay()
  if (weekday === 0) return Number(period === '12h' ? settings.prices.sunday12 : settings.prices.sunday24)
  if (weekday === 5 || weekday === 6) return Number(period === '12h' ? settings.prices.weekend12 : settings.prices.weekend24)
  return Number(period === '12h' ? settings.prices.weekday12 : settings.prices.weekday24)
}

async function markPaymentReceived(reservation, payment, eventName = 'PAYMENT_RECEIVED') {
  if (!reservation) return null
  const paidAt = payment?.paymentDate || payment?.clientPaymentDate || new Date()

  const savedReservation = await Reservation.findOneAndUpdate(
    { id: reservation.id },
    {
      $set: {
        paymentStatus: 'paid',
        asaasStatus: payment?.status || 'RECEIVED',
        paidAt,
      },
    },
    { new: true },
  ).lean()

  const savedContract = await Contract.findOneAndUpdate(
    { id: reservation.contractId },
    {
      $set: {
        paymentStatus: 'paid',
        status: 'signed-paid',
        paidAt,
      },
    },
    { new: true },
  ).lean()

  console.log('Asaas:', eventName, reservation.id, payment?.id)
  return { reservation: savedReservation, contract: savedContract }
}


function signAdminToken() {
  return jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '12h' })
}

function requireAdmin(req, res, next) {
  try {
    const token = req.cookies.espacoon_admin
    if (!token) return res.status(401).json({ error: 'Não autenticado.' })
    const payload = jwt.verify(token, JWT_SECRET)
    if (payload.role !== 'admin') return res.status(403).json({ error: 'Acesso negado.' })
    next()
  } catch {
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' })
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    asaas: {
      configured: Boolean(ASAAS_API_KEY),
      environment: ASAAS_ENV,
      keyType: ASAAS_API_KEY?.startsWith('$aact_prod_')
        ? 'production'
        : ASAAS_API_KEY?.startsWith('$aact_hmlg_')
          ? 'sandbox'
          : ASAAS_API_KEY
            ? 'unknown'
            : 'missing',
      webhookTokenConfigured: Boolean(ASAAS_WEBHOOK_TOKEN),
    },
  })
})

app.post('/api/admin/login', (req, res) => {
  const password = String(req.body?.password || '')
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'ADMIN_PASSWORD não configurada no Render.' })
  }
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Senha incorreta.' })
  }

  res.cookie('espacoon_admin', signAdminToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000,
  })
  res.json({ ok: true })
})

app.get('/api/admin/session', requireAdmin, (_req, res) => {
  res.json({ authenticated: true })
})

app.post('/api/admin/logout', (_req, res) => {
  res.clearCookie('espacoon_admin')
  res.json({ ok: true })
})

app.get('/api/settings', async (_req, res, next) => {
  try {
    const settings = await Settings.findOne({ key: 'main' }).lean()
    res.json(settings || DEFAULT_SETTINGS)
  } catch (error) {
    next(error)
  }
})

function displayDateToISO(value) {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null
  return match[3] + '-' + match[2] + '-' + match[1]
}

app.get('/api/availability', async (_req, res, next) => {
  try {
    const [reservations, settings] = await Promise.all([
      Reservation.find(
        { paymentStatus: { $in: ['pending-asaas', 'confirmed-asaas', 'paid', 'approved-simulated'] } },
        { day: 1, date: 1, dateISO: 1, paymentStatus: 1, holdUntil: 1, asaasPaymentId: 1, _id: 0 },
      ).lean(),
      Settings.findOne(
        { key: 'main' },
        { blockedDays: 1, blockedDates: 1, _id: 0 },
      ).lean(),
    ])

    const now = new Date()
    const expiredPending = reservations.filter(
      (item) =>
        item.paymentStatus === 'pending-asaas' &&
        item.holdUntil &&
        new Date(item.holdUntil) <= now,
    )

    for (const item of expiredPending) {
      if (item.asaasPaymentId) {
        try {
          await asaasRequest('/payments/' + item.asaasPaymentId, { method: 'DELETE' })
        } catch (error) {
          console.warn('Não foi possível excluir cobrança Asaas expirada:', item.asaasPaymentId, error.message)
        }
      }

      await Reservation.updateOne(
        { id: item.id },
        {
          $set: {
            paymentStatus: 'expired',
            asaasStatus: 'EXPIRED_LOCAL_HOLD',
          },
        },
      )
    }

    const reservedDates = reservations
      .filter((item) => {
        if (item.paymentStatus !== 'pending-asaas') return true
        return !item.holdUntil || new Date(item.holdUntil) > now
      })
      .map((item) => item.dateISO || displayDateToISO(item.date))
      .filter(Boolean)

    const legacyBlocked = (settings?.blockedDays || []).map(
      (day) => '2026-10-' + String(day).padStart(2, '0'),
    )

    res.json({
      reservedDates,
      blockedDates: [...new Set([...(settings?.blockedDates || []), ...legacyBlocked])],
    })
  } catch (error) {
    next(error)
  }
})

app.put('/api/admin/settings', requireAdmin, async (req, res, next) => {
  try {
    const allowed = ['prices', 'blockedDays', 'blockedDates', 'specialDates', 'rentalHours', 'gallery', 'amenities']
    const update = {}
    for (const key of allowed) {
      if (req.body?.[key] !== undefined) update[key] = req.body[key]
    }
    const settings = await Settings.findOneAndUpdate(
      { key: 'main' },
      { $set: update, $setOnInsert: { key: 'main' } },
      { upsert: true, new: true },
    ).lean()
    res.json(settings)
  } catch (error) {
    next(error)
  }
})

app.post('/api/contracts', async (req, res, next) => {
  try {
    const payload = req.body
    if (!payload?.id || !payload?.reservationId) {
      return res.status(400).json({ error: 'Contrato inválido.' })
    }
    const contract = await Contract.findOneAndUpdate(
      { id: payload.id },
      { $set: payload },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean()
    res.status(201).json(contract)
  } catch (error) {
    next(error)
  }
})

app.post('/api/reservations', async (req, res, next) => {
  try {
    const payload = req.body
    if (!payload?.id || !payload?.customer?.phone || !payload?.date) {
      return res.status(400).json({ error: 'Reserva inválida.' })
    }

    const reservation = await Reservation.findOneAndUpdate(
      { id: payload.id },
      { $set: payload },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean()

    res.status(201).json(reservation)
  } catch (error) {
    next(error)
  }
})

app.post('/api/payments/asaas/pix', async (req, res, next) => {
  try {
    const { reservation, contractId } = req.body || {}
    if (!reservation?.id || !reservation?.dateISO || !reservation?.period || !contractId) {
      return res.status(400).json({ error: 'Dados da cobrança incompletos.' })
    }

    const contract = await Contract.findOne({ id: contractId, reservationId: reservation.id }).lean()
    if (!contract) {
      return res.status(400).json({ error: 'Contrato assinado não encontrado para esta reserva.' })
    }

    const settings = await currentSettings()
    const serverPrice = priceForDate(reservation.dateISO, reservation.period, settings)

    const now = new Date()
    const conflict = await Reservation.findOne({
      dateISO: reservation.dateISO,
      id: { $ne: reservation.id },
      $or: [
        { paymentStatus: { $in: ['confirmed-asaas', 'paid', 'approved-simulated'] } },
        {
          paymentStatus: 'pending-asaas',
          $or: [
            { holdUntil: { $gt: now } },
            { holdUntil: null },
          ],
        },
      ],
    }).lean()

    if (conflict) {
      return res.status(409).json({ error: 'Esta data já possui uma reserva ou pagamento em andamento.' })
    }

    const existing = await Reservation.findOne({ id: reservation.id }).lean()
    if (
      existing?.asaasPaymentId &&
      ['pending-asaas', 'confirmed-asaas'].includes(existing.paymentStatus) &&
      (existing.paymentStatus !== 'pending-asaas' || !existing.holdUntil || new Date(existing.holdUntil) > now)
    ) {
      const qr = await asaasRequest('/payments/' + existing.asaasPaymentId + '/pixQrCode')
      return res.json({
        reservation: existing,
        payment: {
          id: existing.asaasPaymentId,
          status: existing.asaasStatus,
        },
        pix: qr,
      })
    }

    const customer = await getOrCreateAsaasCustomer(reservation.customer, reservation.id)
    const dueDate = new Date().toISOString().slice(0, 10)

    const reconciled = await asaasRequest(
      '/payments?externalReference=' + encodeURIComponent(reservation.id) + '&limit=1'
    )

    const payment = reconciled?.data?.[0] || await asaasRequest('/payments', {
      method: 'POST',
      body: {
        customer: customer.id,
        billingType: 'PIX',
        value: serverPrice,
        dueDate,
        description: 'Reserva EspaçoOn - ' + displayDate(reservation.dateISO) + ' - ' + reservation.period,
        externalReference: reservation.id,
      },
    })

    const pix = await asaasRequest('/payments/' + payment.id + '/pixQrCode')

    const savedReservation = await Reservation.findOneAndUpdate(
      { id: reservation.id },
      {
        $set: {
          ...reservation,
          price: serverPrice,
          contractId,
          paymentStatus: 'pending-asaas',
          asaasCustomerId: customer.id,
          asaasPaymentId: payment.id,
          asaasStatus: payment.status,
          pixExpirationDate: pix.expirationDate,
          holdUntil: new Date(Date.now() + 15 * 60 * 1000),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean()

    await Contract.findOneAndUpdate(
      { id: contractId },
      {
        $set: {
          price: serverPrice,
          paymentStatus: 'pending-asaas',
          status: 'signed-awaiting-payment',
        },
      },
      { new: true },
    )

    res.status(201).json({
      reservation: savedReservation,
      payment: {
        id: payment.id,
        status: payment.status,
      },
      pix,
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/payments/asaas/:reservationId/status', async (req, res, next) => {
  try {
    const reservation = await Reservation.findOne({ id: req.params.reservationId }).lean()
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada.' })
    if (!reservation.asaasPaymentId) {
      return res.status(400).json({ error: 'Esta reserva ainda não possui cobrança Asaas.' })
    }

    if (
      reservation.paymentStatus === 'pending-asaas' &&
      reservation.holdUntil &&
      new Date(reservation.holdUntil) <= new Date()
    ) {
      try {
        await asaasRequest('/payments/' + reservation.asaasPaymentId, { method: 'DELETE' })
      } catch (error) {
        console.warn('Não foi possível excluir cobrança expirada:', error.message)
      }

      const expired = await Reservation.findOneAndUpdate(
        { id: reservation.id },
        { $set: { paymentStatus: 'expired', asaasStatus: 'EXPIRED_LOCAL_HOLD' } },
        { new: true },
      ).lean()

      return res.json({
        paid: false,
        expired: true,
        reservation: expired,
        asaasStatus: 'EXPIRED_LOCAL_HOLD',
      })
    }

    const payment = await asaasRequest('/payments/' + reservation.asaasPaymentId)

    if (payment.status === 'RECEIVED') {
      const result = await markPaymentReceived(reservation, payment, 'STATUS_CHECK')
      return res.json({ paid: true, ...result, asaasStatus: payment.status })
    }

    if (payment.status === 'CONFIRMED') {
      const updated = await Reservation.findOneAndUpdate(
        { id: reservation.id },
        { $set: { paymentStatus: 'confirmed-asaas', asaasStatus: payment.status } },
        { new: true },
      ).lean()

      return res.json({
        paid: false,
        confirmed: true,
        reservation: updated,
        asaasStatus: payment.status,
      })
    }

    const updated = await Reservation.findOneAndUpdate(
      { id: reservation.id },
      { $set: { asaasStatus: payment.status } },
      { new: true },
    ).lean()

    res.json({
      paid: false,
      reservation: updated,
      asaasStatus: payment.status,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/webhooks/asaas', async (req, res, next) => {
  try {
    if (!ASAAS_WEBHOOK_TOKEN) {
      return res.status(503).json({ error: 'ASAAS_WEBHOOK_TOKEN não configurado.' })
    }

    const incomingToken = req.get('asaas-access-token')
    if (incomingToken !== ASAAS_WEBHOOK_TOKEN) {
      return res.status(401).json({ error: 'Webhook não autorizado.' })
    }

    const { id, event, payment } = req.body || {}
    if (!id || !event) return res.status(400).json({ error: 'Evento inválido.' })

    const duplicate = await WebhookEvent.findOne({ id }).lean()
    if (duplicate) return res.status(200).json({ ok: true, duplicate: true })

    const reservation = payment?.externalReference
      ? await Reservation.findOne({ id: payment.externalReference }).lean()
      : payment?.id
        ? await Reservation.findOne({ asaasPaymentId: payment.id }).lean()
        : null

    if (reservation) {
      if (event === 'PAYMENT_RECEIVED' || payment?.status === 'RECEIVED') {
        await markPaymentReceived(reservation, payment, event)
      } else if (event === 'PAYMENT_CONFIRMED') {
        await Reservation.updateOne(
          { id: reservation.id },
          { $set: { paymentStatus: 'confirmed-asaas', asaasStatus: payment?.status || 'CONFIRMED' } },
        )
      } else if (['PAYMENT_REFUNDED', 'PAYMENT_DELETED'].includes(event)) {
        await Reservation.updateOne(
          { id: reservation.id },
          { $set: { paymentStatus: event === 'PAYMENT_REFUNDED' ? 'refunded' : 'cancelled', asaasStatus: payment?.status || event } },
        )
        await Contract.updateOne(
          { id: reservation.contractId },
          { $set: { paymentStatus: event === 'PAYMENT_REFUNDED' ? 'refunded' : 'cancelled' } },
        )
      } else {
        await Reservation.updateOne(
          { id: reservation.id },
          { $set: { asaasStatus: payment?.status || event } },
        )
      }
    }

    await WebhookEvent.create({
      id,
      event,
      paymentId: payment?.id,
    })

    res.status(200).json({ ok: true })
  } catch (error) {
    if (error?.code === 11000) return res.status(200).json({ ok: true, duplicate: true })
    next(error)
  }
})

app.get('/api/reservations/:code', async (req, res, next) => {
  try {
    const code = String(req.params.code || '').toUpperCase()
    const phoneEnd = String(req.query.phoneEnd || '').replace(/\D/g, '')
    if (phoneEnd.length !== 4) {
      return res.status(400).json({ error: 'Informe os 4 últimos dígitos do telefone.' })
    }

    const reservation = await Reservation.findOne({ id: code }).lean()
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada.' })

    const phone = normalizePhone(reservation.customer?.phone)
    if (phone.slice(-4) !== phoneEnd) {
      return res.status(403).json({ error: 'Telefone não confere.' })
    }

    const contract = reservation.contractId
      ? await Contract.findOne({ id: reservation.contractId }).lean()
      : await Contract.findOne({ reservationId: reservation.id }).lean()

    res.json({ reservation, contract: contract || null })
  } catch (error) {
    next(error)
  }
})

app.get('/api/admin/reservations', requireAdmin, async (_req, res, next) => {
  try {
    res.json(await Reservation.find().sort({ createdAt: -1 }).lean())
  } catch (error) {
    next(error)
  }
})

app.get('/api/admin/contracts', requireAdmin, async (_req, res, next) => {
  try {
    res.json(await Contract.find().sort({ signedAt: -1 }).lean())
  } catch (error) {
    next(error)
  }
})

app.post('/api/visits', async (req, res, next) => {
  try {
    const payload = req.body
    if (!payload?.id || !payload?.name || !payload?.phone) {
      return res.status(400).json({ error: 'Solicitação de visita inválida.' })
    }

    const visit = await Visit.findOneAndUpdate(
      { id: payload.id },
      { $set: payload },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean()

    res.status(201).json(visit)
  } catch (error) {
    next(error)
  }
})

app.get('/api/admin/visits', requireAdmin, async (_req, res, next) => {
  try {
    res.json(await Visit.find().sort({ createdAt: -1 }).lean())
  } catch (error) {
    next(error)
  }
})

app.patch('/api/admin/visits/:id', requireAdmin, async (req, res, next) => {
  try {
    const visit = await Visit.findOneAndUpdate(
      { id: req.params.id },
      { $set: req.body },
      { new: true },
    ).lean()
    if (!visit) return res.status(404).json({ error: 'Visita não encontrada.' })
    res.json(visit)
  } catch (error) {
    next(error)
  }
})

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
})

app.post('/api/admin/images', requireAdmin, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Imagem não enviada.' })
    const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'images' })
    const filename = Date.now() + '-' + req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-')
    const stream = bucket.openUploadStream(filename, {
      contentType: req.file.mimetype,
      metadata: { originalName: req.file.originalname },
    })
    stream.end(req.file.buffer)
    stream.on('finish', () => {
      res.status(201).json({
        id: String(stream.id),
        url: '/api/images/' + stream.id,
      })
    })
    stream.on('error', next)
  } catch (error) {
    next(error)
  }
})

app.get('/api/images/:id', async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).end()
    const id = new ObjectId(req.params.id)
    const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'images' })
    const files = await mongoose.connection.db.collection('images.files').find({ _id: id }).toArray()
    const file = files[0]
    if (!file) return res.status(404).end()
    if (file.contentType) res.setHeader('Content-Type', file.contentType)
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    bucket.openDownloadStream(id).on('error', next).pipe(res)
  } catch (error) {
    next(error)
  }
})

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' })
})

app.use((error, _req, res, _next) => {
  console.error(error)
  if (error?.code === 11000) {
    return res.status(409).json({ error: 'Registro duplicado.' })
  }
  const status = Number(error?.statusCode) || 500
  res.status(status).json({
    error: status >= 500 ? (error?.message || 'Erro interno do servidor.') : error.message,
  })
})

const distDir = path.join(rootDir, 'dist')
app.use(express.static(distDir))
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

async function start() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('MongoDB conectado.')
    app.listen(PORT, '0.0.0.0', () => {
      console.log('EspaçoOn online na porta ' + PORT)
    })
  } catch (error) {
    console.error('Falha ao conectar ao MongoDB:', error)
    process.exit(1)
  }
}

start()
).test(String(value || ''))
}

function secureEqual(a = '', b = '') {
  const aBuffer = Buffer.from(String(a))
  const bBuffer = Buffer.from(String(b))
  if (aBuffer.length !== bBuffer.length) return false
  return crypto.timingSafeEqual(aBuffer, bBuffer)
}

function contractHash(contract) {
  const canonical = [
    contract.id,
    contract.reservationId,
    contract.reservationDateISO || '',
    contract.reservationDate || '',
    contract.period,
    Number(contract.price || 0).toFixed(2),
    contract.customer?.name || '',
    onlyDigits(contract.customer?.cpf),
    onlyDigits(contract.customer?.phone),
    contract.signedAt instanceof Date ? contract.signedAt.toISOString() : String(contract.signedAt || ''),
    contract.signature || '',
  ].join('|')

  return crypto.createHash('sha256').update(canonical).digest('hex').toUpperCase()
}

function validateProductionConfig() {
  const errors = []
  if (!MONGODB_URI) errors.push('MONGODB_URI')
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 10) errors.push('ADMIN_PASSWORD (mínimo 10 caracteres)')
  if (!JWT_SECRET || JWT_SECRET.length < 32) errors.push('JWT_SECRET (mínimo 32 caracteres)')
  if (!ASAAS_API_KEY || !ASAAS_API_KEY.startsWith('$aact_prod_')) errors.push('ASAAS_API_KEY de produção')
  if (ASAAS_ENV !== 'production') errors.push('ASAAS_ENV=production')
  if (!ASAAS_WEBHOOK_TOKEN || ASAAS_WEBHOOK_TOKEN.length < 32) errors.push('ASAAS_WEBHOOK_TOKEN (mínimo 32 caracteres)')

  if (errors.length) {
    throw new Error('Configuração de produção inválida: ' + errors.join(', '))
  }
}

function displayDate(value) {
  const [year, month, day] = String(value || '').split('-')
  return year && month && day ? day + '/' + month + '/' + year : value
}

async function asaasRequest(endpoint, options = {}) {
  if (!ASAAS_API_KEY) {
    const error = new Error('ASAAS_API_KEY não configurada no Render.')
    error.statusCode = 503
    throw error
  }

  const productionKey = ASAAS_API_KEY.startsWith('$aact_prod_')
  const sandboxKey = ASAAS_API_KEY.startsWith('$aact_hmlg_')
  if ((ASAAS_ENV === 'production' && sandboxKey) || (ASAAS_ENV !== 'production' && productionKey)) {
    const error = new Error(
      'ASAAS_ENV e ASAAS_API_KEY pertencem a ambientes diferentes. ' +
      'Use production com chave $aact_prod_ ou sandbox com chave $aact_hmlg_.'
    )
    error.statusCode = 503
    throw error
  }

  const response = await fetch(ASAAS_BASE_URL + endpoint, {
    method: options.method || 'GET',
    headers: {
      accept: 'application/json',
      'User-Agent': 'EspacoOn/1.0 (Node.js; ' + ASAAS_ENV + ')',
      access_token: ASAAS_API_KEY,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const description = data?.errors?.map((item) => item.description).join(' ') ||
      data?.message ||
      'Erro na comunicação com o Asaas.'
    const error = new Error(description)
    error.statusCode = response.status
    error.asaas = data
    throw error
  }

  return data
}

async function getOrCreateAsaasCustomer(customer, reservationId) {
  const cpfCnpj = onlyDigits(customer?.cpf)
  const mobilePhone = onlyDigits(customer?.phone)

  if (!cpfCnpj) {
    const error = new Error('CPF é obrigatório para gerar a cobrança Pix.')
    error.statusCode = 400
    throw error
  }

  if (!isValidCpf(cpfCnpj)) {
    const error = new Error('CPF inválido. Confira o número informado antes de gerar o Pix.')
    error.statusCode = 400
    throw error
  }

  const search = await asaasRequest('/customers?cpfCnpj=' + encodeURIComponent(cpfCnpj) + '&limit=1')
  if (search?.data?.length) return search.data[0]

  return asaasRequest('/customers', {
    method: 'POST',
    body: {
      name: customer?.name,
      cpfCnpj,
      mobilePhone,
      externalReference: reservationId,
      notificationDisabled: true,
    },
  })
}

async function currentSettings() {
  return (await Settings.findOne({ key: 'main' }).lean()) || DEFAULT_SETTINGS
}

function priceForDate(dateISO, period, settings) {
  const [year, month, day] = String(dateISO || '').split('-').map(Number)
  const date = new Date(year, month - 1, day, 12)
  if (Number.isNaN(date.getTime())) {
    const error = new Error('Data da reserva inválida.')
    error.statusCode = 400
    throw error
  }

  const special = (settings.specialDates || []).find((item) =>
    item.date === dateISO ||
    (
      item.date == null &&
      Number(item.day) === day &&
      month === 10 &&
      year === 2026
    )
  )

  if (special) {
    return Number(period === '12h' ? special.price12 : special.price24)
  }

  const weekday = date.getDay()
  if (weekday === 0) return Number(period === '12h' ? settings.prices.sunday12 : settings.prices.sunday24)
  if (weekday === 5 || weekday === 6) return Number(period === '12h' ? settings.prices.weekend12 : settings.prices.weekend24)
  return Number(period === '12h' ? settings.prices.weekday12 : settings.prices.weekday24)
}

async function markPaymentReceived(reservation, payment, eventName = 'PAYMENT_RECEIVED') {
  if (!reservation) return null
  const paidAt = payment?.paymentDate || payment?.clientPaymentDate || new Date()

  const savedReservation = await Reservation.findOneAndUpdate(
    { id: reservation.id },
    {
      $set: {
        paymentStatus: 'paid',
        asaasStatus: payment?.status || 'RECEIVED',
        paidAt,
      },
    },
    { new: true },
  ).lean()

  const savedContract = await Contract.findOneAndUpdate(
    { id: reservation.contractId },
    {
      $set: {
        paymentStatus: 'paid',
        status: 'signed-paid',
        paidAt,
      },
    },
    { new: true },
  ).lean()

  console.log('Asaas:', eventName, reservation.id, payment?.id)
  return { reservation: savedReservation, contract: savedContract }
}


function signAdminToken() {
  return jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '12h' })
}

function requireAdmin(req, res, next) {
  try {
    const token = req.cookies.espacoon_admin
    if (!token) return res.status(401).json({ error: 'Não autenticado.' })
    const payload = jwt.verify(token, JWT_SECRET)
    if (payload.role !== 'admin') return res.status(403).json({ error: 'Acesso negado.' })
    next()
  } catch {
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' })
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    asaas: {
      configured: Boolean(ASAAS_API_KEY),
      environment: ASAAS_ENV,
      keyType: ASAAS_API_KEY?.startsWith('$aact_prod_')
        ? 'production'
        : ASAAS_API_KEY?.startsWith('$aact_hmlg_')
          ? 'sandbox'
          : ASAAS_API_KEY
            ? 'unknown'
            : 'missing',
      webhookTokenConfigured: Boolean(ASAAS_WEBHOOK_TOKEN),
    },
  })
})

app.post('/api/admin/login', (req, res) => {
  const password = String(req.body?.password || '')
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'ADMIN_PASSWORD não configurada no Render.' })
  }
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Senha incorreta.' })
  }

  res.cookie('espacoon_admin', signAdminToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000,
  })
  res.json({ ok: true })
})

app.get('/api/admin/session', requireAdmin, (_req, res) => {
  res.json({ authenticated: true })
})

app.post('/api/admin/logout', (_req, res) => {
  res.clearCookie('espacoon_admin')
  res.json({ ok: true })
})

app.get('/api/settings', async (_req, res, next) => {
  try {
    const settings = await Settings.findOne({ key: 'main' }).lean()
    res.json(settings || DEFAULT_SETTINGS)
  } catch (error) {
    next(error)
  }
})

function displayDateToISO(value) {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null
  return match[3] + '-' + match[2] + '-' + match[1]
}

app.get('/api/availability', async (_req, res, next) => {
  try {
    const [reservations, settings] = await Promise.all([
      Reservation.find(
        { paymentStatus: { $in: ['pending-asaas', 'confirmed-asaas', 'paid', 'approved-simulated'] } },
        { day: 1, date: 1, dateISO: 1, paymentStatus: 1, holdUntil: 1, asaasPaymentId: 1, _id: 0 },
      ).lean(),
      Settings.findOne(
        { key: 'main' },
        { blockedDays: 1, blockedDates: 1, _id: 0 },
      ).lean(),
    ])

    const now = new Date()
    const expiredPending = reservations.filter(
      (item) =>
        item.paymentStatus === 'pending-asaas' &&
        item.holdUntil &&
        new Date(item.holdUntil) <= now,
    )

    for (const item of expiredPending) {
      if (item.asaasPaymentId) {
        try {
          await asaasRequest('/payments/' + item.asaasPaymentId, { method: 'DELETE' })
        } catch (error) {
          console.warn('Não foi possível excluir cobrança Asaas expirada:', item.asaasPaymentId, error.message)
        }
      }

      await Reservation.updateOne(
        { id: item.id },
        {
          $set: {
            paymentStatus: 'expired',
            asaasStatus: 'EXPIRED_LOCAL_HOLD',
          },
        },
      )
    }

    const reservedDates = reservations
      .filter((item) => {
        if (item.paymentStatus !== 'pending-asaas') return true
        return !item.holdUntil || new Date(item.holdUntil) > now
      })
      .map((item) => item.dateISO || displayDateToISO(item.date))
      .filter(Boolean)

    const legacyBlocked = (settings?.blockedDays || []).map(
      (day) => '2026-10-' + String(day).padStart(2, '0'),
    )

    res.json({
      reservedDates,
      blockedDates: [...new Set([...(settings?.blockedDates || []), ...legacyBlocked])],
    })
  } catch (error) {
    next(error)
  }
})

app.put('/api/admin/settings', requireAdmin, async (req, res, next) => {
  try {
    const allowed = ['prices', 'blockedDays', 'blockedDates', 'specialDates', 'rentalHours', 'gallery', 'amenities']
    const update = {}
    for (const key of allowed) {
      if (req.body?.[key] !== undefined) update[key] = req.body[key]
    }
    const settings = await Settings.findOneAndUpdate(
      { key: 'main' },
      { $set: update, $setOnInsert: { key: 'main' } },
      { upsert: true, new: true },
    ).lean()
    res.json(settings)
  } catch (error) {
    next(error)
  }
})

app.post('/api/contracts', async (req, res, next) => {
  try {
    const payload = req.body
    if (!payload?.id || !payload?.reservationId) {
      return res.status(400).json({ error: 'Contrato inválido.' })
    }
    const contract = await Contract.findOneAndUpdate(
      { id: payload.id },
      { $set: payload },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean()
    res.status(201).json(contract)
  } catch (error) {
    next(error)
  }
})

app.post('/api/reservations', async (req, res, next) => {
  try {
    const payload = req.body
    if (!payload?.id || !payload?.customer?.phone || !payload?.date) {
      return res.status(400).json({ error: 'Reserva inválida.' })
    }

    const reservation = await Reservation.findOneAndUpdate(
      { id: payload.id },
      { $set: payload },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean()

    res.status(201).json(reservation)
  } catch (error) {
    next(error)
  }
})

app.post('/api/payments/asaas/pix', async (req, res, next) => {
  try {
    const { reservation, contractId } = req.body || {}
    if (!reservation?.id || !reservation?.dateISO || !reservation?.period || !contractId) {
      return res.status(400).json({ error: 'Dados da cobrança incompletos.' })
    }

    const contract = await Contract.findOne({ id: contractId, reservationId: reservation.id }).lean()
    if (!contract) {
      return res.status(400).json({ error: 'Contrato assinado não encontrado para esta reserva.' })
    }

    const settings = await currentSettings()
    const serverPrice = priceForDate(reservation.dateISO, reservation.period, settings)

    const now = new Date()
    const conflict = await Reservation.findOne({
      dateISO: reservation.dateISO,
      id: { $ne: reservation.id },
      $or: [
        { paymentStatus: { $in: ['confirmed-asaas', 'paid', 'approved-simulated'] } },
        {
          paymentStatus: 'pending-asaas',
          $or: [
            { holdUntil: { $gt: now } },
            { holdUntil: null },
          ],
        },
      ],
    }).lean()

    if (conflict) {
      return res.status(409).json({ error: 'Esta data já possui uma reserva ou pagamento em andamento.' })
    }

    const existing = await Reservation.findOne({ id: reservation.id }).lean()
    if (
      existing?.asaasPaymentId &&
      ['pending-asaas', 'confirmed-asaas'].includes(existing.paymentStatus) &&
      (existing.paymentStatus !== 'pending-asaas' || !existing.holdUntil || new Date(existing.holdUntil) > now)
    ) {
      const qr = await asaasRequest('/payments/' + existing.asaasPaymentId + '/pixQrCode')
      return res.json({
        reservation: existing,
        payment: {
          id: existing.asaasPaymentId,
          status: existing.asaasStatus,
        },
        pix: qr,
      })
    }

    const customer = await getOrCreateAsaasCustomer(reservation.customer, reservation.id)
    const dueDate = new Date().toISOString().slice(0, 10)

    const reconciled = await asaasRequest(
      '/payments?externalReference=' + encodeURIComponent(reservation.id) + '&limit=1'
    )

    const payment = reconciled?.data?.[0] || await asaasRequest('/payments', {
      method: 'POST',
      body: {
        customer: customer.id,
        billingType: 'PIX',
        value: serverPrice,
        dueDate,
        description: 'Reserva EspaçoOn - ' + displayDate(reservation.dateISO) + ' - ' + reservation.period,
        externalReference: reservation.id,
      },
    })

    const pix = await asaasRequest('/payments/' + payment.id + '/pixQrCode')

    const savedReservation = await Reservation.findOneAndUpdate(
      { id: reservation.id },
      {
        $set: {
          ...reservation,
          price: serverPrice,
          contractId,
          paymentStatus: 'pending-asaas',
          asaasCustomerId: customer.id,
          asaasPaymentId: payment.id,
          asaasStatus: payment.status,
          pixExpirationDate: pix.expirationDate,
          holdUntil: new Date(Date.now() + 15 * 60 * 1000),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean()

    await Contract.findOneAndUpdate(
      { id: contractId },
      {
        $set: {
          price: serverPrice,
          paymentStatus: 'pending-asaas',
          status: 'signed-awaiting-payment',
        },
      },
      { new: true },
    )

    res.status(201).json({
      reservation: savedReservation,
      payment: {
        id: payment.id,
        status: payment.status,
      },
      pix,
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/payments/asaas/:reservationId/status', async (req, res, next) => {
  try {
    const reservation = await Reservation.findOne({ id: req.params.reservationId }).lean()
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada.' })
    if (!reservation.asaasPaymentId) {
      return res.status(400).json({ error: 'Esta reserva ainda não possui cobrança Asaas.' })
    }

    if (
      reservation.paymentStatus === 'pending-asaas' &&
      reservation.holdUntil &&
      new Date(reservation.holdUntil) <= new Date()
    ) {
      try {
        await asaasRequest('/payments/' + reservation.asaasPaymentId, { method: 'DELETE' })
      } catch (error) {
        console.warn('Não foi possível excluir cobrança expirada:', error.message)
      }

      const expired = await Reservation.findOneAndUpdate(
        { id: reservation.id },
        { $set: { paymentStatus: 'expired', asaasStatus: 'EXPIRED_LOCAL_HOLD' } },
        { new: true },
      ).lean()

      return res.json({
        paid: false,
        expired: true,
        reservation: expired,
        asaasStatus: 'EXPIRED_LOCAL_HOLD',
      })
    }

    const payment = await asaasRequest('/payments/' + reservation.asaasPaymentId)

    if (payment.status === 'RECEIVED') {
      const result = await markPaymentReceived(reservation, payment, 'STATUS_CHECK')
      return res.json({ paid: true, ...result, asaasStatus: payment.status })
    }

    if (payment.status === 'CONFIRMED') {
      const updated = await Reservation.findOneAndUpdate(
        { id: reservation.id },
        { $set: { paymentStatus: 'confirmed-asaas', asaasStatus: payment.status } },
        { new: true },
      ).lean()

      return res.json({
        paid: false,
        confirmed: true,
        reservation: updated,
        asaasStatus: payment.status,
      })
    }

    const updated = await Reservation.findOneAndUpdate(
      { id: reservation.id },
      { $set: { asaasStatus: payment.status } },
      { new: true },
    ).lean()

    res.json({
      paid: false,
      reservation: updated,
      asaasStatus: payment.status,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/webhooks/asaas', async (req, res, next) => {
  try {
    if (!ASAAS_WEBHOOK_TOKEN) {
      return res.status(503).json({ error: 'ASAAS_WEBHOOK_TOKEN não configurado.' })
    }

    const incomingToken = req.get('asaas-access-token')
    if (incomingToken !== ASAAS_WEBHOOK_TOKEN) {
      return res.status(401).json({ error: 'Webhook não autorizado.' })
    }

    const { id, event, payment } = req.body || {}
    if (!id || !event) return res.status(400).json({ error: 'Evento inválido.' })

    const duplicate = await WebhookEvent.findOne({ id }).lean()
    if (duplicate) return res.status(200).json({ ok: true, duplicate: true })

    const reservation = payment?.externalReference
      ? await Reservation.findOne({ id: payment.externalReference }).lean()
      : payment?.id
        ? await Reservation.findOne({ asaasPaymentId: payment.id }).lean()
        : null

    if (reservation) {
      if (event === 'PAYMENT_RECEIVED' || payment?.status === 'RECEIVED') {
        await markPaymentReceived(reservation, payment, event)
      } else if (event === 'PAYMENT_CONFIRMED') {
        await Reservation.updateOne(
          { id: reservation.id },
          { $set: { paymentStatus: 'confirmed-asaas', asaasStatus: payment?.status || 'CONFIRMED' } },
        )
      } else if (['PAYMENT_REFUNDED', 'PAYMENT_DELETED'].includes(event)) {
        await Reservation.updateOne(
          { id: reservation.id },
          { $set: { paymentStatus: event === 'PAYMENT_REFUNDED' ? 'refunded' : 'cancelled', asaasStatus: payment?.status || event } },
        )
        await Contract.updateOne(
          { id: reservation.contractId },
          { $set: { paymentStatus: event === 'PAYMENT_REFUNDED' ? 'refunded' : 'cancelled' } },
        )
      } else {
        await Reservation.updateOne(
          { id: reservation.id },
          { $set: { asaasStatus: payment?.status || event } },
        )
      }
    }

    await WebhookEvent.create({
      id,
      event,
      paymentId: payment?.id,
    })

    res.status(200).json({ ok: true })
  } catch (error) {
    if (error?.code === 11000) return res.status(200).json({ ok: true, duplicate: true })
    next(error)
  }
})

app.get('/api/reservations/:code', async (req, res, next) => {
  try {
    const code = String(req.params.code || '').toUpperCase()
    const phoneEnd = String(req.query.phoneEnd || '').replace(/\D/g, '')
    if (phoneEnd.length !== 4) {
      return res.status(400).json({ error: 'Informe os 4 últimos dígitos do telefone.' })
    }

    const reservation = await Reservation.findOne({ id: code }).lean()
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada.' })

    const phone = normalizePhone(reservation.customer?.phone)
    if (phone.slice(-4) !== phoneEnd) {
      return res.status(403).json({ error: 'Telefone não confere.' })
    }

    const contract = reservation.contractId
      ? await Contract.findOne({ id: reservation.contractId }).lean()
      : await Contract.findOne({ reservationId: reservation.id }).lean()

    res.json({ reservation, contract: contract || null })
  } catch (error) {
    next(error)
  }
})

app.get('/api/admin/reservations', requireAdmin, async (_req, res, next) => {
  try {
    res.json(await Reservation.find().sort({ createdAt: -1 }).lean())
  } catch (error) {
    next(error)
  }
})

app.get('/api/admin/contracts', requireAdmin, async (_req, res, next) => {
  try {
    res.json(await Contract.find().sort({ signedAt: -1 }).lean())
  } catch (error) {
    next(error)
  }
})

app.post('/api/visits', async (req, res, next) => {
  try {
    const payload = req.body
    if (!payload?.id || !payload?.name || !payload?.phone) {
      return res.status(400).json({ error: 'Solicitação de visita inválida.' })
    }

    const visit = await Visit.findOneAndUpdate(
      { id: payload.id },
      { $set: payload },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean()

    res.status(201).json(visit)
  } catch (error) {
    next(error)
  }
})

app.get('/api/admin/visits', requireAdmin, async (_req, res, next) => {
  try {
    res.json(await Visit.find().sort({ createdAt: -1 }).lean())
  } catch (error) {
    next(error)
  }
})

app.patch('/api/admin/visits/:id', requireAdmin, async (req, res, next) => {
  try {
    const visit = await Visit.findOneAndUpdate(
      { id: req.params.id },
      { $set: req.body },
      { new: true },
    ).lean()
    if (!visit) return res.status(404).json({ error: 'Visita não encontrada.' })
    res.json(visit)
  } catch (error) {
    next(error)
  }
})

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
})

app.post('/api/admin/images', requireAdmin, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Imagem não enviada.' })
    const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'images' })
    const filename = Date.now() + '-' + req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-')
    const stream = bucket.openUploadStream(filename, {
      contentType: req.file.mimetype,
      metadata: { originalName: req.file.originalname },
    })
    stream.end(req.file.buffer)
    stream.on('finish', () => {
      res.status(201).json({
        id: String(stream.id),
        url: '/api/images/' + stream.id,
      })
    })
    stream.on('error', next)
  } catch (error) {
    next(error)
  }
})

app.get('/api/images/:id', async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).end()
    const id = new ObjectId(req.params.id)
    const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'images' })
    const files = await mongoose.connection.db.collection('images.files').find({ _id: id }).toArray()
    const file = files[0]
    if (!file) return res.status(404).end()
    if (file.contentType) res.setHeader('Content-Type', file.contentType)
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    bucket.openDownloadStream(id).on('error', next).pipe(res)
  } catch (error) {
    next(error)
  }
})

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' })
})

app.use((error, _req, res, _next) => {
  console.error(error)
  if (error?.code === 11000) {
    return res.status(409).json({ error: 'Registro duplicado.' })
  }
  const status = Number(error?.statusCode) || 500
  res.status(status).json({
    error: status >= 500 ? (error?.message || 'Erro interno do servidor.') : error.message,
  })
})

const distDir = path.join(rootDir, 'dist')
app.use(express.static(distDir))
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

async function start() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('MongoDB conectado.')
    app.listen(PORT, '0.0.0.0', () => {
      console.log('EspaçoOn online na porta ' + PORT)
    })
  } catch (error) {
    console.error('Falha ao conectar ao MongoDB:', error)
    process.exit(1)
  }
}

start()

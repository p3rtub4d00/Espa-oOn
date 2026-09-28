import express from 'express'
import mongoose from 'mongoose'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import crypto from 'crypto'
import QRCode from 'qrcode'
import webpush from 'web-push'
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
const ASAAS_BASE_URL = 'https://api.asaas.com/v3'

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

const paymentStatusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas verificações de pagamento. Aguarde alguns instantes.' },
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
    pushPaidNotifiedAt: Date,
  },
  { timestamps: true },
)

const contractSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    reservationId: { type: String, required: true, index: true },
    reservationDate: String,
    reservationDateISO: String,
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
    pushVisitNotifiedAt: Date,
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
    whatsapp: {
      ownerName: String,
      ownerPhone: String,
      notifyPaidReservation: { type: Boolean, default: true },
      notifyNewVisit: { type: Boolean, default: true },
    },
    notifications: {
      notifyPaidReservation: { type: Boolean, default: true },
      notifyNewVisit: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
)

const pushConfigSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'main', unique: true },
    publicKey: { type: String, required: true },
    privateKey: { type: String, required: true },
  },
  { timestamps: true },
)

const pushSubscriptionSchema = new mongoose.Schema(
  {
    endpoint: { type: String, required: true, unique: true, index: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: String,
    enabled: { type: Boolean, default: true },
    lastSuccessAt: Date,
    lastErrorAt: Date,
  },
  { timestamps: true },
)

const dateLockSchema = new mongoose.Schema(
  {
    _id: String,
    reservationId: { type: String, required: true, index: true },
    status: { type: String, default: 'pending', index: true },
    expiresAt: Date,
  },
  { timestamps: true },
)

const Reservation = mongoose.model('Reservation', reservationSchema)
const Contract = mongoose.model('Contract', contractSchema)
const Visit = mongoose.model('Visit', visitSchema)
const Settings = mongoose.model('Settings', settingsSchema)
const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema)
const DateLock = mongoose.model('DateLock', dateLockSchema)
const PushConfig = mongoose.model('PushConfig', pushConfigSchema)
const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema)

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
  whatsapp: {
    ownerName: '',
    ownerPhone: '',
    notifyPaidReservation: true,
    notifyNewVisit: true,
  },
  notifications: {
    notifyPaidReservation: true,
    notifyNewVisit: true,
  },
}

async function ensurePushConfig() {
  let config = await PushConfig.findOne({ key: 'main' }).lean()

  if (!config) {
    const keys = webpush.generateVAPIDKeys()
    config = await PushConfig.create({
      key: 'main',
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
    })
    config = config.toObject()
  }

  webpush.setVapidDetails(
    'mailto:admin@espacoon.app',
    config.publicKey,
    config.privateKey,
  )

  return config
}

async function sendPushNotification(payload, endpoint = null) {
  const config = await ensurePushConfig()
  if (!config) return { sent: 0, failed: 0 }

  const query = endpoint
    ? { endpoint, enabled: true }
    : { enabled: true }

  const subscriptions = await PushSubscription.find(query).lean()
  let sent = 0
  let failed = 0

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: subscription.keys,
        },
        JSON.stringify(payload),
      )

      sent += 1
      await PushSubscription.updateOne(
        { endpoint: subscription.endpoint },
        {
          $set: { lastSuccessAt: new Date(), enabled: true },
          $unset: { lastErrorAt: 1 },
        },
      )
    } catch (error) {
      failed += 1
      const statusCode = Number(error?.statusCode)

      if (statusCode === 404 || statusCode === 410) {
        await PushSubscription.deleteOne({ endpoint: subscription.endpoint })
      } else {
        await PushSubscription.updateOne(
          { endpoint: subscription.endpoint },
          { $set: { lastErrorAt: new Date() } },
        )
      }

      console.warn('Falha ao enviar Web Push:', statusCode || error?.message || error)
    }
  }

  return { sent, failed }
}

function onlyDigits(value = '') {
  return String(value).replace(/\D/g, '')
}

function normalizePhone(value = '') {
  return onlyDigits(value)
}

function textValue(value, maxLength = 160) {
  return String(value ?? '').trim().slice(0, maxLength)
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

function isValidPhone(value = '') {
  const digits = onlyDigits(value)
  return digits.length >= 10 && digits.length <= 13
}

function isValidPeriod(value) {
  return value === '12h' || value === '24h'
}

function isValidId(value, prefix) {
  return new RegExp('^' + prefix + '-[A-Z0-9-]{6,40}$').test(String(value || ''))
}

function secureEqual(a = '', b = '') {
  const aBuffer = Buffer.from(String(a))
  const bBuffer = Buffer.from(String(b))
  if (aBuffer.length !== bBuffer.length) return false
  return crypto.timingSafeEqual(aBuffer, bBuffer)
}

function displayDate(value) {
  const [year, month, day] = String(value || '').split('-')
  return year && month && day ? day + '/' + month + '/' + year : value
}

function displayDateToISO(value) {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null
  return match[3] + '-' + match[2] + '-' + match[1]
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
  const warnings = []

  if (!MONGODB_URI) errors.push('MONGODB_URI')
  if (!ADMIN_PASSWORD) errors.push('ADMIN_PASSWORD')
  if (!JWT_SECRET) errors.push('JWT_SECRET')
  if (!ASAAS_API_KEY || !ASAAS_API_KEY.startsWith('$aact_prod_')) errors.push('ASAAS_API_KEY de produção')
  if (ASAAS_ENV !== 'production') errors.push('ASAAS_ENV=production')

  if (ADMIN_PASSWORD && ADMIN_PASSWORD.length < 10) {
    warnings.push('ADMIN_PASSWORD deveria ter pelo menos 10 caracteres')
  }
  if (JWT_SECRET && JWT_SECRET.length < 32) {
    warnings.push('JWT_SECRET deveria ter pelo menos 32 caracteres')
  }
  if (!ASAAS_WEBHOOK_TOKEN) {
    warnings.push('ASAAS_WEBHOOK_TOKEN não configurado; confirmação por webhook ficará indisponível')
  } else if (ASAAS_WEBHOOK_TOKEN.length < 32) {
    warnings.push('ASAAS_WEBHOOK_TOKEN deveria ter pelo menos 32 caracteres')
  }

  if (warnings.length) {
    console.warn('Avisos de configuração:', warnings.join(' | '))
  }

  if (errors.length) {
    throw new Error('Configuração essencial ausente ou inválida: ' + errors.join(', '))
  }
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

async function asaasRequest(endpoint, options = {}) {
  if (!ASAAS_API_KEY) {
    const error = new Error('Serviço de pagamento não configurado.')
    error.statusCode = 503
    throw error
  }

  const productionKey = ASAAS_API_KEY.startsWith('$aact_prod_')
  if (ASAAS_ENV !== 'production' || !productionKey) {
    const error = new Error('Configuração do serviço de pagamento inválida.')
    error.statusCode = 503
    throw error
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)

  try {
    const response = await fetch(ASAAS_BASE_URL + endpoint, {
      method: options.method || 'GET',
      headers: {
        accept: 'application/json',
        'User-Agent': 'EspacoOn/1.0',
        access_token: ASAAS_API_KEY,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      signal: controller.signal,
    })

    const data = await response.json().catch(() => null)
    if (!response.ok) {
      const description = data?.errors?.map((item) => item.description).join(' ') ||
        data?.message ||
        'Erro ao processar a solicitação de pagamento.'
      const error = new Error(description)
      error.statusCode = response.status >= 500 ? 502 : response.status
      throw error
    }

    return data
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('O serviço de pagamento demorou para responder. Tente novamente.')
      timeoutError.statusCode = 504
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function getOrCreateAsaasCustomer(customer, reservationId) {
  const cpfCnpj = onlyDigits(customer?.cpf)
  const mobilePhone = onlyDigits(customer?.phone)

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

function sanitizeSettingsUpdate(body = {}) {
  const update = {}

  if (body.prices !== undefined) {
    const keys = ['weekday12', 'weekday24', 'weekend12', 'weekend24', 'sunday12', 'sunday24']
    const prices = {}
    for (const key of keys) {
      const value = Number(body.prices?.[key])
      if (!Number.isFinite(value) || value <= 0 || value > 100000) {
        const error = new Error('Tabela de preços inválida.')
        error.statusCode = 400
        throw error
      }
      prices[key] = Math.round(value * 100) / 100
    }
    update.prices = prices
  }

  if (body.blockedDates !== undefined) {
    if (!Array.isArray(body.blockedDates) || body.blockedDates.length > 1000) {
      const error = new Error('Lista de datas bloqueadas inválida.')
      error.statusCode = 400
      throw error
    }
    update.blockedDates = [...new Set(
      body.blockedDates
        .map((value) => textValue(value, 10))
        .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)),
    )]
  }

  if (body.specialDates !== undefined) {
    if (!Array.isArray(body.specialDates) || body.specialDates.length > 500) {
      const error = new Error('Lista de datas especiais inválida.')
      error.statusCode = 400
      throw error
    }

    update.specialDates = body.specialDates.map((item) => {
      const date = textValue(item?.date, 10)
      const price12 = Number(item?.price12)
      const price24 = Number(item?.price24)
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(price12) || price12 <= 0 || price12 > 100000 ||
        !Number.isFinite(price24) || price24 <= 0 || price24 > 100000
      ) {
        const error = new Error('Data especial inválida.')
        error.statusCode = 400
        throw error
      }
      return {
        date,
        price12: Math.round(price12 * 100) / 100,
        price24: Math.round(price24 * 100) / 100,
      }
    })
  }

  if (body.rentalHours !== undefined) {
    update.rentalHours = {
      '12h': textValue(body.rentalHours?.['12h'], 80),
      '24h': textValue(body.rentalHours?.['24h'], 80),
    }
    if (!update.rentalHours['12h'] || !update.rentalHours['24h']) {
      const error = new Error('Horários de locação inválidos.')
      error.statusCode = 400
      throw error
    }
  }

  if (body.gallery !== undefined) {
    if (!Array.isArray(body.gallery) || body.gallery.length > 100) {
      const error = new Error('Galeria inválida.')
      error.statusCode = 400
      throw error
    }

    update.gallery = body.gallery.map((item) => textValue(item, 1000)).filter((item) => {
      return /^https:\/\//i.test(item) || /^\/api\/images\/[a-f0-9]{24}$/i.test(item)
    })

    if (update.gallery.length !== body.gallery.length) {
      const error = new Error('A galeria contém uma imagem com endereço inválido.')
      error.statusCode = 400
      throw error
    }
  }

  if (body.amenities !== undefined) {
    if (!Array.isArray(body.amenities) || body.amenities.length > 100) {
      const error = new Error('Lista de estrutura inválida.')
      error.statusCode = 400
      throw error
    }

    const allowedIcons = new Set(['pool', 'game', 'food', 'cold', 'chair', 'sport', 'field'])
    update.amenities = body.amenities.map((item, index) => ({
      id: textValue(item?.id || 'item-' + index, 80),
      name: textValue(item?.name, 80),
      description: textValue(item?.description, 240),
      icon: allowedIcons.has(item?.icon) ? item.icon : 'game',
    }))

    if (update.amenities.some((item) => !item.name)) {
      const error = new Error('A estrutura contém um item sem nome.')
      error.statusCode = 400
      throw error
    }
  }

  return update
}

function priceForDate(dateISO, period, settings) {
  const [year, month, day] = String(dateISO || '').split('-').map(Number)
  const date = new Date(year, month - 1, day, 12)
  if (Number.isNaN(date.getTime())) {
    const error = new Error('Data da reserva inválida.')
    error.statusCode = 400
    throw error
  }

  const special = (settings.specialDates || []).find((item) => item.date === dateISO)
  if (special) {
    return Number(period === '12h' ? special.price12 : special.price24)
  }

  const weekday = date.getDay()
  if (weekday === 0) return Number(period === '12h' ? settings.prices.sunday12 : settings.prices.sunday24)
  if (weekday === 5 || weekday === 6) return Number(period === '12h' ? settings.prices.weekend12 : settings.prices.weekend24)
  return Number(period === '12h' ? settings.prices.weekday12 : settings.prices.weekday24)
}

async function acquireDateLock(dateISO, reservationId) {
  const now = new Date()
  const existing = await DateLock.findById(dateISO).lean()

  if (existing) {
    if (existing.reservationId === reservationId) {
      return { created: false, lock: existing }
    }

    const expired = existing.status === 'pending' && existing.expiresAt && new Date(existing.expiresAt) <= now
    if (expired) {
      const previousReservation = await Reservation.findOne({ id: existing.reservationId }).lean()
      if (previousReservation) {
        const resolution = await resolveExpiredPayment(previousReservation)
        if (!resolution.expired) {
          const error = new Error('Esta data ainda está vinculada a um pagamento em processamento.')
          error.statusCode = 409
          throw error
        }
      } else {
        await DateLock.deleteOne({
          _id: dateISO,
          reservationId: existing.reservationId,
          status: 'pending',
          expiresAt: { $lte: now },
        })
      }
    } else {
      const error = new Error('Esta data já possui uma reserva ou pagamento em andamento.')
      error.statusCode = 409
      throw error
    }
  }

  try {
    const lock = await DateLock.create({
      _id: dateISO,
      reservationId,
      status: 'pending',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    })
    return { created: true, lock: lock.toObject() }
  } catch (error) {
    if (error?.code === 11000) {
      const conflict = new Error('Esta data acabou de ser reservada por outra pessoa.')
      conflict.statusCode = 409
      throw conflict
    }
    throw error
  }
}

async function releasePendingDateLock(dateISO, reservationId) {
  if (!dateISO || !reservationId) return
  await DateLock.deleteOne({
    _id: dateISO,
    reservationId,
    status: 'pending',
  })
}

async function markPaymentReceived(reservation, payment, eventName = 'PAYMENT_RECEIVED') {
  if (!reservation) return null

  if (reservation.paymentStatus === 'paid') {
    const contract = await Contract.findOne({ id: reservation.contractId }).lean()
    return { reservation, contract }
  }

  const currentLock = reservation.dateISO ? await DateLock.findById(reservation.dateISO).lean() : null
  if (currentLock && currentLock.reservationId !== reservation.id) {
    const paidAt = payment?.paymentDate || payment?.clientPaymentDate || new Date()

    const reviewReservation = await Reservation.findOneAndUpdate(
      { id: reservation.id },
      {
        $set: {
          paymentStatus: 'manual-review',
          asaasStatus: payment?.status || 'RECEIVED',
          paidAt,
        },
      },
      { new: true },
    ).lean()

    await Contract.updateOne(
      { id: reservation.contractId },
      { $set: { paymentStatus: 'manual-review', paidAt } },
    )

    console.error('Pagamento recebido para data já ocupada:', reservation.id, reservation.dateISO)
    return { reservation: reviewReservation, contract: null, manualReview: true }
  }

  if (reservation.dateISO) {
    await DateLock.findOneAndUpdate(
      { _id: reservation.dateISO },
      {
        $set: {
          reservationId: reservation.id,
          status: 'paid',
          expiresAt: null,
        },
      },
      { upsert: true, new: true },
    )
  }

  const paidAt = payment?.paymentDate || payment?.clientPaymentDate || new Date()

  const savedReservation = await Reservation.findOneAndUpdate(
    { id: reservation.id },
    {
      $set: {
        paymentStatus: 'paid',
        asaasStatus: payment?.status || 'RECEIVED',
        paidAt,
        holdUntil: null,
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

  if (!savedReservation.pushPaidNotifiedAt) {
    const settings = await currentSettings()
    if (settings.notifications?.notifyPaidReservation !== false) {
      const title = 'Reserva paga'
      const body =
        (savedReservation.customer?.name || 'Cliente') +
        ' • ' +
        (savedReservation.date || displayDate(savedReservation.dateISO)) +
        ' • ' +
        Number(savedReservation.price || 0).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        })

      const result = await sendPushNotification({
        title,
        body,
        url: '/admin',
        tag: 'reservation-' + savedReservation.id,
      })

      if (result.sent > 0) {
        await Reservation.updateOne(
          { id: savedReservation.id, pushPaidNotifiedAt: null },
          { $set: { pushPaidNotifiedAt: new Date() } },
        )
      }
    }
  }

  console.log('Pagamento processado:', eventName, reservation.id, payment?.id)
  return { reservation: savedReservation, contract: savedContract }
}

async function resolveExpiredPayment(reservation) {
  if (!reservation?.dateISO) return { expired: false }

  const expire = async () => {
    const expiredReservation = await Reservation.findOneAndUpdate(
      { id: reservation.id, paymentStatus: 'pending-asaas' },
      {
        $set: {
          paymentStatus: 'expired',
          asaasStatus: 'EXPIRED_LOCAL_HOLD',
          holdUntil: null,
        },
      },
      { new: true },
    ).lean()

    await Contract.updateOne(
      { id: reservation.contractId, paymentStatus: { $ne: 'paid' } },
      { $set: { paymentStatus: 'expired' } },
    )

    await DateLock.deleteOne({
      _id: reservation.dateISO,
      reservationId: reservation.id,
      status: 'pending',
    })

    return { expired: true, reservation: expiredReservation }
  }

  if (!reservation.asaasPaymentId) return expire()

  try {
    await asaasRequest('/payments/' + reservation.asaasPaymentId, { method: 'DELETE' })
    return expire()
  } catch {
    try {
      const payment = await asaasRequest('/payments/' + reservation.asaasPaymentId)

      if (payment.status === 'RECEIVED') {
        const result = await markPaymentReceived(reservation, payment, 'EXPIRATION_CHECK')
        return {
          expired: false,
          paid: !result?.manualReview,
          manualReview: Boolean(result?.manualReview),
          ...result,
        }
      }

      if (payment.status === 'CONFIRMED') {
        await DateLock.updateOne(
          { _id: reservation.dateISO, reservationId: reservation.id },
          { $set: { status: 'confirmed', expiresAt: null } },
        )

        const updated = await Reservation.findOneAndUpdate(
          { id: reservation.id },
          {
            $set: {
              paymentStatus: 'confirmed-asaas',
              asaasStatus: 'CONFIRMED',
              holdUntil: null,
            },
          },
          { new: true },
        ).lean()

        await Contract.updateOne(
          { id: reservation.contractId },
          { $set: { paymentStatus: 'confirmed-asaas' } },
        )

        return { expired: false, confirmed: true, reservation: updated }
      }
    } catch {
      // Mantém a data protegida por mais alguns minutos em caso de indisponibilidade temporária do provedor.
    }

    const extendedUntil = new Date(Date.now() + 5 * 60 * 1000)
    await DateLock.updateOne(
      { _id: reservation.dateISO, reservationId: reservation.id, status: 'pending' },
      { $set: { expiresAt: extendedUntil } },
    )
    await Reservation.updateOne(
      { id: reservation.id, paymentStatus: 'pending-asaas' },
      { $set: { holdUntil: extendedUntil } },
    )

    return { expired: false, retry: true }
  }
}

async function cleanupExpiredLocks() {
  const now = new Date()
  const locks = await DateLock.find({
    status: 'pending',
    expiresAt: { $lte: now },
  }).lean()

  for (const lock of locks) {
    const reservation = await Reservation.findOne({ id: lock.reservationId }).lean()
    if (reservation) {
      await resolveExpiredPayment(reservation)
    } else {
      await DateLock.deleteOne({
        _id: lock._id,
        reservationId: lock.reservationId,
        status: 'pending',
      })
    }
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  })
})

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const password = String(req.body?.password || '')
  if (!secureEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Senha incorreta.' })
  }

  res.cookie('espacoon_admin', signAdminToken(), {
    httpOnly: true,
    sameSite: 'strict',
    secure: true,
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  })

  res.json({ ok: true })
})

app.get('/api/admin/session', requireAdmin, (_req, res) => {
  res.json({ authenticated: true })
})

app.post('/api/admin/logout', (_req, res) => {
  res.clearCookie('espacoon_admin', {
    httpOnly: true,
    sameSite: 'strict',
    secure: true,
    path: '/',
  })
  res.json({ ok: true })
})

app.get('/api/settings', async (_req, res, next) => {
  try {
    const settings = await Settings.findOne({ key: 'main' }).lean()
    const source = settings || DEFAULT_SETTINGS
    const { whatsapp, notifications, ...publicSettings } = source
    res.json(publicSettings)
  } catch (error) {
    next(error)
  }
})

app.get('/api/admin/settings', requireAdmin, async (_req, res, next) => {
  try {
    const settings = await Settings.findOne({ key: 'main' }).lean()
    res.json(settings || DEFAULT_SETTINGS)
  } catch (error) {
    next(error)
  }
})

app.get('/api/availability', async (_req, res, next) => {
  try {
    await cleanupExpiredLocks()

    const [locks, settings] = await Promise.all([
      DateLock.find({}, { _id: 1 }).lean(),
      Settings.findOne(
        { key: 'main' },
        { blockedDays: 1, blockedDates: 1, _id: 0 },
      ).lean(),
    ])

    res.json({
      reservedDates: locks.map((lock) => lock._id),
      blockedDates: settings?.blockedDates || [],
    })
  } catch (error) {
    next(error)
  }
})

app.put('/api/admin/settings', requireAdmin, publicWriteLimiter, async (req, res, next) => {
  try {
    const update = sanitizeSettingsUpdate(req.body)

    if (update.whatsapp !== undefined) {
      update.whatsapp = {
        ownerName: textValue(update.whatsapp?.ownerName, 100),
        ownerPhone: onlyDigits(update.whatsapp?.ownerPhone).slice(0, 13),
        notifyPaidReservation: update.whatsapp?.notifyPaidReservation !== false,
        notifyNewVisit: update.whatsapp?.notifyNewVisit !== false,
      }

      if (update.whatsapp.ownerPhone && !isValidPhone(update.whatsapp.ownerPhone)) {
        return res.status(400).json({ error: 'Número de WhatsApp inválido.' })
      }
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

app.post('/api/contracts', publicWriteLimiter, async (req, res, next) => {
  try {
    const payload = req.body || {}

    if (!isValidId(payload.id, 'CTR') || !isValidId(payload.reservationId, 'ESP')) {
      return res.status(400).json({ error: 'Identificação do contrato inválida.' })
    }

    if (!isValidPeriod(payload.period)) {
      return res.status(400).json({ error: 'Período da reserva inválido.' })
    }

    const reservationDateISO = textValue(payload.reservationDateISO, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reservationDateISO)) {
      return res.status(400).json({ error: 'Data da reserva inválida.' })
    }

    const customer = {
      name: textValue(payload.customer?.name, 120),
      cpf: onlyDigits(payload.customer?.cpf),
      phone: onlyDigits(payload.customer?.phone),
      address: textValue(payload.customer?.address, 240),
    }

    if (customer.name.length < 3 || !isValidCpf(customer.cpf) || !isValidPhone(customer.phone)) {
      return res.status(400).json({ error: 'Dados do locatário inválidos.' })
    }

    const signature = String(payload.signature || '')
    if (!signature.startsWith('data:image/png;base64,') || signature.length > 2_500_000) {
      return res.status(400).json({ error: 'Assinatura eletrônica inválida ou muito grande.' })
    }

    const signedAt = new Date(payload.signedAt)
    if (Number.isNaN(signedAt.getTime())) {
      return res.status(400).json({ error: 'Data da assinatura inválida.' })
    }

    const existing = await Contract.findOne({ id: payload.id }).lean()
    if (existing) return res.status(200).json(existing)

    const settings = await currentSettings()
    const price = priceForDate(reservationDateISO, payload.period, settings)

    const contractRecord = {
      id: payload.id,
      reservationId: payload.reservationId,
      reservationDate: displayDate(reservationDateISO),
      reservationDateISO,
      period: payload.period,
      price,
      customer,
      signedAt,
      signature,
      status: 'signed-awaiting-payment',
      paymentStatus: 'awaiting-payment',
    }

    contractRecord.hash = contractHash(contractRecord)

    const contract = await Contract.create(contractRecord)
    res.status(201).json(contract.toObject())
  } catch (error) {
    next(error)
  }
})

app.post('/api/payments/asaas/pix', paymentLimiter, async (req, res, next) => {
  let lockCreated = false
  let contractDateISO = null
  let reservationId = null

  try {
    const { reservation, contractId } = req.body || {}
    reservationId = textValue(reservation?.id, 60)

    if (!isValidId(reservationId, 'ESP') || !isValidId(contractId, 'CTR')) {
      return res.status(400).json({ error: 'Dados da cobrança incompletos.' })
    }

    const contract = await Contract.findOne({
      id: contractId,
      reservationId,
    }).lean()

    if (!contract) {
      return res.status(400).json({ error: 'Contrato assinado não encontrado para esta reserva.' })
    }

    contractDateISO = contract.reservationDateISO || displayDateToISO(contract.reservationDate)
    if (!contractDateISO || !isValidPeriod(contract.period)) {
      return res.status(400).json({ error: 'O contrato não possui uma data ou período válido.' })
    }

    const serverPrice = Number(contract.price)
    if (!Number.isFinite(serverPrice) || serverPrice <= 0) {
      return res.status(400).json({ error: 'O contrato não possui um valor válido para cobrança.' })
    }

    const lockResult = await acquireDateLock(contractDateISO, reservationId)
    lockCreated = lockResult.created

    const existing = await Reservation.findOne({ id: reservationId }).lean()
    if (
      existing?.asaasPaymentId &&
      ['pending-asaas', 'confirmed-asaas'].includes(existing.paymentStatus)
    ) {
      await DateLock.updateOne(
        { _id: contractDateISO, reservationId },
        {
          $set: {
            status: existing.paymentStatus === 'confirmed-asaas' ? 'confirmed' : 'pending',
            expiresAt: existing.paymentStatus === 'confirmed-asaas' ? null : existing.holdUntil,
          },
        },
      )

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

    const customer = await getOrCreateAsaasCustomer(contract.customer, reservationId)
    const dueDate = new Date().toISOString().slice(0, 10)

    const reconciled = await asaasRequest(
      '/payments?externalReference=' + encodeURIComponent(reservationId) + '&limit=10'
    )

    const reusablePayment = reconciled?.data?.find((item) =>
      ['RECEIVED', 'CONFIRMED', 'PENDING'].includes(item.status)
    )

    const payment = reusablePayment || await asaasRequest('/payments', {
      method: 'POST',
      body: {
        customer: customer.id,
        billingType: 'PIX',
        value: serverPrice,
        dueDate,
        description: 'Reserva EspaçoOn - ' + displayDate(contractDateISO) + ' - ' + contract.period,
        externalReference: reservationId,
      },
    })

    if (payment.status === 'RECEIVED') {
      const preliminaryReservation = await Reservation.findOneAndUpdate(
        { id: reservationId },
        {
          $set: {
            id: reservationId,
            day: Number(contractDateISO.slice(-2)),
            date: contract.reservationDate || displayDate(contractDateISO),
            dateISO: contractDateISO,
            period: contract.period,
            customer: contract.customer,
            price: serverPrice,
            contractId,
            paymentStatus: 'pending-asaas',
            asaasCustomerId: customer.id,
            asaasPaymentId: payment.id,
            asaasStatus: payment.status,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean()

      const received = await markPaymentReceived(preliminaryReservation, payment, 'RECONCILIATION')
      return res.json({
        paid: !received?.manualReview,
        manualReview: Boolean(received?.manualReview),
        ...received,
        asaasStatus: payment.status,
      })
    }

    const pix = await asaasRequest('/payments/' + payment.id + '/pixQrCode')
    const holdUntil = new Date(Date.now() + 15 * 60 * 1000)

    const paymentStatus = payment.status === 'CONFIRMED' ? 'confirmed-asaas' : 'pending-asaas'

    const savedReservation = await Reservation.findOneAndUpdate(
      { id: reservationId },
      {
        $set: {
          id: reservationId,
          day: Number(contractDateISO.slice(-2)),
          date: contract.reservationDate || displayDate(contractDateISO),
          dateISO: contractDateISO,
          period: contract.period,
          customer: contract.customer,
          price: serverPrice,
          contractId,
          paymentStatus,
          asaasCustomerId: customer.id,
          asaasPaymentId: payment.id,
          asaasStatus: payment.status,
          pixExpirationDate: pix.expirationDate,
          holdUntil: paymentStatus === 'pending-asaas' ? holdUntil : null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean()

    await Contract.updateOne(
      { id: contractId },
      {
        $set: {
          price: serverPrice,
          paymentStatus,
          status: 'signed-awaiting-payment',
        },
      },
    )

    await DateLock.updateOne(
      { _id: contractDateISO, reservationId },
      {
        $set: {
          status: paymentStatus === 'confirmed-asaas' ? 'confirmed' : 'pending',
          expiresAt: paymentStatus === 'confirmed-asaas' ? null : holdUntil,
        },
      },
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
    if (lockCreated && contractDateISO && reservationId) {
      await releasePendingDateLock(contractDateISO, reservationId).catch(() => {})
    }
    next(error)
  }
})

app.get('/api/payments/asaas/:reservationId/status', paymentStatusLimiter, async (req, res, next) => {
  try {
    const reservation = await Reservation.findOne({ id: req.params.reservationId }).lean()
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada.' })

    if (reservation.paymentStatus === 'paid') {
      const contract = await Contract.findOne({ id: reservation.contractId }).lean()
      return res.json({
        paid: true,
        reservation,
        contract,
        asaasStatus: reservation.asaasStatus || 'RECEIVED',
      })
    }

    if (reservation.paymentStatus === 'manual-review') {
      return res.json({
        paid: false,
        manualReview: true,
        reservation,
        asaasStatus: reservation.asaasStatus,
      })
    }

    if (!reservation.asaasPaymentId) {
      return res.status(400).json({ error: 'Esta reserva ainda não possui cobrança.' })
    }

    if (
      reservation.paymentStatus === 'pending-asaas' &&
      reservation.holdUntil &&
      new Date(reservation.holdUntil) <= new Date()
    ) {
      const resolution = await resolveExpiredPayment(reservation)

      if (resolution.paid || resolution.manualReview) {
        return res.json({
          paid: Boolean(resolution.paid),
          manualReview: Boolean(resolution.manualReview),
          ...resolution,
          asaasStatus: resolution.reservation?.asaasStatus || reservation.asaasStatus,
        })
      }

      if (resolution.confirmed) {
        return res.json({
          paid: false,
          confirmed: true,
          reservation: resolution.reservation,
          asaasStatus: 'CONFIRMED',
        })
      }

      if (resolution.expired) {
        return res.json({
          paid: false,
          expired: true,
          reservation: resolution.reservation,
          asaasStatus: 'EXPIRED_LOCAL_HOLD',
        })
      }

      return res.json({
        paid: false,
        reservation,
        asaasStatus: reservation.asaasStatus,
      })
    }

    const payment = await asaasRequest('/payments/' + reservation.asaasPaymentId)

    if (payment.status === 'RECEIVED') {
      const result = await markPaymentReceived(reservation, payment, 'STATUS_CHECK')
      return res.json({
        paid: !result?.manualReview,
        manualReview: Boolean(result?.manualReview),
        ...result,
        asaasStatus: payment.status,
      })
    }

    if (payment.status === 'CONFIRMED') {
      await DateLock.updateOne(
        { _id: reservation.dateISO, reservationId: reservation.id },
        { $set: { status: 'confirmed', expiresAt: null } },
      )

      const updated = await Reservation.findOneAndUpdate(
        { id: reservation.id },
        {
          $set: {
            paymentStatus: 'confirmed-asaas',
            asaasStatus: payment.status,
            holdUntil: null,
          },
        },
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
  const eventId = req.body?.id

  try {
    if (!secureEqual(req.get('asaas-access-token'), ASAAS_WEBHOOK_TOKEN)) {
      return res.status(401).json({ error: 'Webhook não autorizado.' })
    }

    const { id, event, payment } = req.body || {}
    if (!id || !event) return res.status(400).json({ error: 'Evento inválido.' })

    const existingEvent = await WebhookEvent.findOne({ id }).lean()
    if (existingEvent?.status === 'processed') {
      return res.status(200).json({ ok: true, duplicate: true })
    }

    if (existingEvent) {
      await WebhookEvent.updateOne(
        { id },
        {
          $set: {
            status: 'processing',
            lastError: null,
            event,
            paymentId: payment?.id,
          },
          $inc: { attempts: 1 },
        },
      )
    } else {
      await WebhookEvent.create({
        id,
        event,
        paymentId: payment?.id,
        status: 'processing',
        attempts: 1,
      })
    }

    const reservation = payment?.externalReference
      ? await Reservation.findOne({ id: payment.externalReference }).lean()
      : payment?.id
        ? await Reservation.findOne({ asaasPaymentId: payment.id }).lean()
        : null

    if (reservation) {
      if (event === 'PAYMENT_RECEIVED' || payment?.status === 'RECEIVED') {
        await markPaymentReceived(reservation, payment, event)
      } else if (event === 'PAYMENT_CONFIRMED') {
        await DateLock.updateOne(
          { _id: reservation.dateISO, reservationId: reservation.id },
          { $set: { status: 'confirmed', expiresAt: null } },
        )

        await Reservation.updateOne(
          { id: reservation.id },
          {
            $set: {
              paymentStatus: 'confirmed-asaas',
              asaasStatus: payment?.status || 'CONFIRMED',
              holdUntil: null,
            },
          },
        )
      } else if (['PAYMENT_REFUNDED', 'PAYMENT_DELETED'].includes(event)) {
        const status = event === 'PAYMENT_REFUNDED' ? 'refunded' : 'cancelled'

        await Reservation.updateOne(
          { id: reservation.id },
          { $set: { paymentStatus: status, asaasStatus: payment?.status || event } },
        )

        await Contract.updateOne(
          { id: reservation.contractId },
          { $set: { paymentStatus: status } },
        )

        if (reservation.dateISO) {
          await DateLock.deleteOne({
            _id: reservation.dateISO,
            reservationId: reservation.id,
          })
        }
      } else {
        await Reservation.updateOne(
          { id: reservation.id },
          { $set: { asaasStatus: payment?.status || event } },
        )
      }
    }

    await WebhookEvent.updateOne(
      { id },
      {
        $set: {
          status: 'processed',
          processedAt: new Date(),
          lastError: null,
        },
      },
    )

    res.status(200).json({ ok: true })
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(200).json({ ok: true, duplicate: true })
    }

    if (eventId) {
      await WebhookEvent.updateOne(
        { id: eventId },
        {
          $set: {
            status: 'failed',
            lastError: String(error?.message || 'Erro no processamento').slice(0, 500),
          },
        },
      ).catch(() => {})
    }

    next(error)
  }
})

app.get('/api/contracts/:id/verify', lookupLimiter, async (req, res, next) => {
  try {
    const id = textValue(req.params.id, 60)
    const hash = textValue(req.query.hash, 128).toUpperCase()

    if (!id || !hash) {
      return res.status(400).json({ error: 'Dados de verificação incompletos.' })
    }

    const contract = await Contract.findOne(
      { id },
      {
        id: 1,
        reservationId: 1,
        reservationDate: 1,
        period: 1,
        signedAt: 1,
        hash: 1,
        status: 1,
        paymentStatus: 1,
        _id: 0,
      },
    ).lean()

    if (!contract || !secureEqual(contract.hash, hash)) {
      return res.status(404).json({
        valid: false,
        error: 'Contrato não localizado ou hash inválido.',
      })
    }

    res.json({
      valid: true,
      contract: {
        id: contract.id,
        reservationId: contract.reservationId,
        reservationDate: contract.reservationDate,
        period: contract.period,
        signedAt: contract.signedAt,
        status: contract.status,
        paymentStatus: contract.paymentStatus,
      },
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/contracts/:id/qr', lookupLimiter, async (req, res, next) => {
  try {
    const id = textValue(req.params.id, 60)
    const hash = textValue(req.query.hash, 128).toUpperCase()
    const contract = await Contract.findOne({ id }, { hash: 1, _id: 0 }).lean()

    if (!contract || !hash || !secureEqual(contract.hash, hash)) {
      return res.status(404).end()
    }

    const verificationUrl =
      req.protocol + '://' + req.get('host') +
      '/api/contracts/' + encodeURIComponent(id) +
      '/verify?hash=' + encodeURIComponent(hash)

    const png = await QRCode.toBuffer(verificationUrl, {
      type: 'png',
      width: 220,
      margin: 1,
      errorCorrectionLevel: 'M',
    })

    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'private, max-age=3600')
    res.send(png)
  } catch (error) {
    next(error)
  }
})

app.get('/api/reservations/:code', lookupLimiter, async (req, res, next) => {
  try {
    const code = textValue(req.params.code, 60).toUpperCase()
    const cpf = onlyDigits(req.query.cpf)

    if (!isValidId(code, 'ESP') || !isValidCpf(cpf)) {
      return res.status(400).json({ error: 'Código da reserva ou CPF inválido.' })
    }

    const reservation = await Reservation.findOne({ id: code }).lean()
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada.' })

    if (!secureEqual(onlyDigits(reservation.customer?.cpf), cpf)) {
      return res.status(403).json({ error: 'CPF não confere com a reserva.' })
    }

    const contract = reservation.contractId
      ? await Contract.findOne({ id: reservation.contractId }).lean()
      : await Contract.findOne({ reservationId: reservation.id }).lean()

    res.json({ reservation, contract: contract || null })
  } catch (error) {
    next(error)
  }
})

app.get('/api/admin/push/status', requireAdmin, async (_req, res, next) => {
  try {
    const config = await ensurePushConfig()
    const count = await PushSubscription.countDocuments({ enabled: true })

    res.json({
      supported: true,
      publicKey: config.publicKey,
      subscriptions: count,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/push/subscribe', requireAdmin, async (req, res, next) => {
  try {
    const subscription = req.body?.subscription
    const endpoint = textValue(subscription?.endpoint, 2000)
    const p256dh = textValue(subscription?.keys?.p256dh, 500)
    const auth = textValue(subscription?.keys?.auth, 500)

    if (!endpoint.startsWith('https://') || !p256dh || !auth) {
      return res.status(400).json({ error: 'Assinatura de notificação inválida.' })
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        $set: {
          endpoint,
          keys: { p256dh, auth },
          userAgent: textValue(req.get('user-agent'), 500),
          enabled: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )

    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/admin/push/subscribe', requireAdmin, async (req, res, next) => {
  try {
    const endpoint = textValue(req.body?.endpoint, 2000)
    if (!endpoint) return res.status(400).json({ error: 'Dispositivo não informado.' })

    await PushSubscription.deleteOne({ endpoint })
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/push/test', requireAdmin, async (req, res, next) => {
  try {
    const endpoint = textValue(req.body?.endpoint, 2000) || null
    const result = await sendPushNotification(
      {
        title: 'EspaçoOn',
        body: 'As notificações estão funcionando neste dispositivo.',
        url: '/admin',
        tag: 'espacoon-test',
      },
      endpoint,
    )

    if (!result.sent) {
      return res.status(404).json({
        error: 'Nenhum dispositivo ativo recebeu a notificação.',
      })
    }

    res.json({ ok: true, ...result })
  } catch (error) {
    next(error)
  }
})

app.get('/api/admin/revenue', requireAdmin, async (req, res, next) => {
  try {
    const month = textValue(req.query.month, 7)
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Mês inválido. Use o formato AAAA-MM.' })
    }

    const reservations = await Reservation.find({
      paymentStatus: 'paid',
      paidAt: { $ne: null },
      $expr: {
        $eq: [
          {
            $dateToString: {
              format: '%Y-%m',
              date: '$paidAt',
              timezone: 'America/Porto_Velho',
            },
          },
          month,
        ],
      },
    })
      .sort({ paidAt: -1 })
      .lean()

    const total = reservations.reduce((sum, item) => sum + Number(item.price || 0), 0)
    const count = reservations.length
    const averageTicket = count ? total / count : 0

    res.json({
      month,
      total,
      count,
      averageTicket,
      reservations,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/reset-data', requireAdmin, loginLimiter, async (req, res, next) => {
  try {
    const password = String(req.body?.password || '')
    const confirmation = textValue(req.body?.confirmation, 80)

    if (!secureEqual(password, ADMIN_PASSWORD)) {
      return res.status(401).json({ error: 'Senha de administrador incorreta.' })
    }

    if (confirmation !== 'APAGAR TODOS OS DADOS') {
      return res.status(400).json({ error: 'Frase de confirmação incorreta.' })
    }

    const processing = await Reservation.findOne({
      paymentStatus: { $in: ['confirmed-asaas', 'manual-review'] },
    }).lean()

    if (processing) {
      return res.status(409).json({
        error: 'Existe pagamento confirmado ou em conferência. Resolva esse pagamento antes de apagar os dados.',
      })
    }

    const pendingPayments = await Reservation.find({
      paymentStatus: 'pending-asaas',
      asaasPaymentId: { $exists: true, $ne: null },
    }).lean()

    for (const reservation of pendingPayments) {
      try {
        await asaasRequest('/payments/' + reservation.asaasPaymentId, { method: 'DELETE' })
      } catch (error) {
        const resetError = new Error(
          'Não foi possível cancelar uma cobrança Pix pendente. O reset foi interrompido para evitar cobrança sem reserva.'
        )
        resetError.statusCode = 409
        throw resetError
      }
    }

    const db = mongoose.connection.db

    await Promise.all([
      Reservation.deleteMany({}),
      Contract.deleteMany({}),
      Visit.deleteMany({}),
      Settings.deleteMany({}),
      WebhookEvent.deleteMany({}),
      DateLock.deleteMany({}),
      db.collection('images.files').deleteMany({}),
      db.collection('images.chunks').deleteMany({}),
    ])

    res.json({
      ok: true,
      message: 'Todos os dados operacionais do site foram apagados.',
    })
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

app.delete('/api/admin/reservations/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = textValue(req.params.id, 60)
    const reservation = await Reservation.findOne({ id }).lean()

    if (!reservation) {
      return res.status(404).json({ error: 'Reserva não encontrada.' })
    }

    if (!['pending-asaas', 'expired', 'cancelled'].includes(reservation.paymentStatus)) {
      return res.status(409).json({
        error: 'Somente reservas pendentes, expiradas ou canceladas podem ser excluídas por esta opção.',
      })
    }

    if (reservation.paymentStatus === 'pending-asaas' && reservation.asaasPaymentId) {
      let providerPayment = null

      try {
        providerPayment = await asaasRequest('/payments/' + reservation.asaasPaymentId)
      } catch (error) {
        if (Number(error?.statusCode) !== 404) {
          const lookupError = new Error(
            'Não foi possível conferir a cobrança no Asaas. A reserva não foi excluída.'
          )
          lookupError.statusCode = 409
          throw lookupError
        }
      }

      if (providerPayment) {
        if (['RECEIVED', 'CONFIRMED'].includes(providerPayment.status)) {
          const protectedError = new Error(
            'Esta cobrança já possui pagamento confirmado e não pode ser excluída como pendente.'
          )
          protectedError.statusCode = 409
          throw protectedError
        }

        try {
          await asaasRequest('/payments/' + reservation.asaasPaymentId, { method: 'DELETE' })
        } catch (error) {
          let stillExists = null
          try {
            stillExists = await asaasRequest('/payments/' + reservation.asaasPaymentId)
          } catch (verifyError) {
            if (Number(verifyError?.statusCode) !== 404) {
              const cancelError = new Error(
                'Não foi possível confirmar o cancelamento da cobrança Pix. A reserva não foi excluída.'
              )
              cancelError.statusCode = 409
              throw cancelError
            }
          }

          if (stillExists) {
            const cancelError = new Error(
              'A cobrança ainda está ativa no Asaas. A reserva não foi excluída.'
            )
            cancelError.statusCode = 409
            throw cancelError
          }
        }
      }
    }

    await Promise.all([
      Reservation.deleteOne({ id }),
      reservation.contractId
        ? Contract.deleteOne({ id: reservation.contractId })
        : Contract.deleteMany({ reservationId: id }),
      DateLock.deleteOne({ reservationId: id }),
    ])

    res.json({ ok: true, id })
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

app.post('/api/visits', publicWriteLimiter, async (req, res, next) => {
  try {
    const payload = req.body || {}
    const visitData = {
      id: textValue(payload.id, 40),
      name: textValue(payload.name, 120),
      phone: onlyDigits(payload.phone),
      requestedDate: textValue(payload.requestedDate || payload.date, 10),
      requestedTime: textValue(payload.requestedTime || payload.time, 5),
      status: 'pending-owner-confirmation',
    }

    if (
      !visitData.id ||
      visitData.name.length < 3 ||
      !isValidPhone(visitData.phone) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(visitData.requestedDate)
    ) {
      return res.status(400).json({ error: 'Solicitação de visita inválida.' })
    }

    const existingVisit = await Visit.findOne({ id: visitData.id }).lean()

    const visit = await Visit.findOneAndUpdate(
      { id: visitData.id },
      { $setOnInsert: visitData },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean()

    if (!existingVisit && !visit.pushVisitNotifiedAt) {
      const settings = await currentSettings()

      if (settings.notifications?.notifyNewVisit !== false) {
        const formattedDate = displayDate(visit.requestedDate)
        const body =
          (visit.name || 'Cliente') +
          ' solicitou visita em ' +
          formattedDate +
          (visit.requestedTime ? ' às ' + visit.requestedTime : '')

        const result = await sendPushNotification({
          title: 'Nova solicitação de visita',
          body,
          url: '/admin',
          tag: 'visit-' + visit.id,
        })

        if (result.sent > 0) {
          await Visit.updateOne(
            { id: visit.id, pushVisitNotifiedAt: null },
            { $set: { pushVisitNotifiedAt: new Date() } },
          )
        }
      }
    }

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
    const allowed = ['confirmedDate', 'confirmedTime', 'ownerMessage', 'status', 'respondedAt']
    const update = {}

    for (const key of allowed) {
      if (req.body?.[key] !== undefined) update[key] = req.body[key]
    }

    if (update.ownerMessage !== undefined) update.ownerMessage = textValue(update.ownerMessage, 300)
    if (update.status !== undefined) {
      const allowedStatus = new Set([
        'pending-owner-confirmation',
        'counter-proposed',
        'confirmed',
        'rejected',
      ])
      if (!allowedStatus.has(update.status)) {
        return res.status(400).json({ error: 'Status de visita inválido.' })
      }
    }

    const visit = await Visit.findOneAndUpdate(
      { id: req.params.id },
      { $set: update },
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
  fileFilter: (_req, file, callback) => {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp'])
    if (!allowed.has(file.mimetype)) {
      const error = new Error('Formato de imagem não permitido. Use JPG, PNG ou WebP.')
      error.statusCode = 400
      return callback(error)
    }
    callback(null, true)
  },
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

app.delete('/api/admin/images/:id', requireAdmin, async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Imagem inválida.' })
    }

    const id = new ObjectId(req.params.id)
    const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'images' })
    await bucket.delete(id)
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

app.get('/api/images/:id', async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).end()

    const id = new ObjectId(req.params.id)
    const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'images' })
    const files = await mongoose.connection.db
      .collection('images.files')
      .find({ _id: id })
      .toArray()

    const file = files[0]
    if (!file) return res.status(404).end()

    if (file.contentType) res.setHeader('Content-Type', file.contentType)
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')

    bucket.openDownloadStream(id).on('error', next).pipe(res)
  } catch (error) {
    next(error)
  }
})

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' })
})

app.use((error, _req, res, _next) => {
  console.error(error)

  if (error?.code === 11000) {
    return res.status(409).json({ error: 'Registro duplicado.' })
  }

  const status = Number(error?.statusCode) || 500
  res.status(status).json({
    error: status >= 500 ? 'Erro interno do servidor.' : error.message,
  })
})

const distDir = path.join(rootDir, 'dist')
app.use(express.static(distDir, {
  maxAge: '1h',
  etag: true,
}))

app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

async function migrateProductionData() {
  await Promise.all([
    Reservation.updateMany(
      { paymentStatus: 'approved-simulated' },
      { $set: { paymentStatus: 'paid' } },
    ),
    Contract.updateMany(
      { paymentStatus: 'approved-simulated' },
      { $set: { paymentStatus: 'paid', status: 'signed-paid' } },
    ),
    Contract.updateMany(
      { status: 'signed-paid-demo' },
      { $set: { status: 'signed-paid' } },
    ),
    Contract.updateMany(
      { status: 'signed-awaiting-payment-demo' },
      { $set: { status: 'signed-awaiting-payment' } },
    ),
  ])

  const settings = await Settings.findOne({ key: 'main' }).lean()
  if (settings) {
    const migratedBlockedDates = new Set(settings.blockedDates || [])
    for (const day of settings.blockedDays || []) {
      migratedBlockedDates.add('2026-10-' + String(day).padStart(2, '0'))
    }

    const migratedSpecialDates = (settings.specialDates || []).map((item) => {
      if (item.date || item.day == null) return item
      return {
        ...item,
        date: '2026-10-' + String(item.day).padStart(2, '0'),
      }
    })

    await Settings.updateOne(
      { key: 'main' },
      {
        $set: {
          blockedDates: [...migratedBlockedDates],
          blockedDays: [],
          specialDates: migratedSpecialDates,
        },
      },
    )
  }

  const contracts = await Contract.find({
    signature: { $exists: true, $ne: '' },
  }).lean()

  for (const contract of contracts) {
    const reservationDateISO =
      contract.reservationDateISO || displayDateToISO(contract.reservationDate)

    const normalized = {
      ...contract,
      reservationDateISO: reservationDateISO || '',
    }

    await Contract.updateOne(
      { id: contract.id },
      {
        $set: {
          reservationDateISO: reservationDateISO || contract.reservationDateISO,
          hash: contractHash(normalized),
        },
      },
    )
  }

  const activeReservations = await Reservation.find({
    paymentStatus: { $in: ['pending-asaas', 'confirmed-asaas', 'paid'] },
    dateISO: { $exists: true, $ne: null },
  }).lean()

  for (const reservation of activeReservations) {
    const existing = await DateLock.findById(reservation.dateISO).lean()
    if (existing && existing.reservationId !== reservation.id) {
      console.error('Conflito de data detectado na migração:', reservation.dateISO)
      continue
    }

    const status = reservation.paymentStatus === 'paid'
      ? 'paid'
      : reservation.paymentStatus === 'confirmed-asaas'
        ? 'confirmed'
        : 'pending'

    await DateLock.findOneAndUpdate(
      { _id: reservation.dateISO },
      {
        $set: {
          reservationId: reservation.id,
          status,
          expiresAt: status === 'pending' ? reservation.holdUntil : null,
        },
      },
      { upsert: true },
    )
  }
}

async function start() {
  try {
    validateProductionConfig()
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      maxPoolSize: 10,
    })
    await migrateProductionData()

    console.log('Banco de dados conectado.')
    app.listen(PORT, '0.0.0.0', () => {
      console.log('EspaçoOn em produção na porta ' + PORT)
    })
  } catch (error) {
    console.error('Falha ao iniciar o EspaçoOn:', error?.message || error)
    process.exit(1)
  }
}

async function shutdown(signal) {
  console.log(signal + ' recebido. Encerrando conexões...')
  try {
    await mongoose.connection.close()
  } finally {
    process.exit(0)
  }
}

process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGINT', () => shutdown('SIGINT'))

start()

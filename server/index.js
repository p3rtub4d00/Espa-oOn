import { lookupDemoLocation, demoVisitorIp } from './demo-location.js'
import { deliverPushBatch } from './push-delivery.js'
import { isBookingCpfValid } from '../shared/booking-demo.js'
import { CLEANING_CLAUSE_TEXT } from '../shared/contract-terms.js'
import { buildPrivacyPolicy, sanitizePrivacyConfig } from './privacy.js'
import { bindDeploymentDatabase } from './deployment-identity.js'
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
const JWT_SECRET = process.env.JWT_SECRET
const ASAAS_API_KEY = process.env.ASAAS_API_KEY
const ASAAS_ENV = String(process.env.ASAAS_ENV || 'production').toLowerCase()
const ASAAS_WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN
const ASAAS_BASE_URL = 'https://api.asaas.com/v3'
const MASTER_API_URL = String(process.env.MASTER_API_URL || '').replace(/\/$/, '')
const MASTER_CLUB_ID = String(process.env.MASTER_CLUB_ID || '').trim()
const MASTER_LICENSE_KEY = String(process.env.MASTER_LICENSE_KEY || '').trim()

const BACKUP_MONGODB_URI = String(process.env.BACKUP_MONGODB_URI || '').trim()
const BACKUP_RETENTION_DAYS = Math.max(3, Math.min(90, Number(process.env.BACKUP_RETENTION_DAYS || 14)))
const BACKUP_INTERVAL_HOURS = Math.max(6, Math.min(168, Number(process.env.BACKUP_INTERVAL_HOURS || 24)))
const BACKUP_SOURCE_ID = String(MASTER_CLUB_ID || process.env.BACKUP_SOURCE_ID || 'club-standalone').trim()
const MASTER_LICENSE_CONFIGURED = Boolean(MASTER_API_URL && MASTER_CLUB_ID && MASTER_LICENSE_KEY)
const MASTER_LICENSE_CACHE_MS = 5 * 60 * 1000

app.set('trust proxy', 1)

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://sdk.mercadopago.com', 'https://www.mercadopago.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'https://api.mercadopago.com', 'https://*.mercadopago.com'],
      frameSrc: ["'self'", 'https://*.mercadopago.com', 'https://*.mercadopago.com.br'],
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
    startTime: String,
    endTime: String,
    endDateISO: String,
    basePrice: Number,
    extrasTotal: Number,
    extras: [mongoose.Schema.Types.Mixed],
    price: Number,
    customer: {
      name: String,
      cpf: String,
      phone: String,
      email: String,
      address: String,
    },
    paymentStatus: { type: String, default: 'awaiting-payment', index: true },
    contractId: String,
    asaasCustomerId: String,
    asaasPaymentId: { type: String, index: true },
    asaasStatus: String,
    paymentProvider: {
      type: String,
      enum: ['asaas', 'mercadopago', 'demo', 'manual'],
      default: 'asaas',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['pix', 'card', 'demo', 'cash', 'transfer', 'other'],
      default: 'pix',
    },
    source: {
      type: String,
      enum: ['online', 'manual'],
      default: 'online',
      index: true,
    },
    amountPaid: { type: Number, default: 0 },
    manualNote: String,
    manualBlockDate: Boolean,
    providerCustomerId: String,
    providerPaymentId: { type: String, index: true },
    providerCheckoutUrl: String,
    providerStatus: String,
    pixExpirationDate: String,
    holdUntil: Date,
    paidAt: Date,
    pushPaidNotifiedAt: Date,
    pushDayBeforeReminderAt: Date,
    pushSameDayReminderAt: Date,
    reservationStatus: { type: String, default: 'active', index: true },
    cancellation: mongoose.Schema.Types.Mixed,
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
    startTime: String,
    endTime: String,
    endDateISO: String,
    basePrice: Number,
    extrasTotal: Number,
    extras: [mongoose.Schema.Types.Mixed],
    price: Number,
    customer: {
      name: String,
      cpf: String,
      phone: String,
      email: String,
      address: String,
    },
    signedAt: Date,
    signature: String,
    hash: String,
    status: { type: String, default: 'signed-awaiting-payment' },
    paymentStatus: { type: String, default: 'awaiting-payment' },
    paidAt: Date,
    cancellationPolicyText: String,
    cleaningClauseText: String,
    establishmentName: String,
    cancellation: mongoose.Schema.Types.Mixed,
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
    rentalStartTimes: mongoose.Schema.Types.Mixed,
    gallery: [String],
    amenities: [mongoose.Schema.Types.Mixed],
    extras: [mongoose.Schema.Types.Mixed],
    notifications: {
      notifyPaidReservation: { type: Boolean, default: true },
      notifyNewVisit: { type: Boolean, default: true },
      notifyReservationDayBefore: { type: Boolean, default: true },
      notifyReservationSameDay: { type: Boolean, default: true },
      reservationDayBeforeTime: { type: String, default: '18:00' },
      reservationSameDayTime: { type: String, default: '07:00' },
    },
    cancellationPolicy: {
      text: String,
    },
    privacy: { controllerName: String, contactEmail: String, contactPhone: String },
    establishment: {
      name: String,
      ownerName: String,
      phone: String,
      address: String,
      city: String,
      state: String,
      locationNote: String,
      openingHours: String,
    },
    branding: {
      logoUrl: String,
      primaryColor: String,
      secondaryColor: String,
      accentColor: String,
    },
    onboarding: {
      establishmentConfigured: { type: Boolean, default: false },
      pricesConfigured: { type: Boolean, default: false },
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

const DeploymentIdentity = mongoose.model('DeploymentIdentity', new mongoose.Schema({
  _id: { type: String, default: 'main' },
  clubId: { type: String, required: true },
}, { timestamps: true }))

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
  rentalStartTimes: {
    '12h': ['08:00'],
    '24h': ['08:00'],
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
  extras: [],
  notifications: {
    notifyPaidReservation: true,
    notifyNewVisit: true,
    notifyReservationDayBefore: true,
    notifyReservationSameDay: true,
    reservationDayBeforeTime: '18:00',
    reservationSameDayTime: '07:00',
  },
  cancellationPolicy: {
    text: 'Cancelamentos devem ser solicitados ao proprietário. A existência e o valor de eventual reembolso dependem da antecedência, das condições da reserva e da política informada pelo estabelecimento. Todo cancelamento e eventual valor devolvido serão registrados no sistema.',
  },
  establishment: {
    name: 'ClubeOn',
    ownerName: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    locationNote: '',
    openingHours: '',
  },
  branding: {
    logoUrl: '',
    primaryColor: '#1f2937',
    secondaryColor: '#1769ff',
    accentColor: '#76d900',
  },
  onboarding: {
    establishmentConfigured: false,
    pricesConfigured: false,
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
  const startedAt = Date.now()
  const result = await deliverPushBatch(subscriptions, payload, {
    send: (subscription, message, options) => webpush.sendNotification(subscription, message, options),
    onSuccess: (subscription) => PushSubscription.updateOne(
      { endpoint: subscription.endpoint },
      { $set: { lastSuccessAt: new Date(), enabled: true }, $unset: { lastErrorAt: 1 } },
    ),
    onFailure: async (subscription, error) => {
      const statusCode = Number(error?.statusCode)
      if (statusCode === 404 || statusCode === 410) {
        await PushSubscription.deleteOne({ endpoint: subscription.endpoint })
      } else {
        await PushSubscription.updateOne(
          { endpoint: subscription.endpoint },
          { $set: { lastErrorAt: new Date() } },
        )
      }
      console.warn('Falha ao enviar Web Push:', statusCode || 'erro de conexão')
    },
    onTrackingError: () => console.warn('Falha ao registrar resultado do Web Push.'),
  })
  // Provider acceptance timing, not confirmation of display on the device. No personal data.
  console.log('Web Push processado:', { ...result, durationMs: Date.now() - startedAt })
  return result
}

async function notifyPaidReservationPush(reservation, title = 'Nova reserva confirmada') {
  if (!reservation || reservation.pushPaidNotifiedAt) return { sent: 0, failed: 0 }

  const settings = await currentSettings()
  if (settings.notifications?.notifyPaidReservation === false) {
    return { sent: 0, failed: 0 }
  }

  const result = await sendPushNotification({
    title,
    body:
      (reservation.customer?.name || 'Cliente') +
      ' • ' +
      (reservation.date || displayDate(reservation.dateISO)) +
      (reservation.startTime ? ' às ' + reservation.startTime : '') +
      ' • ' +
      Number(reservation.price || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }),
    url: '/admin',
    tag: 'reservation-' + reservation.id,
  })

  if (result.sent > 0) {
    await Reservation.updateOne(
      { id: reservation.id, pushPaidNotifiedAt: null },
      { $set: { pushPaidNotifiedAt: new Date() } },
    )
  }

  return result
}

function portoVelhoNowParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Porto_Velho',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })

  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return {
    dateISO: parts.year + '-' + parts.month + '-' + parts.day,
    time: parts.hour + ':' + parts.minute,
  }
}

function addDaysISO(dateISO, days) {
  const date = new Date(String(dateISO) + 'T12:00:00Z')
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

let reminderRunActive = false

async function processReservationReminders() {
  if (reminderRunActive || mongoose.connection.readyState !== 1) return
  reminderRunActive = true

  try {
    const settings = await currentSettings()
    const notifications = {
      ...DEFAULT_SETTINGS.notifications,
      ...(settings.notifications || {}),
    }

    const now = portoVelhoNowParts()
    const tomorrowISO = addDaysISO(now.dateISO, 1)

    if (
      notifications.notifyReservationDayBefore !== false &&
      now.time >= notifications.reservationDayBeforeTime
    ) {
      const reservations = await Reservation.find({
        paymentStatus: 'paid',
        reservationStatus: { $ne: 'cancelled' },
        dateISO: tomorrowISO,
        pushDayBeforeReminderAt: null,
      }).lean()

      for (const reservation of reservations) {
        const result = await sendPushNotification({
          title: 'Reserva amanhã',
          body:
            (reservation.customer?.name || 'Cliente') +
            ' • ' +
            displayDate(reservation.dateISO) +
            (reservation.startTime ? ' às ' + reservation.startTime : '') +
            ' • ' +
            (reservation.period || ''),
          url: '/admin',
          tag: 'reservation-day-before-' + reservation.id,
        })

        if (result.sent > 0) {
          await Reservation.updateOne(
            { id: reservation.id, pushDayBeforeReminderAt: null },
            { $set: { pushDayBeforeReminderAt: new Date() } },
          )
        }
      }
    }

    if (
      notifications.notifyReservationSameDay !== false &&
      now.time >= notifications.reservationSameDayTime
    ) {
      const reservations = await Reservation.find({
        paymentStatus: 'paid',
        reservationStatus: { $ne: 'cancelled' },
        dateISO: now.dateISO,
        pushSameDayReminderAt: null,
      }).lean()

      for (const reservation of reservations) {
        const result = await sendPushNotification({
          title: 'Reserva hoje',
          body:
            (reservation.customer?.name || 'Cliente') +
            ' • ' +
            (reservation.period || '') +
            (reservation.startTime
              ? ' • ' + reservation.startTime + ' às ' + (reservation.endTime || '')
              : settings.rentalHours?.[reservation.period]
                ? ' • ' + settings.rentalHours[reservation.period]
                : ''),
          url: '/admin',
          tag: 'reservation-same-day-' + reservation.id,
        })

        if (result.sent > 0) {
          await Reservation.updateOne(
            { id: reservation.id, pushSameDayReminderAt: null },
            { $set: { pushSameDayReminderAt: new Date() } },
          )
        }
      }
    }
  } catch (error) {
    console.warn('Falha ao processar lembretes de reservas:', error?.message || error)
  } finally {
    reminderRunActive = false
  }
}

let reservationReminderTimer = null

function startReservationReminderScheduler() {
  if (reservationReminderTimer) return

  setTimeout(() => {
    processReservationReminders().catch(() => {})
  }, 15000)

  reservationReminderTimer = setInterval(() => {
    processReservationReminders().catch(() => {})
  }, 15 * 60 * 1000)
}

let backupConnection = null
let backupTimer = null
let backupState = {
  configured: Boolean(BACKUP_MONGODB_URI),
  running: false,
  lastStartedAt: null,
  lastCompletedAt: null,
  lastSnapshotId: null,
  lastError: null,
}

async function ensureBackupConnection() {
  if (!BACKUP_MONGODB_URI) return null
  if (BACKUP_MONGODB_URI === String(MONGODB_URI || '').trim()) {
    throw new Error('BACKUP_MONGODB_URI deve apontar para um banco diferente do banco principal.')
  }
  if (backupConnection?.readyState === 1) return backupConnection

  if (backupConnection) {
    await backupConnection.close().catch(() => {})
  }

  backupConnection = mongoose.createConnection(BACKUP_MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    maxPoolSize: 3,
  })
  await backupConnection.asPromise()
  return backupConnection
}

function backupSnapshotId() {
  return [
    BACKUP_SOURCE_ID.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60),
    new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14),
    crypto.randomBytes(3).toString('hex'),
  ].join('-')
}

async function latestBackupSnapshot() {
  const connection = await ensureBackupConnection()
  if (!connection) return null

  return connection.db
    .collection('clubeon_backup_snapshots')
    .find({ sourceId: BACKUP_SOURCE_ID, status: 'completed' })
    .sort({ completedAt: -1 })
    .limit(1)
    .next()
}

async function cleanupExpiredBackups() {
  const connection = await ensureBackupConnection()
  if (!connection) return

  const cutoff = new Date(Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const expired = await connection.db
    .collection('clubeon_backup_snapshots')
    .find({
      sourceId: BACKUP_SOURCE_ID,
      completedAt: { $lt: cutoff },
    })
    .project({ snapshotId: 1 })
    .toArray()

  const snapshotIds = expired.map((item) => item.snapshotId).filter(Boolean)
  if (!snapshotIds.length) return

  await Promise.all([
    connection.db.collection('clubeon_backup_documents').deleteMany({
      sourceId: BACKUP_SOURCE_ID,
      snapshotId: { $in: snapshotIds },
    }),
    connection.db.collection('clubeon_backup_snapshots').deleteMany({
      sourceId: BACKUP_SOURCE_ID,
      snapshotId: { $in: snapshotIds },
    }),
  ])
}

async function runDatabaseBackup({ force = false, reason = 'scheduled' } = {}) {
  if (!BACKUP_MONGODB_URI) return { configured: false, skipped: true }
  if (backupState.running) return { configured: true, skipped: true, reason: 'already-running' }

  const connection = await ensureBackupConnection()
  const latest = await latestBackupSnapshot()
  const minAgeMs = BACKUP_INTERVAL_HOURS * 60 * 60 * 1000

  if (
    !force &&
    latest?.completedAt &&
    Date.now() - new Date(latest.completedAt).getTime() < minAgeMs
  ) {
    backupState.lastCompletedAt = latest.completedAt
    backupState.lastSnapshotId = latest.snapshotId || null
    backupState.lastError = null
    return { configured: true, skipped: true, reason: 'recent-backup', snapshotId: latest.snapshotId }
  }

  const snapshotId = backupSnapshotId()
  const startedAt = new Date()
  backupState = {
    ...backupState,
    configured: true,
    running: true,
    lastStartedAt: startedAt,
    lastError: null,
  }

  const snapshotCollection = connection.db.collection('clubeon_backup_snapshots')
  const documentCollection = connection.db.collection('clubeon_backup_documents')

  await snapshotCollection.insertOne({
    snapshotId,
    sourceId: BACKUP_SOURCE_ID,
    reason,
    status: 'running',
    startedAt,
    collections: [],
  })

  try {
    const collections = await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray()
    const summary = []

    for (const { name } of collections) {
      if (!name || name.startsWith('system.')) continue

      const cursor = mongoose.connection.db.collection(name).find({})
      let count = 0
      let batch = []

      for await (const document of cursor) {
        batch.push({
          sourceId: BACKUP_SOURCE_ID,
          snapshotId,
          collection: name,
          document,
        })
        count += 1

        if (batch.length >= 250) {
          await documentCollection.insertMany(batch, { ordered: false })
          batch = []
        }
      }

      if (batch.length) {
        await documentCollection.insertMany(batch, { ordered: false })
      }

      const indexes = await mongoose.connection.db.collection(name).indexes().catch(() => [])
      summary.push({
        name,
        count,
        indexes: indexes.map(({ v, ns, ...index }) => index),
      })
    }

    const completedAt = new Date()
    await snapshotCollection.updateOne(
      { snapshotId, sourceId: BACKUP_SOURCE_ID },
      {
        $set: {
          status: 'completed',
          completedAt,
          collections: summary,
        },
      },
    )

    backupState = {
      ...backupState,
      running: false,
      lastCompletedAt: completedAt,
      lastSnapshotId: snapshotId,
      lastError: null,
    }

    await cleanupExpiredBackups()
    console.log('Backup MongoDB concluído:', snapshotId)
    return { configured: true, snapshotId, completedAt, collections: summary }
  } catch (error) {
    const failedAt = new Date()
    backupState = {
      ...backupState,
      running: false,
      lastError: String(error?.message || error),
    }

    await snapshotCollection.updateOne(
      { snapshotId, sourceId: BACKUP_SOURCE_ID },
      {
        $set: {
          status: 'failed',
          failedAt,
          error: String(error?.message || error).slice(0, 500),
        },
      },
    ).catch(() => {})

    throw error
  }
}

function startDatabaseBackupScheduler() {
  if (!BACKUP_MONGODB_URI || backupTimer) return

  const run = () => {
    runDatabaseBackup({ reason: 'automatic' }).catch((error) => {
      console.error('Falha no backup automático do MongoDB:', error?.message || error)
    })
  }

  setTimeout(run, 30_000)
  backupTimer = setInterval(run, Math.max(60 * 60 * 1000, BACKUP_INTERVAL_HOURS * 60 * 60 * 1000))
}

let masterLicenseCache = {
  checkedAt: 0,
  active: true,
  configured: MASTER_LICENSE_CONFIGURED,
  status: MASTER_LICENSE_CONFIGURED ? 'unknown' : 'standalone',
  billingStatus: MASTER_LICENSE_CONFIGURED ? 'unknown' : 'standalone',
  nextDueDate: null,
  temporaryUnlockUntil: null,
  unavailable: false,
  demoMode: false,
  paymentProvider: 'asaas',
  mercadoPagoConnected: false,
}

async function checkMasterLicense({ force = false } = {}) {
  if (!MASTER_LICENSE_CONFIGURED) {
    return {
      active: true,
      configured: false,
      status: 'standalone',
      billingStatus: 'standalone',
      unavailable: false,
      demoMode: false,
      paymentProvider: 'asaas',
      mercadoPagoConnected: false,
    }
  }

  const now = Date.now()
  if (!force && masterLicenseCache.checkedAt && now - masterLicenseCache.checkedAt < MASTER_LICENSE_CACHE_MS) {
    return masterLicenseCache
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)

  try {
    const setupHeaders = {}
    if (mongoose.connection.readyState === 1) {
      const settings = await currentSettings()
      setupHeaders['x-club-setup'] = Buffer.from(JSON.stringify({
        establishmentConfigured: settings.onboarding?.establishmentConfigured === true,
        pricesConfigured: settings.onboarding?.pricesConfigured === true,
        asaasConfigured: Boolean(ASAAS_API_KEY?.startsWith('$aact_prod_') && ASAAS_WEBHOOK_TOKEN),
        privacyConfigured: buildPrivacyPolicy({ config: settings.privacy, establishment: settings.establishment }).configured,
      })).toString('base64url')
    }
    const response = await fetch(MASTER_API_URL + '/api/license/status', {
      method: 'GET',
      headers: {
        'x-club-id': MASTER_CLUB_ID,
        'x-license-key': MASTER_LICENSE_KEY,
        'user-agent': 'EspacoOn-License-Agent/1.0',
        ...setupHeaders,
      },
      signal: controller.signal,
    })

    const data = await response.json().catch(() => ({}))

    if (response.status === 401 || response.status === 403) {
      masterLicenseCache = {
        checkedAt: now,
        active: false,
        configured: true,
        status: 'invalid_license',
        billingStatus: 'unknown',
        nextDueDate: null,
        temporaryUnlockUntil: null,
        unavailable: false,
        demoMode: false,
        paymentProvider: 'asaas',
        mercadoPagoConnected: false,
      }
      return masterLicenseCache
    }

    if (!response.ok) {
      throw new Error(data?.error || 'Master indisponível.')
    }

    masterLicenseCache = {
      checkedAt: now,
      active: data.active === true,
      configured: true,
      status: data.status || 'unknown',
      billingStatus: data.billingStatus || 'unknown',
      nextDueDate: data.nextDueDate || null,
      temporaryUnlockUntil: data.temporaryUnlockUntil || null,
      unavailable: false,
      demoMode: data.demoMode === true,
      paymentProvider: ['asaas', 'mercadopago'].includes(data.paymentProvider)
        ? data.paymentProvider
        : 'asaas',
      mercadoPagoConnected: data.mercadoPagoConnected === true,
    }

    return masterLicenseCache
  } catch (error) {
    console.warn('Falha temporária ao consultar licença Master:', error?.message || error)

    // Fail-safe: uma falha de rede nunca suspende um cliente que estava ativo.
    // Se já havia um bloqueio válido vindo do Master, ele permanece.
    if (masterLicenseCache.checkedAt) {
      return {
        ...masterLicenseCache,
        unavailable: true,
      }
    }

    return {
      checkedAt: 0,
      active: true,
      configured: true,
      status: 'master_unavailable',
      billingStatus: 'unknown',
      nextDueDate: null,
      temporaryUnlockUntil: null,
      unavailable: true,
      demoMode: false,
      paymentProvider: 'asaas',
      mercadoPagoConnected: false,
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function requireActiveLicense(req, res, next) {
  try {
    const license = await checkMasterLicense()
    if (license.demoMode) return next()

    if (license.demoMode) return next()

    const billingBlocked = ['past_due', 'suspended', 'cancelled'].includes(license.billingStatus)

    if (!license.active || billingBlocked) {
      return res.status(423).json({
        error: 'Mensalidade do ClubeOn pendente. Regularize a assinatura para continuar.',
        code: 'LICENSE_SUSPENDED',
      })
    }
    next()
  } catch (error) {
    next(error)
  }
}


async function requireBookingLicense(req, res, next) {
  try {
    const license = await checkMasterLicense()
    const billingBlocked = ['past_due', 'suspended', 'cancelled'].includes(license.billingStatus)

    if (!license.active || billingBlocked) {
      return res.status(423).json({
        error: 'Novas reservas estão temporariamente indisponíveis. A assinatura do estabelecimento precisa ser regularizada.',
        code: 'BOOKING_LICENSE_BLOCKED',
      })
    }

    next()
  } catch (error) {
    next(error)
  }
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

function isValidEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
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
  const canonicalParts = [
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
  ]

  const hasExtrasSnapshot =
    contract.basePrice !== undefined ||
    contract.extrasTotal !== undefined ||
    (Array.isArray(contract.extras) && contract.extras.length > 0)

  if (contract.startTime || contract.endTime || contract.endDateISO) {
    canonicalParts.push(
      'TIME_V1',
      contract.startTime || '',
      contract.endTime || '',
      contract.endDateISO || '',
    )
  }

  if (hasExtrasSnapshot) {
    canonicalParts.push(
      'EXTRAS_V1',
      Number(contract.basePrice || 0).toFixed(2),
      Number(contract.extrasTotal || 0).toFixed(2),
      JSON.stringify((contract.extras || []).map((item) => ({
        id: item.id,
        name: item.name,
        unitPrice: Number(item.unitPrice || 0).toFixed(2),
        quantity: Number(item.quantity || 0),
        subtotal: Number(item.subtotal || 0).toFixed(2),
      }))),
    )
  }

  if (contract.establishmentName) {
    canonicalParts.push(contract.establishmentName)
  }

  if (contract.cancellationPolicyText) {
    canonicalParts.push(contract.cancellationPolicyText)
  }

  if (contract.cleaningClauseText) {
    canonicalParts.push('CLEANING_V1', contract.cleaningClauseText)
  }

  return crypto.createHash('sha256').update(canonicalParts.join('|')).digest('hex').toUpperCase()
}

function validateProductionConfig() {
  const errors = []
  const warnings = []

  if (!MONGODB_URI) errors.push('MONGODB_URI')
  if (!JWT_SECRET) errors.push('JWT_SECRET')
  if (!ASAAS_API_KEY || !ASAAS_API_KEY.startsWith('$aact_prod_')) errors.push('ASAAS_API_KEY de produção')
  if (ASAAS_ENV !== 'production') errors.push('ASAAS_ENV=production')

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
  if (body.privacy !== undefined) update.privacy = sanitizePrivacyConfig(body.privacy)

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

  if (body.rentalStartTimes !== undefined) {
    const normalizeTimes = (values) => {
      if (!Array.isArray(values) || values.length === 0 || values.length > 24) {
        const error = new Error('Lista de horários disponíveis inválida.')
        error.statusCode = 400
        throw error
      }

      const normalized = [...new Set(values.map((value) => textValue(value, 5)))]
      if (normalized.some((value) => !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))) {
        const error = new Error('Existe um horário disponível inválido.')
        error.statusCode = 400
        throw error
      }
      return normalized.sort()
    }

    update.rentalStartTimes = {
      '12h': normalizeTimes(body.rentalStartTimes?.['12h']),
      '24h': normalizeTimes(body.rentalStartTimes?.['24h']),
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

  if (body.extras !== undefined) {
    if (!Array.isArray(body.extras) || body.extras.length > 100) {
      const error = new Error('Lista de adicionais inválida.')
      error.statusCode = 400
      throw error
    }

    const seen = new Set()
    update.extras = body.extras.map((item, index) => {
      const id = textValue(item?.id || ('extra-' + index), 80)
      const name = textValue(item?.name, 100)
      const description = textValue(item?.description, 300)
      const price = Number(item?.price)
      const active = item?.active === true

      if (!id || seen.has(id) || name.length < 2 || !Number.isFinite(price) || price <= 0 || price > 100000) {
        const error = new Error('Existe um adicional com dados inválidos.')
        error.statusCode = 400
        throw error
      }

      seen.add(id)
      return {
        id,
        name,
        description,
        price: Math.round(price * 100) / 100,
        active,
      }
    })
  }

  if (body.notifications !== undefined) {
    const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/
    const reservationDayBeforeTime = textValue(
      body.notifications?.reservationDayBeforeTime || '18:00',
      5,
    )
    const reservationSameDayTime = textValue(
      body.notifications?.reservationSameDayTime || '07:00',
      5,
    )

    if (
      !timePattern.test(reservationDayBeforeTime) ||
      !timePattern.test(reservationSameDayTime)
    ) {
      const error = new Error('Horário de lembrete inválido.')
      error.statusCode = 400
      throw error
    }

    update.notifications = {
      notifyPaidReservation: body.notifications?.notifyPaidReservation !== false,
      notifyNewVisit: body.notifications?.notifyNewVisit !== false,
      notifyReservationDayBefore:
        body.notifications?.notifyReservationDayBefore !== false,
      notifyReservationSameDay:
        body.notifications?.notifyReservationSameDay !== false,
      reservationDayBeforeTime,
      reservationSameDayTime,
    }
  }

  if (body.cancellationPolicy !== undefined) {
    const policyText = textValue(body.cancellationPolicy?.text, 2000)
    if (policyText.length < 20) {
      const error = new Error('A política de cancelamento deve ter pelo menos 20 caracteres.')
      error.statusCode = 400
      throw error
    }
    update.cancellationPolicy = { text: policyText }
  }

  if (body.establishment !== undefined) {
    const establishment = {
      name: textValue(body.establishment?.name, 120),
      ownerName: textValue(body.establishment?.ownerName, 120),
      phone: onlyDigits(body.establishment?.phone).slice(0, 13),
      address: textValue(body.establishment?.address, 240),
      city: textValue(body.establishment?.city, 100),
      state: textValue(body.establishment?.state, 2).toUpperCase(),
      locationNote: textValue(body.establishment?.locationNote, 240),
      openingHours: textValue(body.establishment?.openingHours, 180),
    }

    if (establishment.name.length < 2) {
      const error = new Error('Informe o nome do estabelecimento.')
      error.statusCode = 400
      throw error
    }

    if (establishment.phone && !isValidPhone(establishment.phone)) {
      const error = new Error('Telefone do estabelecimento inválido.')
      error.statusCode = 400
      throw error
    }

    if (establishment.state && !/^[A-Z]{2}$/.test(establishment.state)) {
      const error = new Error('UF inválida. Use duas letras, como RO.')
      error.statusCode = 400
      throw error
    }

    update.establishment = establishment
  }

  if (body.onboarding !== undefined) {
    update.onboarding = {
      establishmentConfigured: body.onboarding?.establishmentConfigured === true,
      pricesConfigured: body.onboarding?.pricesConfigured === true,
    }
  }

  if (body.branding !== undefined) {
    const colorPattern = /^#[0-9a-fA-F]{6}$/
    const logoUrl = textValue(body.branding?.logoUrl, 1000)
    const primaryColor = textValue(body.branding?.primaryColor, 7)
    const secondaryColor = textValue(body.branding?.secondaryColor, 7)
    const accentColor = textValue(body.branding?.accentColor, 7)

    if (
      logoUrl &&
      !/^https:\/\//i.test(logoUrl) &&
      !/^\/api\/images\/[a-f0-9]{24}$/i.test(logoUrl)
    ) {
      const error = new Error('Endereço da logo inválido.')
      error.statusCode = 400
      throw error
    }

    if (![primaryColor, secondaryColor, accentColor].every((value) => colorPattern.test(value))) {
      const error = new Error('As cores da marca devem estar no formato hexadecimal, como #1F8EFA.')
      error.statusCode = 400
      throw error
    }

    update.branding = {
      logoUrl,
      primaryColor,
      secondaryColor,
      accentColor,
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

function selectedExtrasForContract(settings, requestedExtras) {
  if (!Array.isArray(requestedExtras) || requestedExtras.length === 0) {
    return { extras: [], extrasTotal: 0 }
  }

  if (requestedExtras.length > 50) {
    const error = new Error('Quantidade de tipos de adicionais inválida.')
    error.statusCode = 400
    throw error
  }

  const available = new Map(
    (Array.isArray(settings.extras) ? settings.extras : [])
      .filter((item) => item?.active === true)
      .map((item) => [String(item.id), item]),
  )

  const selectedIds = new Set()
  const extras = requestedExtras
    .map((requested) => {
      const id = textValue(requested?.id, 80)
      const quantity = Number(requested?.quantity)
      const source = available.get(id)

      if (
        !source ||
        selectedIds.has(id) ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 100
      ) {
        const error = new Error('Um dos adicionais selecionados não está disponível ou possui quantidade inválida.')
        error.statusCode = 400
        throw error
      }

      selectedIds.add(id)
      const unitPrice = Number(source.price)
      const subtotal = Math.round(unitPrice * quantity * 100) / 100
      return {
        id,
        name: textValue(source.name, 100),
        description: textValue(source.description, 300),
        unitPrice: Math.round(unitPrice * 100) / 100,
        quantity,
        subtotal,
      }
    })

  const extrasTotal = Math.round(extras.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100
  return { extras, extrasTotal }
}

function allowedStartTimes(settings, period) {
  const configured = settings?.rentalStartTimes?.[period]
  if (Array.isArray(configured) && configured.length) return configured
  return ['08:00']
}

function reservationTimeSlot(dateISO, period, startTime) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateISO || '')) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(startTime || ''))) {
    const error = new Error('Data ou horário da reserva inválido.')
    error.statusCode = 400
    throw error
  }

  const durationHours = period === '24h' ? 24 : 12
  const [hour, minute] = startTime.split(':').map(Number)
  const start = new Date(dateISO + 'T00:00:00Z')
  start.setUTCHours(hour, minute, 0, 0)
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000)

  return {
    startTime,
    endTime: String(end.getUTCHours()).padStart(2, '0') + ':' + String(end.getUTCMinutes()).padStart(2, '0'),
    endDateISO: end.toISOString().slice(0, 10),
  }
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

async function markPaymentReceived(reservation, payment, eventName = 'PAYMENT_RECEIVED', provider = 'asaas') {
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
          ...(provider === 'asaas' ? { asaasStatus: payment?.status || 'RECEIVED' } : {}),
          paymentProvider: provider,
          providerPaymentId: reservation.providerPaymentId || reservation.asaasPaymentId || payment?.id,
          providerStatus: payment?.status || 'RECEIVED',
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
        ...(provider === 'asaas' ? { asaasStatus: payment?.status || 'RECEIVED' } : {}),
        paymentProvider: provider,
        providerPaymentId: reservation.providerPaymentId || reservation.asaasPaymentId || payment?.id,
        providerStatus: payment?.status || 'RECEIVED',
        reservationStatus: 'active',
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

  await notifyPaidReservationPush(savedReservation, 'Reserva paga')

  console.log('Pagamento processado:', eventName, reservation.id, payment?.id)
  return { reservation: savedReservation, contract: savedContract }
}

async function resolveExpiredPayment(reservation) {
  if (!reservation?.dateISO) return { expired: false }

  const expire = async () => {
    const expiredReservation = await Reservation.findOneAndUpdate(
      {
        id: reservation.id,
        paymentStatus: { $in: ['pending-asaas', 'pending-mercadopago', 'awaiting-payment'] },
      },
      {
        $set: {
          paymentStatus: 'expired',
          ...(reservation.paymentProvider === 'asaas'
            ? { asaasStatus: 'EXPIRED_LOCAL_HOLD' }
            : {}),
          paymentProvider: reservation.paymentProvider || 'asaas',
          providerPaymentId: reservation.providerPaymentId || reservation.asaasPaymentId || null,
          providerStatus: 'EXPIRED_LOCAL_HOLD',
          holdUntil: null,
          reservationStatus: 'pending-payment',
        },
      },
      { new: true },
    ).lean()

    await Contract.updateOne(
      { id: reservation.contractId, paymentStatus: { $ne: 'paid' } },
      { $set: { paymentStatus: 'expired', status: 'signed-awaiting-payment' } },
    )

    await DateLock.deleteOne({
      _id: reservation.dateISO,
      reservationId: reservation.id,
      status: 'pending',
    })

    return { expired: true, reservation: expiredReservation || reservation }
  }

  if (reservation.paymentProvider === 'mercadopago') {
    try {
      if (reservation.paymentMethod === 'card') {
        const payment = await masterBillingRequest(
          '/api/license/mercadopago/payments/by-reference/' + encodeURIComponent(reservation.id),
        )

        if (
          payment?.found &&
          payment.externalReference === reservation.id &&
          Number(payment.amount || 0).toFixed(2) === Number(reservation.price || 0).toFixed(2) &&
          payment.status === 'approved'
        ) {
          const result = await markPaymentReceived(
            reservation,
            {
              id: payment.paymentId,
              status: 'APPROVED',
              paymentDate: payment.dateApproved ? new Date(payment.dateApproved) : new Date(),
            },
            'MERCADOPAGO_EXPIRATION_CHECK',
            'mercadopago',
          )
          return {
            expired: false,
            paid: !result?.manualReview,
            manualReview: Boolean(result?.manualReview),
            ...result,
          }
        }

        if (reservation.providerPaymentId) {
          await masterBillingRequest(
            '/api/license/mercadopago/checkout/preferences/' +
              encodeURIComponent(reservation.providerPaymentId) +
              '/expire',
            { method: 'POST' },
          ).catch(() => {})
        }

        return expire()
      }

      if (reservation.providerPaymentId) {
        const order = await masterBillingRequest(
          '/api/license/mercadopago/orders/' + encodeURIComponent(reservation.providerPaymentId),
        )

        if (order?.status === 'processed' && order?.statusDetail === 'accredited') {
          const result = await markPaymentReceived(
            reservation,
            {
              id: order.orderId,
              status: 'PROCESSED',
              paymentDate: new Date(),
            },
            'MERCADOPAGO_EXPIRATION_CHECK',
            'mercadopago',
          )
          return {
            expired: false,
            paid: !result?.manualReview,
            manualReview: Boolean(result?.manualReview),
            ...result,
          }
        }
      }

      return expire()
    } catch {
      const extendedUntil = new Date(Date.now() + 2 * 60 * 1000)
      await DateLock.updateOne(
        { _id: reservation.dateISO, reservationId: reservation.id, status: 'pending' },
        { $set: { expiresAt: extendedUntil } },
      )
      await Reservation.updateOne(
        { id: reservation.id, paymentStatus: 'pending-mercadopago' },
        { $set: { holdUntil: extendedUntil } },
      )
      return { expired: false, retry: true }
    }
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
              paymentProvider: reservation.paymentProvider || 'asaas',
              providerPaymentId: reservation.providerPaymentId || reservation.asaasPaymentId,
              providerStatus: 'CONFIRMED',
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
      // Mantém a data protegida brevemente em caso de indisponibilidade temporária do provedor.
    }

    const extendedUntil = new Date(Date.now() + 2 * 60 * 1000)
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

async function verifyAdminPasswordAgainstMaster(password, license = null) {
  if (license?.demoMode) {
    return { valid: true, configured: false, demoMode: true }
  }

  if (!MASTER_LICENSE_CONFIGURED) {
    throw Object.assign(
      new Error('Autenticação central do ClubeOn não configurada neste estabelecimento.'),
      { statusCode: 503 },
    )
  }

  try {
    const masterResult = await masterBillingRequest('/api/license/admin-auth/verify', {
      method: 'POST',
      body: { password: String(password || '') },
    })

    return {
      valid: masterResult.valid === true,
      configured: masterResult.configured === true,
      demoMode: false,
    }
  } catch (error) {
    console.error('Falha ao validar senha administrativa no Master:', error?.message || error)
    throw Object.assign(
      new Error('Não foi possível validar o acesso administrativo agora. Tente novamente em instantes.'),
      { statusCode: Number(error?.statusCode) >= 400 && Number(error?.statusCode) < 500 ? error.statusCode : 503 },
    )
  }
}

async function masterBillingRequest(pathname, options = {}) {
  if (!MASTER_LICENSE_CONFIGURED) {
    throw Object.assign(new Error('Licenciamento Master ainda não configurado.'), { statusCode: 503 })
  }

  const response = await fetch(MASTER_API_URL + pathname, {
    method: options.method || 'GET',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-club-id': MASTER_CLUB_ID,
      'x-license-key': MASTER_LICENSE_KEY,
      'user-agent': 'EspacoOn-License-Agent/1.0',
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw Object.assign(
      new Error(data?.error || 'Não foi possível consultar a cobrança da assinatura.'),
      { statusCode: response.status >= 500 ? 502 : response.status },
    )
  }

  return data
}

app.get('/api/privacy', async (_req, res, next) => {
  try {
    const settings = await currentSettings()
    res.setHeader('Cache-Control', 'no-store')
    res.json(buildPrivacyPolicy({ config: settings.privacy, establishment: settings.establishment, platformUrl: MASTER_API_URL }))
  } catch (error) { next(error) }
})

// Responses with personal or administrative data must not be cached.
app.use(['/api/admin', '/api/contracts', '/api/reservations', '/api/payments'], (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    masterLicenseConfigured: MASTER_LICENSE_CONFIGURED,
    backup: {
      configured: backupState.configured,
      running: backupState.running,
      lastCompletedAt: backupState.lastCompletedAt,
      lastSnapshotId: backupState.lastSnapshotId,
      healthy: !backupState.lastError,
    },
  })
})

async function reportDemoEvent(type, eventId, location = null, locationStatus = null) {
  if (!MASTER_LICENSE_CONFIGURED) return false
  try {
    const response = await fetch(MASTER_API_URL + '/api/license/demo-events', {
      method: 'POST', headers: {
        'content-type': 'application/json', 'x-club-id': MASTER_CLUB_ID, 'x-license-key': MASTER_LICENSE_KEY,
      },
      body: JSON.stringify({ type, eventId, ...(location ? { location } : {}), ...(locationStatus ? {locationStatus} : {}) }), signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch { return false }
}

const demoEventLimiter = rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Muitos eventos de demonstração.' } })

app.post('/api/demo/events', demoEventLimiter, async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const { type, eventId } = req.body || {}
    if (!['visit', 'admin_open', 'contact_click'].includes(type) || typeof eventId !== 'string' || !/^[A-Za-z0-9-]{8,80}$/.test(eventId)) {
      return res.status(400).json({ error: 'Evento de demonstração inválido.' })
    }
    const license = await checkMasterLicense()
    if (!license.demoMode) return res.status(403).json({ error: 'Métricas disponíveis somente para demonstração.' })
    if (req.get('DNT') === '1' || req.get('Sec-GPC') === '1') return res.status(202).json({ recorded: false })
    const geography = type === 'visit' ? await lookupDemoLocation.diagnose(demoVisitorIp(req)) : null
    const recorded = await reportDemoEvent(type, eventId, geography?.location, geography?.status)
    res.status(recorded ? 200 : 202).json({ recorded })
  } catch (error) { next(error) }
})

app.get('/api/license', async (req, res, next) => {
  try {
    const license = await checkMasterLicense({ force: req.query?.force === '1' })
    res.json({
      active: license.active,
      configured: license.configured,
      demoMode: license.demoMode === true,
      status: license.status,
      billingStatus: license.billingStatus,
      nextDueDate: license.nextDueDate,
      temporaryUnlockUntil: license.temporaryUnlockUntil,
      masterUnavailable: license.unavailable === true,
      paymentProvider: license.paymentProvider || 'asaas',
      mercadoPagoConnected: license.mercadoPagoConnected === true,
      bookingAllowed:
        license.demoMode === true ||
        (
          license.active === true &&
          !['past_due', 'suspended', 'cancelled'].includes(license.billingStatus)
        ),
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/payments/config', async (_req, res, next) => {
  try {
    const license = await checkMasterLicense({ force: true })

    if (
      license.demoMode === true ||
      (license.paymentProvider || 'asaas') !== 'mercadopago' ||
      license.mercadoPagoConnected !== true
    ) {
      return res.json({
        paymentProvider: license.demoMode ? 'demo' : (license.paymentProvider || 'asaas'),
        cardEnabled: false,
        mercadoPagoPublicKey: '',
      })
    }

    const config = await masterBillingRequest('/api/license/mercadopago/config')
    res.json({
      paymentProvider: 'mercadopago',
      cardEnabled: Boolean(config?.connected),
      mercadoPagoPublicKey: config?.publicKey || '',
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/license/billing', async (_req, res, next) => {
  try {
    res.json(await masterBillingRequest('/api/license/billing'))
  } catch (error) {
    next(error)
  }
})

app.post('/api/license/billing/pix', paymentLimiter, async (_req, res, next) => {
  try {
    res.json(await masterBillingRequest('/api/license/billing/pix', { method: 'POST' }))
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/login', loginLimiter, async (req, res, next) => {
  try {
    const license = await checkMasterLicense({ force: true })
    const password = String(req.body?.password || '')
    const auth = await verifyAdminPasswordAgainstMaster(password, license)

    if (!auth.valid) {
      return res.status(401).json({
        error: auth.configured
          ? 'Senha incorreta.'
          : 'Primeiro acesso ainda não configurado. Solicite o link de acesso ao administrador do ClubeOn.',
        code: auth.configured ? 'INVALID_PASSWORD' : 'FIRST_ACCESS_REQUIRED',
      })
    }

    const billingBlocked = ['past_due', 'suspended', 'cancelled'].includes(license.billingStatus)
    if (!license.demoMode && (!license.active || billingBlocked)) {
      return res.status(423).json({
        error: 'Mensalidade do ClubeOn pendente. Regularize a assinatura para acessar o painel.',
        code: 'LICENSE_SUSPENDED',
      })
    }

    res.cookie('espacoon_admin', signAdminToken(), {
      httpOnly: true,
      sameSite: 'strict',
      secure: true,
      path: '/',
      maxAge: 12 * 60 * 60 * 1000,
    })

    res.json({
      ok: true,
      demoMode: license.demoMode === true,
      passwordConfigured: auth.configured,
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/admin/session', requireAdmin, requireActiveLicense, (_req, res) => {
  res.json({ authenticated: true })
})

app.post('/api/admin/password/change', requireAdmin, requireActiveLicense, loginLimiter, async (req, res, next) => {
  try {
    const license = await checkMasterLicense({ force: true })
    if (license.demoMode) return res.status(409).json({ error: 'O modo demonstração não usa senha.' })

    const currentPassword = String(req.body?.currentPassword || '')
    const newPassword = String(req.body?.newPassword || '')
    const confirmation = String(req.body?.confirmation || '')

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'A nova senha deve ter pelo menos 8 caracteres.' })
    }
    if (newPassword !== confirmation) {
      return res.status(400).json({ error: 'As senhas não conferem.' })
    }

    const current = await verifyAdminPasswordAgainstMaster(currentPassword, license)
    if (!current.valid) return res.status(401).json({ error: 'Senha atual incorreta.' })
    if (!MASTER_LICENSE_CONFIGURED) {
      return res.status(503).json({ error: 'Master ainda não configurado para alterar a senha.' })
    }

    const result = await masterBillingRequest('/api/license/admin-auth/change', {
      method: 'POST',
      body: { currentPassword, newPassword, confirmation },
    })

    res.json(result)
  } catch (error) {
    next(error)
  }
})

app.get('/api/admin/payment-provider', requireAdmin, requireActiveLicense, async (_req, res, next) => {
  try {
    const license = await checkMasterLicense({ force: true })
    res.json({
      paymentProvider: license.paymentProvider || 'asaas',
      mercadoPagoConnected: license.mercadoPagoConnected === true,
      demoMode: license.demoMode === true,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/payments/mercadopago/connect', requireAdmin, requireActiveLicense, publicWriteLimiter, async (req, res, next) => {
  try {
    const returnUrl =
      req.protocol + '://' + req.get('host') + '/admin?mercadopago=connected'

    const result = await masterBillingRequest('/api/license/mercadopago/connect', {
      method: 'POST',
      body: { returnUrl },
    })

    res.json(result)
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/payments/mercadopago/disconnect', requireAdmin, requireActiveLicense, publicWriteLimiter, async (_req, res, next) => {
  try {
    const result = await masterBillingRequest('/api/license/mercadopago/disconnect', {
      method: 'POST',
    })
    await checkMasterLicense({ force: true })
    res.json(result)
  } catch (error) {
    next(error)
  }
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

app.use('/api/admin', requireActiveLicense)

app.get('/api/settings', async (_req, res, next) => {
  try {
    const settings = await Settings.findOne({ key: 'main' }).lean()
    const source = settings || DEFAULT_SETTINGS
    const { notifications, ...publicSettings } = source
    res.json({ ...publicSettings, contractTerms: { cleaningClauseText: CLEANING_CLAUSE_TEXT } })
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
      DateLock.find({}, { _id: 1, status: 1 }).lean(),
      Settings.findOne(
        { key: 'main' },
        { blockedDays: 1, blockedDates: 1, _id: 0 },
      ).lean(),
    ])

    res.json({
      reservedDates: locks.filter((lock) => ['paid', 'confirmed'].includes(lock.status)).map((lock) => lock._id),
      pendingDates: locks.filter((lock) => lock.status === 'pending').map((lock) => lock._id),
      blockedDates: settings?.blockedDates || [],
    })
  } catch (error) {
    next(error)
  }
})

app.put('/api/admin/settings', requireAdmin, publicWriteLimiter, async (req, res, next) => {
  try {
    const update = sanitizeSettingsUpdate(req.body)

    const settings = await Settings.findOneAndUpdate(
      { key: 'main' },
      { $set: update, $setOnInsert: { key: 'main' } },
      { upsert: true, new: true },
    ).lean()

    if (MASTER_LICENSE_CONFIGURED) await checkMasterLicense({ force: true })
    res.json(settings)
  } catch (error) {
    next(error)
  }
})

app.post('/api/contracts', requireBookingLicense, publicWriteLimiter, async (req, res, next) => {
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

    const bookingLicense = await checkMasterLicense({ force: true })

    const customer = {
      name: textValue(payload.customer?.name, 120),
      cpf: onlyDigits(payload.customer?.cpf),
      phone: onlyDigits(payload.customer?.phone),
      email: textValue(payload.customer?.email, 160).toLowerCase(),
      address: textValue(payload.customer?.address, 240),
    }

    if (
      customer.name.length < 3 ||
      !isBookingCpfValid(customer.cpf, bookingLicense.demoMode, isValidCpf) ||
      !isValidPhone(customer.phone) ||
      (customer.email && !isValidEmail(customer.email))
    ) {
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
    const configuredStartTimes = allowedStartTimes(settings, payload.period)
    const requestedStartTime = textValue(payload.startTime || configuredStartTimes[0], 5)
    if (!configuredStartTimes.includes(requestedStartTime)) {
      return res.status(400).json({ error: 'O horário de entrada selecionado não está disponível para este período.' })
    }
    const timeSlot = reservationTimeSlot(reservationDateISO, payload.period, requestedStartTime)

    const basePrice = priceForDate(reservationDateISO, payload.period, settings)
    const selectedExtras = selectedExtrasForContract(settings, payload.extras)
    const price = Math.round((basePrice + selectedExtras.extrasTotal) * 100) / 100
    const cancellationPolicyText = textValue(
      settings.cancellationPolicy?.text || DEFAULT_SETTINGS.cancellationPolicy.text,
      2000,
    )

    if (textValue(payload.cancellationPolicyText, 2000) !== cancellationPolicyText) {
      return res.status(409).json({
        error: 'A política de cancelamento foi atualizada. Feche o contrato e abra novamente antes de assinar.',
      })
    }

    if (payload.cleaningClauseText !== CLEANING_CLAUSE_TEXT) {
      return res.status(409).json({ error: 'O contrato foi atualizado com a cláusula de limpeza. Atualize a página e leia o contrato antes de assinar.' })
    }

    const contractRecord = {
      id: payload.id,
      reservationId: payload.reservationId,
      reservationDate: displayDate(reservationDateISO),
      reservationDateISO,
      period: payload.period,
      startTime: timeSlot.startTime,
      endTime: timeSlot.endTime,
      endDateISO: timeSlot.endDateISO,
      basePrice,
      extrasTotal: selectedExtras.extrasTotal,
      extras: selectedExtras.extras,
      price,
      customer,
      signedAt,
      signature,
      establishmentName: textValue(settings.establishment?.name || 'ClubeOn', 120),
      cancellationPolicyText,
      cleaningClauseText: CLEANING_CLAUSE_TEXT,
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

app.post('/api/payments/mercadopago/checkout', requireBookingLicense, paymentLimiter, async (req, res, next) => {
  let lockCreated = false
  let contractDateISO = null
  let reservationId = null

  try {
    const { reservation, contractId } = req.body || {}
    reservationId = textValue(reservation?.id, 60)

    if (!isValidId(reservationId, 'ESP') || !isValidId(contractId, 'CTR')) {
      return res.status(400).json({ error: 'Dados da cobrança incompletos.' })
    }

    const contract = await Contract.findOne({ id: contractId, reservationId }).lean()
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

    const license = await checkMasterLicense({ force: true })
    if (license.demoMode) {
      return res.status(409).json({ error: 'Cartão não é processado no modo demonstração.' })
    }
    if ((license.paymentProvider || 'asaas') !== 'mercadopago' || !license.mercadoPagoConnected) {
      return res.status(409).json({ error: 'Mercado Pago não está conectado para este clube.' })
    }
    if (!isValidEmail(contract.customer?.email)) {
      return res.status(400).json({ error: 'Informe um e-mail válido do responsável pela reserva.' })
    }

    const lockResult = await acquireDateLock(contractDateISO, reservationId)
    lockCreated = lockResult.created

    const existing = await Reservation.findOne({ id: reservationId }).lean()
    if (
      existing?.paymentProvider === 'mercadopago' &&
      existing?.paymentMethod === 'card' &&
      existing?.providerCheckoutUrl &&
      existing?.paymentStatus === 'pending-mercadopago'
    ) {
      return res.json({
        reservation: existing,
        checkoutUrl: existing.providerCheckoutUrl,
        preferenceId: existing.providerPaymentId || null,
      })
    }

    const origin = req.protocol + '://' + req.get('host')
    const returnBase =
      origin +
      '/api/payments/mercadopago/checkout/return?reservationId=' +
      encodeURIComponent(reservationId)

    const preference = await masterBillingRequest('/api/license/mercadopago/checkout/preferences', {
      method: 'POST',
      body: {
        amount: serverPrice,
        externalReference: reservationId,
        payerEmail: contract.customer.email,
        description: 'Reserva ClubeOn - ' + displayDate(contractDateISO) + ' - ' + contract.period,
        successUrl: returnBase + '&result=success',
        pendingUrl: returnBase + '&result=pending',
        failureUrl: returnBase + '&result=failure',
      },
    })

    if (!preference?.preferenceId || !preference?.checkoutUrl) {
      throw Object.assign(new Error('O Mercado Pago não retornou o link do checkout.'), { statusCode: 502 })
    }

    const holdUntil = new Date(Date.now() + 15 * 60 * 1000)
    const savedReservation = await Reservation.findOneAndUpdate(
      { id: reservationId },
      {
        $set: {
          id: reservationId,
          day: Number(contractDateISO.slice(-2)),
          date: contract.reservationDate || displayDate(contractDateISO),
          dateISO: contractDateISO,
          period: contract.period,
          startTime: contract.startTime || '',
          endTime: contract.endTime || '',
          endDateISO: contract.endDateISO || '',
          basePrice: Number(contract.basePrice || serverPrice),
          extrasTotal: Number(contract.extrasTotal || 0),
          extras: Array.isArray(contract.extras) ? contract.extras : [],
          customer: contract.customer,
          price: serverPrice,
          contractId,
          paymentStatus: 'pending-mercadopago',
          paymentProvider: 'mercadopago',
          paymentMethod: 'card',
          providerCustomerId: null,
          providerPaymentId: preference.preferenceId,
          providerCheckoutUrl: preference.checkoutUrl,
          providerStatus: 'checkout_created',
          pixExpirationDate: null,
          holdUntil,
          reservationStatus: 'pending-payment',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean()

    await Contract.updateOne(
      { id: contractId },
      { $set: { price: serverPrice, paymentStatus: 'pending-mercadopago', status: 'signed-awaiting-payment' } },
    )

    await DateLock.updateOne(
      { _id: contractDateISO, reservationId },
      { $set: { status: 'pending', expiresAt: holdUntil } },
    )

    res.status(201).json({
      reservation: savedReservation,
      checkoutUrl: preference.checkoutUrl,
      preferenceId: preference.preferenceId,
    })
  } catch (error) {
    if (lockCreated && contractDateISO && reservationId) {
      await releasePendingDateLock(contractDateISO, reservationId).catch(() => {})
    }
    next(error)
  }
})

app.get('/api/payments/mercadopago/checkout/return', async (req, res) => {
  const reservationId = textValue(req.query?.reservationId || req.query?.external_reference, 60)
  const result = textValue(req.query?.result, 20)

  let finalStatus = result || 'pending'
  let message = 'Estamos confirmando o pagamento da sua reserva.'

  try {
    const reservation = await Reservation.findOne({ id: reservationId }).lean()
    if (reservation?.paymentProvider === 'mercadopago' && reservation?.paymentMethod === 'card') {
      const payment = await masterBillingRequest(
        '/api/license/mercadopago/payments/by-reference/' + encodeURIComponent(reservationId),
      )

      if (
        payment?.found &&
        payment.externalReference === reservationId &&
        Number(payment.amount || 0).toFixed(2) === Number(reservation.price || 0).toFixed(2) &&
        payment.status === 'approved'
      ) {
        await markPaymentReceived(
          reservation,
          {
            id: payment.paymentId,
            status: 'APPROVED',
            paymentDate: payment.dateApproved ? new Date(payment.dateApproved) : new Date(),
          },
          'MERCADOPAGO_CHECKOUT_RETURN',
          'mercadopago',
        )
        finalStatus = 'approved'
        message = 'Pagamento aprovado. Sua reserva foi confirmada.'
      } else if (result === 'failure') {
        await DateLock.deleteOne({
          _id: reservation.dateISO,
          reservationId: reservation.id,
          status: 'pending',
        })
        await Reservation.updateOne(
          { id: reservation.id, paymentStatus: { $ne: 'paid' } },
          {
            $set: {
              paymentStatus: 'awaiting-payment',
              providerStatus: payment?.status || 'rejected',
              providerPaymentId: null,
              providerCheckoutUrl: null,
              holdUntil: null,
            },
          },
        )
        await Contract.updateOne(
          { id: reservation.contractId, paymentStatus: { $ne: 'paid' } },
          { $set: { paymentStatus: 'awaiting-payment', status: 'signed-awaiting-payment' } },
        )
        finalStatus = 'failure'
        message = 'O pagamento não foi aprovado. Volte ao ClubeOn para tentar novamente.'
      } else if (payment?.found) {
        await Reservation.updateOne(
          { id: reservation.id, paymentStatus: { $ne: 'paid' } },
          {
            $set: {
              providerStatus: payment.statusDetail
                ? payment.status + ':' + payment.statusDetail
                : payment.status,
            },
          },
        )
        finalStatus = payment.status || 'pending'
        message = 'O pagamento está sendo processado. O ClubeOn continuará verificando automaticamente.'
      }
    }
  } catch (error) {
    console.error('Falha ao processar retorno do Checkout Pro:', error)
    finalStatus = finalStatus === 'success' ? 'pending' : finalStatus
    message = 'Recebemos o retorno do Mercado Pago e continuaremos verificando o pagamento.'
  }

  const safeStatus = JSON.stringify(finalStatus)
  const safeReservation = JSON.stringify(reservationId)
  const safeMessage = String(message)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  res.set('content-type', 'text/html; charset=utf-8')
  res.send(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Pagamento ClubeOn</title>
  <style>
    body{margin:0;font-family:Arial,sans-serif;background:#f3f7fb;color:#16384b;display:grid;min-height:100vh;place-items:center}
    main{width:min(520px,calc(100% - 32px));padding:28px;border-radius:20px;background:white;box-shadow:0 18px 55px rgba(22,56,75,.12);text-align:center}
    h1{font-size:22px;margin:0 0 10px}p{color:#667f8b;line-height:1.55}a{display:inline-block;margin-top:14px;padding:13px 18px;border-radius:11px;background:#1769ff;color:white;text-decoration:none;font-weight:700}
  </style>
</head>
<body>
  <main>
    <h1>Retorno do Mercado Pago</h1>
    <p>${safeMessage}</p>
    <a href="/?paymentReturn=${encodeURIComponent(finalStatus)}&reservationId=${encodeURIComponent(reservationId)}">Voltar ao ClubeOn</a>
  </main>
  <script>
    (function () {
      var payload = { type: 'espacoon-payment-return', status: ${safeStatus}, reservationId: ${safeReservation} };
      if (window.opener && !window.opener.closed) {
        try { window.opener.postMessage(payload, window.location.origin); } catch (e) {}
        setTimeout(function () { window.close(); }, 800);
      }
    }());
  </script>
</body>
</html>`)
})


app.post('/api/payments/mercadopago/card', requireBookingLicense, paymentLimiter, async (req, res, next) => {
  let lockCreated = false
  let contractDateISO = null
  let reservationId = null

  try {
    const { reservation, contractId, card } = req.body || {}
    reservationId = textValue(reservation?.id, 60)

    if (!isValidId(reservationId, 'ESP') || !isValidId(contractId, 'CTR')) {
      return res.status(400).json({ error: 'Dados da cobrança incompletos.' })
    }

    const contract = await Contract.findOne({ id: contractId, reservationId }).lean()
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

    const license = await checkMasterLicense({ force: true })
    if (license.demoMode) {
      return res.status(409).json({ error: 'Cartão não é processado no modo demonstração.' })
    }
    if ((license.paymentProvider || 'asaas') !== 'mercadopago' || !license.mercadoPagoConnected) {
      return res.status(409).json({ error: 'Mercado Pago não está conectado para este clube.' })
    }

    if (!isValidEmail(contract.customer?.email)) {
      return res.status(400).json({ error: 'Informe um e-mail válido do responsável pela reserva.' })
    }

    const token = textValue(card?.token, 500)
    const paymentMethodId = textValue(card?.payment_method_id, 40)
    const paymentTypeId = textValue(card?.payment_type_id, 40)
    const installments = Number(card?.installments || 1)
    const identificationType = textValue(card?.payer?.identification?.type || 'CPF', 12)
    const identificationNumber = onlyDigits(
      card?.payer?.identification?.number || contract.customer?.cpf || ''
    )

    if (!token || !paymentMethodId || paymentTypeId !== 'credit_card') {
      return res.status(400).json({ error: 'Dados do cartão inválidos ou incompletos.' })
    }

    const lockResult = await acquireDateLock(contractDateISO, reservationId)
    lockCreated = lockResult.created

    const existing = await Reservation.findOne({ id: reservationId }).lean()
    if (existing?.paymentProvider === 'mercadopago' && existing?.providerPaymentId) {
      const currentOrder = await masterBillingRequest(
        '/api/license/mercadopago/orders/' + encodeURIComponent(existing.providerPaymentId),
      )

      if (currentOrder.status === 'processed' && currentOrder.statusDetail === 'accredited') {
        const result = await markPaymentReceived(
          existing,
          { id: currentOrder.orderId, status: 'PROCESSED', paymentDate: new Date() },
          'MERCADOPAGO_CARD_RECONCILIATION',
          'mercadopago',
        )
        return res.json({ paid: !result?.manualReview, ...result })
      }

      const terminal = ['failed', 'canceled', 'expired'].includes(currentOrder.status)
      if (!terminal) {
        return res.status(409).json({
          error: 'Já existe uma cobrança Mercado Pago em andamento para esta reserva.',
          code: 'PAYMENT_ALREADY_EXISTS',
        })
      }
    }

    const order = await masterBillingRequest('/api/license/mercadopago/orders/card', {
      method: 'POST',
      body: {
        amount: serverPrice,
        externalReference: reservationId,
        payerEmail: contract.customer.email,
        description: 'Reserva ClubeOn - ' + displayDate(contractDateISO) + ' - ' + contract.period,
        token,
        paymentMethodId,
        paymentTypeId,
        installments,
        identificationType,
        identificationNumber,
      },
    })

    if (!order?.orderId) {
      throw Object.assign(new Error('O Mercado Pago não retornou a identificação da cobrança.'), { statusCode: 502 })
    }

    const holdUntil = new Date(Date.now() + 15 * 60 * 1000)
    const providerStatus = order.statusDetail
      ? String(order.status || '') + ':' + String(order.statusDetail)
      : String(order.status || '')

    const savedReservation = await Reservation.findOneAndUpdate(
      { id: reservationId },
      {
        $set: {
          id: reservationId,
          day: Number(contractDateISO.slice(-2)),
          date: contract.reservationDate || displayDate(contractDateISO),
          dateISO: contractDateISO,
          period: contract.period,
          startTime: contract.startTime || '',
          endTime: contract.endTime || '',
          endDateISO: contract.endDateISO || '',
          basePrice: Number(contract.basePrice || serverPrice),
          extrasTotal: Number(contract.extrasTotal || 0),
          extras: Array.isArray(contract.extras) ? contract.extras : [],
          customer: contract.customer,
          price: serverPrice,
          contractId,
          paymentStatus: 'pending-mercadopago',
          paymentProvider: 'mercadopago',
          paymentMethod: 'card',
          providerCustomerId: null,
          providerPaymentId: order.orderId,
          providerStatus,
          pixExpirationDate: null,
          holdUntil,
          reservationStatus: 'pending-payment',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean()

    await Contract.updateOne(
      { id: contractId },
      { $set: { price: serverPrice, paymentStatus: 'pending-mercadopago', status: 'signed-awaiting-payment' } },
    )

    await DateLock.updateOne(
      { _id: contractDateISO, reservationId },
      { $set: { status: 'pending', expiresAt: holdUntil } },
    )

    if (order.status === 'processed' && order.statusDetail === 'accredited') {
      const result = await markPaymentReceived(
        savedReservation,
        { id: order.orderId, status: 'PROCESSED', paymentDate: new Date() },
        'MERCADOPAGO_CARD_APPROVED',
        'mercadopago',
      )
      return res.status(201).json({
        paid: !result?.manualReview,
        manualReview: Boolean(result?.manualReview),
        ...result,
        payment: order,
      })
    }

    if (['failed', 'canceled', 'expired'].includes(order.status)) {
      await releasePendingDateLock(contractDateISO, reservationId).catch(() => {})
      await Reservation.updateOne(
        { id: reservationId },
        { $set: { paymentStatus: 'expired', providerStatus, holdUntil: null } },
      )
      return res.status(402).json({
        error: 'O pagamento no cartão não foi aprovado. Confira os dados ou tente outro cartão.',
        code: 'CARD_NOT_APPROVED',
        payment: order,
      })
    }

    return res.status(201).json({
      paid: false,
      reservation: savedReservation,
      payment: order,
      challengeUrl: order.challengeUrl || null,
    })
  } catch (error) {
    if (lockCreated && contractDateISO && reservationId) {
      await releasePendingDateLock(contractDateISO, reservationId).catch(() => {})
    }
    next(error)
  }
})

app.post('/api/payments/asaas/pix', requireBookingLicense, paymentLimiter, async (req, res, next) => {
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

    const license = await checkMasterLicense({ force: true })

    if (license.demoMode) {
      const paidAt = new Date()

      const savedReservation = await Reservation.findOneAndUpdate(
        { id: reservationId },
        {
          $set: {
            id: reservationId,
            day: Number(contractDateISO.slice(-2)),
            date: contract.reservationDate || displayDate(contractDateISO),
            dateISO: contractDateISO,
            period: contract.period,
            startTime: contract.startTime || '',
            endTime: contract.endTime || '',
            endDateISO: contract.endDateISO || '',
            basePrice: Number(contract.basePrice || serverPrice),
            extrasTotal: Number(contract.extrasTotal || 0),
            extras: Array.isArray(contract.extras) ? contract.extras : [],
            customer: contract.customer,
            price: serverPrice,
            contractId,
            paymentStatus: 'paid',
            asaasCustomerId: null,
            asaasPaymentId: null,
            asaasStatus: 'DEMO_SIMULATED',
            paymentProvider: 'demo',
            paymentMethod: 'demo',
            providerCustomerId: null,
            providerPaymentId: null,
            providerStatus: 'DEMO_SIMULATED',
            pixExpirationDate: null,
            holdUntil: null,
            paidAt,
            reservationStatus: 'active',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean()

      const updatedContract = await Contract.findOneAndUpdate(
        { id: contractId },
        {
          $set: {
            price: serverPrice,
            paymentStatus: 'paid',
            status: 'signed-paid',
            paidAt,
          },
        },
        { new: true },
      ).lean()

      await DateLock.updateOne(
        { _id: contractDateISO, reservationId },
        {
          $set: {
            status: 'confirmed',
            expiresAt: null,
          },
        },
      )

      await notifyPaidReservationPush(savedReservation, 'Nova reserva confirmada')
      void reportDemoEvent('reservation_completed', reservationId)

      return res.json({
        paid: true,
        demo: true,
        asaasStatus: 'DEMO_SIMULATED',
        reservation: savedReservation,
        contract: updatedContract,
      })
    }

    if ((license.paymentProvider || 'asaas') === 'mercadopago') {
      if (!license.mercadoPagoConnected) {
        return res.status(409).json({
          error: 'A conta Mercado Pago deste clube ainda não está conectada.',
          code: 'MERCADOPAGO_NOT_CONNECTED',
          paymentProvider: 'mercadopago',
        })
      }

      if (!isValidEmail(contract.customer?.email)) {
        return res.status(400).json({
          error: 'Informe um e-mail válido do responsável pela reserva para gerar o Pix no Mercado Pago.',
          code: 'PAYER_EMAIL_REQUIRED',
        })
      }

      if (existing?.paymentProvider === 'mercadopago' && existing?.providerPaymentId) {
        const currentOrder = await masterBillingRequest(
          '/api/license/mercadopago/orders/' + encodeURIComponent(existing.providerPaymentId),
        )
        return res.json({
          reservation: existing,
          payment: {
            id: currentOrder.orderId,
            status: currentOrder.status,
          },
          pix: {
            payload: currentOrder.qrCode,
            encodedImage: currentOrder.qrCodeBase64,
            ticketUrl: currentOrder.ticketUrl,
            expirationDate: existing.pixExpirationDate || null,
          },
        })
      }

      const order = await masterBillingRequest('/api/license/mercadopago/orders', {
        method: 'POST',
        body: {
          amount: serverPrice,
          externalReference: reservationId,
          payerEmail: contract.customer.email,
          description: 'Reserva ClubeOn - ' + displayDate(contractDateISO) + ' - ' + contract.period,
        },
      })

      if (!order?.orderId || !order?.qrCode) {
        throw Object.assign(new Error('O Mercado Pago não retornou os dados do Pix.'), { statusCode: 502 })
      }

      const holdUntil = new Date(Date.now() + 15 * 60 * 1000)
      const savedReservation = await Reservation.findOneAndUpdate(
        { id: reservationId },
        {
          $set: {
            id: reservationId,
            day: Number(contractDateISO.slice(-2)),
            date: contract.reservationDate || displayDate(contractDateISO),
            dateISO: contractDateISO,
            period: contract.period,
            startTime: contract.startTime || '',
            endTime: contract.endTime || '',
            endDateISO: contract.endDateISO || '',
            basePrice: Number(contract.basePrice || serverPrice),
            extrasTotal: Number(contract.extrasTotal || 0),
            extras: Array.isArray(contract.extras) ? contract.extras : [],
            customer: contract.customer,
            price: serverPrice,
            contractId,
            paymentStatus: 'pending-mercadopago',
            paymentProvider: 'mercadopago',
            paymentMethod: 'pix',
            providerCustomerId: null,
            providerPaymentId: order.orderId,
            providerStatus: order.status || 'action_required',
            pixExpirationDate: holdUntil.toISOString(),
            holdUntil,
            reservationStatus: 'pending-payment',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean()

      await Contract.updateOne(
        { id: contractId },
        {
          $set: {
            price: serverPrice,
            paymentStatus: 'pending-mercadopago',
            status: 'signed-awaiting-payment',
          },
        },
      )

      await DateLock.updateOne(
        { _id: contractDateISO, reservationId },
        {
          $set: {
            status: 'pending',
            expiresAt: holdUntil,
          },
        },
      )

      return res.status(201).json({
        reservation: savedReservation,
        payment: {
          id: order.orderId,
          status: order.status,
        },
        pix: {
          payload: order.qrCode,
          encodedImage: order.qrCodeBase64,
          ticketUrl: order.ticketUrl,
          expirationDate: holdUntil.toISOString(),
        },
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
        description: 'Reserva ClubeOn - ' + displayDate(contractDateISO) + ' - ' + contract.period,
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
            startTime: contract.startTime || '',
            endTime: contract.endTime || '',
            endDateISO: contract.endDateISO || '',
            basePrice: Number(contract.basePrice || serverPrice),
            extrasTotal: Number(contract.extrasTotal || 0),
            extras: Array.isArray(contract.extras) ? contract.extras : [],
            customer: contract.customer,
            price: serverPrice,
            contractId,
            paymentStatus: 'pending-asaas',
            asaasCustomerId: customer.id,
            asaasPaymentId: payment.id,
            asaasStatus: payment.status,
            paymentProvider: 'asaas',
            paymentMethod: 'pix',
            providerCustomerId: customer.id,
            providerPaymentId: payment.id,
            providerStatus: payment.status,
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
          startTime: contract.startTime || '',
          endTime: contract.endTime || '',
          endDateISO: contract.endDateISO || '',
          basePrice: Number(contract.basePrice || serverPrice),
          extrasTotal: Number(contract.extrasTotal || 0),
          extras: Array.isArray(contract.extras) ? contract.extras : [],
          customer: contract.customer,
          price: serverPrice,
          contractId,
          paymentStatus,
          asaasCustomerId: customer.id,
          asaasPaymentId: payment.id,
          asaasStatus: payment.status,
          paymentProvider: 'asaas',
          providerCustomerId: customer.id,
          providerPaymentId: payment.id,
          providerStatus: payment.status,
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

    if (reservation.paymentProvider === 'mercadopago') {
      if (
        reservation.paymentMethod === 'card' &&
        reservation.paymentStatus === 'pending-mercadopago'
      ) {
        const payment = await masterBillingRequest(
          '/api/license/mercadopago/payments/by-reference/' + encodeURIComponent(reservation.id),
        )

        if (!payment?.found) {
          return res.json({
            paid: false,
            reservation,
            providerStatus: reservation.providerStatus || 'checkout_created',
            asaasStatus: reservation.providerStatus || 'checkout_created',
          })
        }

        const amountMatches =
          Number(payment.amount || 0).toFixed(2) === Number(reservation.price || 0).toFixed(2)

        if (
          payment.externalReference === reservation.id &&
          amountMatches &&
          payment.status === 'approved'
        ) {
          const result = await markPaymentReceived(
            reservation,
            {
              id: payment.paymentId,
              status: 'APPROVED',
              paymentDate: payment.dateApproved ? new Date(payment.dateApproved) : new Date(),
            },
            'MERCADOPAGO_CHECKOUT_STATUS',
            'mercadopago',
          )

          return res.json({
            paid: !result?.manualReview,
            manualReview: Boolean(result?.manualReview),
            ...result,
            providerStatus: payment.status,
            asaasStatus: payment.status,
          })
        }

        if (['rejected', 'cancelled', 'cancelled_by_collector'].includes(payment.status)) {
          await DateLock.deleteOne({
            _id: reservation.dateISO,
            reservationId: reservation.id,
            status: 'pending',
          })

          const updated = await Reservation.findOneAndUpdate(
            { id: reservation.id, paymentStatus: { $ne: 'paid' } },
            {
              $set: {
                paymentStatus: 'awaiting-payment',
                providerStatus: payment.status,
                providerPaymentId: null,
                providerCheckoutUrl: null,
                holdUntil: null,
              },
            },
            { new: true },
          ).lean()

          return res.json({
            paid: false,
            expired: true,
            reservation: updated,
            providerStatus: payment.status,
            asaasStatus: payment.status,
          })
        }

        const updated = await Reservation.findOneAndUpdate(
          { id: reservation.id, paymentStatus: { $ne: 'paid' } },
          {
            $set: {
              providerStatus: payment.statusDetail
                ? payment.status + ':' + payment.statusDetail
                : payment.status,
            },
          },
          { new: true },
        ).lean()

        return res.json({
          paid: false,
          reservation: updated,
          providerStatus: payment.status,
          asaasStatus: payment.status,
        })
      }

      if (!reservation.providerPaymentId) {
        return res.status(400).json({ error: 'Esta reserva ainda não possui cobrança Mercado Pago.' })
      }

      const order = await masterBillingRequest(
        '/api/license/mercadopago/orders/' + encodeURIComponent(reservation.providerPaymentId),
      )
      const providerStatus = order.status || 'unknown'
      const providerStatusDetail = order.statusDetail || ''

      if (providerStatus === 'processed' && providerStatusDetail === 'accredited') {
        const result = await markPaymentReceived(
          reservation,
          {
            id: order.orderId,
            status: 'PROCESSED',
            paymentDate: new Date(),
          },
          'MERCADOPAGO_STATUS_CHECK',
          'mercadopago',
        )

        return res.json({
          paid: !result?.manualReview,
          manualReview: Boolean(result?.manualReview),
          ...result,
          providerStatus,
          challengeUrl: order.challengeUrl || null,
          asaasStatus: providerStatus,
        })
      }

      if (['canceled', 'expired', 'failed'].includes(providerStatus)) {
        await DateLock.deleteOne({
          _id: reservation.dateISO,
          reservationId: reservation.id,
          status: 'pending',
        })

        const updated = await Reservation.findOneAndUpdate(
          { id: reservation.id },
          {
            $set: {
              paymentStatus: 'expired',
              providerStatus,
              holdUntil: null,
            },
          },
          { new: true },
        ).lean()

        await Contract.updateOne(
          { id: reservation.contractId, paymentStatus: { $ne: 'paid' } },
          { $set: { paymentStatus: 'expired' } },
        )

        return res.json({
          paid: false,
          expired: true,
          reservation: updated,
          providerStatus,
          asaasStatus: providerStatus,
        })
      }

      const updated = await Reservation.findOneAndUpdate(
        { id: reservation.id },
        {
          $set: {
            providerStatus: providerStatusDetail
              ? providerStatus + ':' + providerStatusDetail
              : providerStatus,
          },
        },
        { new: true },
      ).lean()

      return res.json({
        paid: false,
        reservation: updated,
        providerStatus,
        challengeUrl: order.challengeUrl || null,
        asaasStatus: providerStatus,
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

        const cancellationUpdate = event === 'PAYMENT_REFUNDED'
          ? {
              reservationStatus: 'cancelled',
              'cancellation.refundStatus': 'provider-confirmed',
              'cancellation.refundRecordedAt': new Date(),
            }
          : { reservationStatus: 'cancelled' }

        await Reservation.updateOne(
          { id: reservation.id },
          {
            $set: {
              paymentStatus: status,
              asaasStatus: payment?.status || event,
              ...cancellationUpdate,
            },
          },
        )

        await Contract.updateOne(
          { id: reservation.contractId },
          {
            $set: {
              paymentStatus: status,
              status: 'cancelled',
              ...(event === 'PAYMENT_REFUNDED'
                ? {
                    'cancellation.refundStatus': 'provider-confirmed',
                    'cancellation.refundRecordedAt': new Date(),
                  }
                : {}),
            },
          },
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
    res.setHeader('Cache-Control', 'no-store')
    res.send(png)
  } catch (error) {
    next(error)
  }
})

app.post('/api/reservations/lookup', lookupLimiter, async (req, res, next) => {
  try {
    const code = textValue(req.body?.code, 60).toUpperCase()
    const cpf = onlyDigits(req.body?.cpf)

    const bookingLicense = await checkMasterLicense({ force: true })

    if (!isValidId(code, 'ESP') || !isBookingCpfValid(cpf, bookingLicense.demoMode, isValidCpf)) {
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

app.post('/api/admin/push/test-background', requireAdmin, async (req, res, next) => {
  try {
    const endpoint = textValue(req.body?.endpoint, 2000)
    if (!endpoint) {
      return res.status(400).json({ error: 'Dispositivo não informado.' })
    }

    const exists = await PushSubscription.findOne({ endpoint, enabled: true }).lean()
    if (!exists) {
      return res.status(404).json({ error: 'Este dispositivo não está mais cadastrado.' })
    }

    res.json({
      ok: true,
      message: 'Teste agendado para 15 segundos.',
    })

    setTimeout(async () => {
      try {
        await sendPushNotification(
          {
            title: 'Teste em segundo plano',
            body: 'O ClubeOn conseguiu notificar você com o app fechado.',
            url: '/admin',
            tag: 'espacoon-background-test-' + Date.now(),
          },
          endpoint,
        )
      } catch (error) {
        console.warn('Falha no teste Push em segundo plano:', error?.message || error)
      }
    }, 15000)
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/push/test', requireAdmin, async (req, res, next) => {
  try {
    const endpoint = textValue(req.body?.endpoint, 2000) || null
    const result = await sendPushNotification(
      {
        title: 'ClubeOn',
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

    const license = await checkMasterLicense({ force: true })
    const auth = await verifyAdminPasswordAgainstMaster(password, license)
    if (!auth.valid) {
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

app.post('/api/admin/reservations/manual', requireAdmin, publicWriteLimiter, async (req, res, next) => {
  let createdLock = false
  let reservationId = ''

  try {
    const payload = req.body || {}
    const customer = {
      name: textValue(payload.customer?.name, 120),
      cpf: textValue(payload.customer?.cpf, 20),
      phone: textValue(payload.customer?.phone, 30),
      email: textValue(payload.customer?.email, 160),
      address: textValue(payload.customer?.address, 250),
    }
    const dateISO = textValue(payload.dateISO, 10)
    const period = textValue(payload.period, 10)
    const basePrice = Math.round(Number(payload.basePrice || 0) * 100) / 100
    const paymentStatusInput = textValue(payload.paymentStatus, 30)
    const paymentMethod = textValue(payload.paymentMethod, 20)
    const blockDate = payload.blockDate === true
    const manualNote = textValue(payload.manualNote, 1000)
    const requestedAmountPaid = Math.round(Number(payload.amountPaid || 0) * 100) / 100

    if (customer.name.length < 3 || !isValidPhone(customer.phone)) {
      return res.status(400).json({ error: 'Informe nome e telefone válidos do cliente.' })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO) || !isValidPeriod(period)) {
      return res.status(400).json({ error: 'Informe uma data e um período válidos.' })
    }
    if (!Number.isFinite(basePrice) || basePrice <= 0 || basePrice > 1000000) {
      return res.status(400).json({ error: 'Valor do aluguel inválido.' })
    }
    if (!['paid', 'manual-pending', 'manual-deposit'].includes(paymentStatusInput)) {
      return res.status(400).json({ error: 'Status de pagamento manual inválido.' })
    }
    if (!['pix', 'card', 'cash', 'transfer', 'other'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Forma de pagamento manual inválida.' })
    }

    const settings = await currentSettings()
    const configuredStartTimes = allowedStartTimes(settings, period)
    const startTime = textValue(payload.startTime || configuredStartTimes[0], 5)
    if (!configuredStartTimes.includes(startTime)) {
      return res.status(400).json({ error: 'O horário de entrada selecionado não está disponível para este período.' })
    }
    const timeSlot = reservationTimeSlot(dateISO, period, startTime)

    const selectedExtras = selectedExtrasForContract(settings, payload.extras)
    const totalPrice = Math.round((basePrice + selectedExtras.extrasTotal) * 100) / 100

    let amountPaid = 0
    if (paymentStatusInput === 'paid') amountPaid = totalPrice
    if (paymentStatusInput === 'manual-deposit') {
      if (
        !Number.isFinite(requestedAmountPaid) ||
        requestedAmountPaid <= 0 ||
        requestedAmountPaid >= totalPrice
      ) {
        return res.status(400).json({
          error: 'Informe um valor de sinal maior que zero e menor que o total da reserva.',
        })
      }
      amountPaid = requestedAmountPaid
    }

    reservationId =
      'MAN-' +
      dateISO.replaceAll('-', '') +
      '-' +
      crypto.randomBytes(3).toString('hex').toUpperCase()

    const existingLock = await DateLock.findById(dateISO).lean()
    if (existingLock) {
      const expired =
        existingLock.status === 'pending' &&
        existingLock.expiresAt &&
        new Date(existingLock.expiresAt) <= new Date()

      if (expired) {
        const previousReservation = await Reservation.findOne({ id: existingLock.reservationId }).lean()
        if (previousReservation) await resolveExpiredPayment(previousReservation)
      }

      const refreshedLock = await DateLock.findById(dateISO).lean()
      if (refreshedLock) {
        return res.status(409).json({
          error: 'Esta data já possui uma reserva ou pagamento em andamento.',
        })
      }
    }

    const shouldLock = paymentStatusInput === 'paid' || blockDate || paymentStatusInput === 'manual-deposit'
    if (shouldLock) {
      try {
        await DateLock.create({
          _id: dateISO,
          reservationId,
          status: paymentStatusInput === 'paid' ? 'paid' : 'confirmed',
          expiresAt: null,
        })
        createdLock = true
      } catch (error) {
        if (error?.code === 11000) {
          return res.status(409).json({ error: 'Esta data acabou de ser ocupada por outra reserva.' })
        }
        throw error
      }
    }

    const reservation = await Reservation.create({
      id: reservationId,
      day: Number(dateISO.slice(-2)),
      date: displayDate(dateISO),
      dateISO,
      period,
      startTime: timeSlot.startTime,
      endTime: timeSlot.endTime,
      endDateISO: timeSlot.endDateISO,
      basePrice,
      extrasTotal: selectedExtras.extrasTotal,
      extras: selectedExtras.extras,
      price: totalPrice,
      customer,
      paymentStatus: paymentStatusInput,
      paymentProvider: 'manual',
      paymentMethod,
      source: 'manual',
      amountPaid,
      manualNote,
      manualBlockDate: shouldLock,
      paidAt: paymentStatusInput === 'paid' ? new Date() : null,
      providerStatus:
        paymentStatusInput === 'paid'
          ? 'MANUAL_PAID'
          : paymentStatusInput === 'manual-deposit'
            ? 'MANUAL_DEPOSIT'
            : 'MANUAL_PENDING',
      reservationStatus: shouldLock ? 'active' : 'pending-payment',
      holdUntil: null,
    })

    if (paymentStatusInput === 'paid') {
      await notifyPaidReservationPush(reservation.toObject(), 'Reserva manual confirmada')
    }

    res.status(201).json(reservation.toObject())
  } catch (error) {
    if (createdLock && reservationId) {
      await DateLock.deleteOne({ reservationId }).catch(() => {})
    }
    next(error)
  }
})

app.post('/api/admin/reservations/:id/manual-paid', requireAdmin, publicWriteLimiter, async (req, res, next) => {
  let createdLock = false

  try {
    const id = textValue(req.params.id, 60)
    const reservation = await Reservation.findOne({ id }).lean()

    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada.' })
    if (reservation.source !== 'manual' || reservation.paymentProvider !== 'manual') {
      return res.status(409).json({ error: 'Esta ação é exclusiva para reservas manuais.' })
    }
    if (!['manual-pending', 'manual-deposit'].includes(reservation.paymentStatus)) {
      return res.status(409).json({ error: 'Esta reserva manual não está pendente de pagamento.' })
    }
    if (reservation.reservationStatus === 'cancelled') {
      return res.status(409).json({ error: 'Esta reserva foi cancelada.' })
    }

    const existingLock = await DateLock.findById(reservation.dateISO).lean()
    if (existingLock && existingLock.reservationId !== reservation.id) {
      return res.status(409).json({
        error: 'A data foi ocupada por outra reserva. Não é possível marcar este registro como pago.',
      })
    }

    if (!existingLock) {
      try {
        await DateLock.create({
          _id: reservation.dateISO,
          reservationId: reservation.id,
          status: 'paid',
          expiresAt: null,
        })
        createdLock = true
      } catch (error) {
        if (error?.code === 11000) {
          return res.status(409).json({
            error: 'A data acabou de ser ocupada por outra reserva.',
          })
        }
        throw error
      }
    } else {
      await DateLock.updateOne(
        { _id: reservation.dateISO, reservationId: reservation.id },
        { $set: { status: 'paid', expiresAt: null } },
      )
    }

    const paidAt = new Date()
    const saved = await Reservation.findOneAndUpdate(
      {
        id: reservation.id,
        paymentStatus: { $in: ['manual-pending', 'manual-deposit'] },
      },
      {
        $set: {
          paymentStatus: 'paid',
          providerStatus: 'MANUAL_PAID',
          amountPaid: Number(reservation.price || 0),
          paidAt,
          manualBlockDate: true,
          reservationStatus: 'active',
        },
      },
      { new: true },
    ).lean()

    if (!saved) {
      if (createdLock) {
        await DateLock.deleteOne({
          _id: reservation.dateISO,
          reservationId: reservation.id,
          status: 'paid',
        }).catch(() => {})
      }
      return res.status(409).json({ error: 'A reserva foi alterada por outra operação.' })
    }

    await notifyPaidReservationPush(saved, 'Reserva manual paga')

    res.json(saved)
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

    if (!['pending-asaas', 'pending-mercadopago', 'expired', 'cancelled', 'awaiting-payment', 'manual-pending', 'manual-deposit'].includes(reservation.paymentStatus)) {
      return res.status(409).json({
        error: 'Somente tentativas pendentes, expiradas ou canceladas podem ser excluídas por esta opção.',
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

    if (reservation.paymentStatus === 'pending-mercadopago') {
      const payment = await masterBillingRequest(
        '/api/license/mercadopago/payments/by-reference/' + encodeURIComponent(reservation.id),
      )

      if (payment?.found && payment.status === 'approved') {
        const protectedError = new Error(
          'Este pagamento já foi aprovado no Mercado Pago e não pode ser excluído como pendente.'
        )
        protectedError.statusCode = 409
        throw protectedError
      }

      if (reservation.paymentMethod === 'card' && reservation.providerPaymentId) {
        try {
          await masterBillingRequest(
            '/api/license/mercadopago/checkout/preferences/' +
              encodeURIComponent(reservation.providerPaymentId) +
              '/expire',
            { method: 'POST' },
          )
        } catch (expireError) {
          const cancelError = new Error(
            'Não foi possível encerrar o checkout do Mercado Pago. A tentativa não foi excluída.'
          )
          cancelError.statusCode = 409
          throw cancelError
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

app.post('/api/admin/reservations/:id/cancel', requireAdmin, async (req, res, next) => {
  try {
    const id = textValue(req.params.id, 60)
    const reason = textValue(req.body?.reason, 500)
    const refundAmount = Math.round(Number(req.body?.refundAmount || 0) * 100) / 100

    const reservation = await Reservation.findOne({ id }).lean()
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada.' })

    if (reservation.reservationStatus === 'cancelled') {
      return res.status(409).json({ error: 'Esta reserva já foi cancelada.' })
    }

    if (reservation.paymentStatus !== 'paid') {
      return res.status(409).json({
        error: 'Somente reservas com pagamento recebido podem ser canceladas por este fluxo.',
      })
    }

    if (reason.length < 5) {
      return res.status(400).json({ error: 'Informe o motivo do cancelamento.' })
    }

    if (!Number.isFinite(refundAmount) || refundAmount < 0 || refundAmount > Number(reservation.price || 0)) {
      return res.status(400).json({ error: 'Valor de reembolso inválido.' })
    }

    const cancellation = {
      reason,
      cancelledAt: new Date(),
      refundAmount,
      refundStatus: refundAmount > 0 ? 'pending' : 'none',
      refundRecordedAt: null,
    }

    const saved = await Reservation.findOneAndUpdate(
      { id, reservationStatus: { $ne: 'cancelled' } },
      { $set: { reservationStatus: 'cancelled', cancellation } },
      { new: true },
    ).lean()

    if (!saved) return res.status(409).json({ error: 'A reserva já foi alterada.' })

    await Promise.all([
      reservation.contractId
        ? Contract.updateOne(
            { id: reservation.contractId },
            { $set: { status: 'cancelled', cancellation } },
          )
        : Promise.resolve(),
      DateLock.deleteOne({
        _id: reservation.dateISO,
        reservationId: reservation.id,
      }),
    ])

    res.json(saved)
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/reservations/:id/refund-recorded', requireAdmin, async (req, res, next) => {
  try {
    const id = textValue(req.params.id, 60)
    const reservation = await Reservation.findOne({ id }).lean()

    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada.' })
    if (reservation.reservationStatus !== 'cancelled') {
      return res.status(409).json({ error: 'A reserva ainda não foi cancelada.' })
    }

    const refundAmount = Number(reservation.cancellation?.refundAmount || 0)
    if (refundAmount <= 0) {
      return res.status(409).json({ error: 'Esta reserva não possui reembolso a registrar.' })
    }

    if (reservation.cancellation?.refundStatus !== 'pending') {
      return res.status(409).json({ error: 'O reembolso desta reserva já foi registrado.' })
    }

    const cancellation = {
      ...(reservation.cancellation || {}),
      refundStatus: 'recorded',
      refundRecordedAt: new Date(),
    }

    const saved = await Reservation.findOneAndUpdate(
      { id, 'cancellation.refundStatus': 'pending' },
      { $set: { cancellation } },
      { new: true },
    ).lean()

    await Contract.updateOne(
      { id: reservation.contractId },
      { $set: { cancellation } },
    )

    res.json(saved)
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

      if (
        update.status === 'rejected' &&
        textValue(update.ownerMessage, 300).length < 3
      ) {
        return res.status(400).json({
          error: 'Informe uma justificativa antes de recusar a visita.',
        })
      }

      if (
        update.status === 'counter-proposed' &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(String(update.confirmedDate || '')) ||
          !/^\d{2}:\d{2}$/.test(String(update.confirmedTime || '')))
      ) {
        return res.status(400).json({
          error: 'Informe a nova data e o novo horário antes de sugerir outro horário.',
        })
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
    const brandMigration = {}

    if (settings.establishment?.name === 'EspaçoOn') {
      brandMigration['establishment.name'] = 'ClubeOn'
    }
    if (settings.branding?.primaryColor === '#0f3554') {
      brandMigration['branding.primaryColor'] = '#1f2937'
    }
    if (settings.branding?.secondaryColor === '#1f8efa') {
      brandMigration['branding.secondaryColor'] = '#1769ff'
    }
    if (settings.branding?.accentColor === '#53b9ff') {
      brandMigration['branding.accentColor'] = '#76d900'
    }

    if (Object.keys(brandMigration).length) {
      await Settings.updateOne({ key: 'main' }, { $set: brandMigration })
    }

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
    if (MASTER_LICENSE_CONFIGURED) {
      await bindDeploymentDatabase(DeploymentIdentity, MASTER_CLUB_ID, {
        verifyLicense: () => checkMasterLicense({ force: true }),
      })
    }
    await migrateProductionData()
    if (MASTER_LICENSE_CONFIGURED) await checkMasterLicense({ force: true })

    console.log('Banco de dados conectado.')
    app.listen(PORT, '0.0.0.0', () => {
      console.log('ClubeOn em produção na porta ' + PORT)
      startReservationReminderScheduler()
      startDatabaseBackupScheduler()
    })
  } catch (error) {
    console.error('Falha ao iniciar o ClubeOn:', error?.message || error)
    process.exit(1)
  }
}

async function shutdown(signal) {
  console.log(signal + ' recebido. Encerrando conexões...')
  try {
    if (reservationReminderTimer) clearInterval(reservationReminderTimer)
    if (backupTimer) clearInterval(backupTimer)
    if (backupConnection) await backupConnection.close().catch(() => {})
    await mongoose.connection.close()
  } finally {
    process.exit(0)
  }
}

// Importing the app for tests must not connect to MongoDB or start schedulers.
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.once('SIGTERM', () => shutdown('SIGTERM'))
  process.once('SIGINT', () => shutdown('SIGINT'))
  start()
}

export { app, isValidCpf, priceForDate, selectedExtrasForContract, reservationTimeSlot, contractHash }

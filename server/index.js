import express from 'express'
import mongoose from 'mongoose'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import multer from 'multer'
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
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-render'

if (!MONGODB_URI) {
  console.warn('MONGODB_URI is not configured.')
}

app.use(express.json({ limit: '12mb' }))
app.use(cookieParser())

const reservationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    day: Number,
    date: String,
    period: String,
    price: Number,
    customer: {
      name: String,
      cpf: String,
      phone: String,
      address: String,
    },
    paymentStatus: { type: String, default: 'awaiting-payment' },
    contractId: String,
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
    status: { type: String, default: 'signed-awaiting-payment-demo' },
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

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'main', unique: true },
    prices: mongoose.Schema.Types.Mixed,
    blockedDays: [Number],
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

app.get('/api/availability', async (_req, res, next) => {
  try {
    const [reservations, settings] = await Promise.all([
      Reservation.find({ paymentStatus: 'approved-simulated' }, { day: 1, date: 1, _id: 0 }).lean(),
      Settings.findOne({ key: 'main' }, { blockedDays: 1, _id: 0 }).lean(),
    ])
    res.json({
      reservedDays: reservations.map((item) => Number(item.day)).filter(Boolean),
      blockedDays: settings?.blockedDays || [],
    })
  } catch (error) {
    next(error)
  }
})

app.put('/api/admin/settings', requireAdmin, async (req, res, next) => {
  try {
    const allowed = ['prices', 'blockedDays', 'specialDates', 'rentalHours', 'gallery', 'amenities']
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

app.post('/api/payments/simulate', async (req, res, next) => {
  try {
    const { reservation, contract } = req.body || {}
    if (!reservation?.id || !contract?.id) {
      return res.status(400).json({ error: 'Dados de pagamento inválidos.' })
    }

    const paidAt = new Date()
    const savedReservation = await Reservation.findOneAndUpdate(
      { id: reservation.id },
      {
        $set: {
          ...reservation,
          paymentStatus: 'approved-simulated',
          contractId: contract.id,
          paidAt,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean()

    const savedContract = await Contract.findOneAndUpdate(
      { id: contract.id },
      {
        $set: {
          ...contract,
          paymentStatus: 'approved-simulated',
          status: 'signed-paid-demo',
          paidAt,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean()

    res.json({ reservation: savedReservation, contract: savedContract })
  } catch (error) {
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
  res.status(500).json({ error: 'Erro interno do servidor.' })
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

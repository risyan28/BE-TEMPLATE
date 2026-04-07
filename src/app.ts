// src/app.ts
// ============================================================
// Express app setup
// Tambahkan route baru di blok "Routes" di bawah
// ============================================================
import express from 'express'
import cors from 'cors'
import compression from 'compression'
import { itemRouter } from '@/routes/item.routes'
import { healthRouter } from '@/routes/health.routes'
import { logsRouter } from '@/routes/logs.routes'
import { pushRouter } from '@/routes/push.routes'
import { quotationRouter } from '@/routes/quotation.routes'
import { authRouter } from '@/routes/auth.routes'
import { usersRouter } from '@/routes/users.routes'
import { filesRouter } from '@/routes/files.routes'
import { serveSignature } from '@/controllers/files.controller'
import { customersRouter } from '@/routes/customers.routes'
import { positionsRouter } from '@/routes/positions.routes'
import { workgroupsRouter } from '@/routes/workgroups.routes'
import { authenticate } from '@/middleware/authenticate'
import { errorHandler } from '@/middleware/errorHandler'
import { jsonDateSerializer } from '@/middleware/jsonDateSerializer'
import { requestLogger } from '@/middleware/requestLogger'
import { apiLimiter } from '@/middleware/rateLimiter'
import { cacheControl } from '@/middleware/cacheControl'
import { setupSwagger } from '@/config/swagger'
import { CORS_DEFAULTS } from '@/config/constants'

const app = express()

// ── Compression (Gzip/Brotli) ─────────────────────────────────
app.use(compression())

// ── CORS ─────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['*']

app.use(
  cors({
    origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
    credentials: true,
    maxAge: CORS_DEFAULTS.MAX_AGE,
  }),
)

app.use(express.json())
app.use(jsonDateSerializer)
app.use(requestLogger)
app.use(cacheControl) // Add Cache-Control headers to GET responses

// ── Swagger Docs ─────────────────────────────────────────────
setupSwagger(app)

// Public router for signature images — img tags cannot send JWT headers
const serveSignaturePublic = express.Router()
serveSignaturePublic.get('/:filename', serveSignature)

// ── Routes ───────────────────────────────────────────────────
app.use('/api/health', healthRouter) // ← no rate limit
app.use('/api/logs', logsRouter) // ← FE log receiver
app.use('/api/auth', authRouter) // ← login / register / refresh
app.use('/api/items', apiLimiter, itemRouter) // ← sample resource

app.use('/api/push', authenticate, pushRouter) // push subscribe + notify
app.use('/api/notifications', authenticate, pushRouter) // notification center (GET/PATCH)
app.use('/api/quotations', authenticate, quotationRouter) // quotation CRUD + workflow
app.use('/api/users', authenticate, usersRouter) // user options for FE forms
app.use('/api/files/signatures', serveSignaturePublic) // ← public: img tags can't send JWT
app.use('/api/files', authenticate, filesRouter) // file upload + serving
app.use('/api/customers', authenticate, customersRouter) // master data customer
app.use('/api/positions', authenticate, positionsRouter) // master data position
app.use('/api/workgroups', authenticate, workgroupsRouter) // workflow work groups

// ✅ TAMBAH ROUTE BARU DI SINI:
// import { xxxRouter } from '@/routes/xxx.routes'
// app.use('/api/xxx', apiLimiter, xxxRouter)

// ── Error Handler (harus paling terakhir) ────────────────────
app.use(errorHandler)

export { app }

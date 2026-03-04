// src/app.ts
// ============================================================
// Express app setup
// Tambahkan route baru di blok "Routes" di bawah
// ============================================================
import express from 'express'
import cors from 'cors'
import { itemRouter } from '@/routes/item.routes'
import { healthRouter } from '@/routes/health.routes'
import { logsRouter } from '@/routes/logs.routes'
import { errorHandler } from '@/middleware/errorHandler'
import { requestLogger } from '@/middleware/requestLogger'
import { apiLimiter } from '@/middleware/rateLimiter'
import { setupSwagger } from '@/config/swagger'
import { CORS_DEFAULTS } from '@/config/constants'

const app = express()

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
app.use(requestLogger)

// ── Swagger Docs ─────────────────────────────────────────────
setupSwagger(app)

// ── Routes ───────────────────────────────────────────────────
app.use('/api/health', healthRouter) // ← no rate limit
app.use('/api/logs', logsRouter) // ← FE log receiver
app.use('/api/items', apiLimiter, itemRouter) // ← sample resource

// ✅ TAMBAH ROUTE BARU DI SINI:
// import { xxxRouter } from '@/routes/xxx.routes'
// app.use('/api/xxx', apiLimiter, xxxRouter)

// ── Error Handler (harus paling terakhir) ────────────────────
app.use(errorHandler)

export { app }

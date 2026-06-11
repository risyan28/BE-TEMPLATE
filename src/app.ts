import express from 'express'
import cors from 'cors'
import compression from 'compression'
import { authRouter } from '@/modules/auth/auth.routes'
import { healthRouter } from '@/modules/health/health.routes'
import { logsRouter } from '@/modules/logs/logs.routes'
import { itemRouter } from '@/modules/item/item.routes'
import { authenticate } from '@/shared/middleware/authenticate'
import { errorHandler } from '@/shared/middleware/errorHandler'
import { jsonDateSerializer } from '@/shared/middleware/jsonDateSerializer'
import { requestLogger } from '@/shared/middleware/requestLogger'
import { apiLimiter } from '@/shared/middleware/rateLimiter'
import { cacheControl } from '@/shared/middleware/cacheControl'
import { setupSwagger } from '@/shared/config/swagger'
import { CORS_DEFAULTS } from '@/shared/config/constants'

const app = express()

// ── Compression ──────────────────────────────────────────
app.use(compression())

// ── CORS ─────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['*']

app.use(cors({
  origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
  credentials: true,
  maxAge: CORS_DEFAULTS.MAX_AGE,
}))

app.use(express.json())
app.use(jsonDateSerializer)
app.use(requestLogger)
app.use(cacheControl)

// ── Swagger Docs ─────────────────────────────────────────
setupSwagger(app)

// ── Routes ───────────────────────────────────────────────
app.use('/api/health', healthRouter)
app.use('/api/logs', logsRouter)
app.use('/api/auth', authRouter)
app.use('/api/items', apiLimiter, itemRouter)

// ✅ ADD NEW ROUTES HERE:
// import { xxxRouter } from '@/modules/xxx/xxx.routes'
// app.use('/api/xxx', apiLimiter, xxxRouter)

// ── Error Handler ────────────────────────────────────────
app.use(errorHandler)

export { app }

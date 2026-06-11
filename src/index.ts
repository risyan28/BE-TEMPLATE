import dotenv from 'dotenv'
dotenv.config()

import 'module-alias/register'

import {
  initializeOpenTelemetry,
  shutdownOpenTelemetry,
} from '@/shared/config/telemetry'
initializeOpenTelemetry()
import { createServer } from 'http'
import { app } from './app'
import { setupWebSocket } from './ws/setup'
import { logStartupInfo } from '@/shared/lib/startupLogger'
import { gracefulShutdown } from '@/shared/lib/gracefulShutdown'
import prisma from '@/shared/lib/prisma'
import { initializeSentry } from '@/shared/config/sentry'
import { createRedisClient, disconnectRedis } from '@/shared/config/redis'
import { SERVER } from '@/shared/config/constants'
import { loggers } from '@/shared/lib/logger'

const PORT = Number(process.env.PORT) || SERVER.DEFAULT_PORT
const httpServer = createServer(app)

// ✅ Initialize Sentry (must be before app initialization)
initializeSentry(app)

// ✅ Initialize Redis cache
createRedisClient()

// Setup WebSocket
setupWebSocket(httpServer)

// optional: test database connection (non-blocking — no exit on failure)
;(async () => {
  try {
    await prisma.$connect()
    loggers.db.info('Prisma database connection established')
  } catch (err: any) {
    const errorMsg = err.code || err.message || 'Unknown error'
    loggers.db.warn(
      { error: errorMsg },
      'Database unavailable — app will run with limited functionality',
    )
  }
})()

// Jalankan server dengan retry logic untuk handle EADDRINUSE
const startServer = (retries = 3, delay = 2000) => {
  const handleError = (err: NodeJS.ErrnoException) => {
    httpServer.off('error', handleError)

    if (err.code === 'EADDRINUSE' && retries > 0) {
      loggers.server.warn(
        { port: PORT, retriesLeft: retries - 1, delay },
        'Port in use, retrying...',
      )

      setTimeout(() => {
        httpServer.close(() => startServer(retries - 1, delay))
      }, delay)
      return
    }

    if (err.code === 'EADDRINUSE') {
      loggers.server.fatal(
        { port: PORT },
        'Port still in use after retries. Please run: pnpm run stop',
      )
      process.exit(1)
    }

    const errorMsg = err.code || err.message || 'Unknown error'
    loggers.server.fatal({ error: errorMsg }, 'Server error')
    process.exit(1)
  }

  httpServer.once('error', handleError)

  httpServer.listen(PORT, '0.0.0.0', () => {
    httpServer.off('error', handleError)
    logStartupInfo(PORT)
    loggers.server.info(
      {
        redis: process.env.REDIS_ENABLED === 'true',
        sentry: process.env.SENTRY_ENABLED === 'true',
        otel: process.env.OTEL_ENABLED === 'true',
      },
      'Phase 2 features initialized',
    )
  })
}

startServer()

// ✅ Graceful shutdown handlers with complete cleanup
const handleShutdown = async (signal: string) => {
  loggers.server.info({ signal }, 'Shutting down gracefully...')
  await Promise.all([disconnectRedis(), shutdownOpenTelemetry()])
  gracefulShutdown(httpServer, signal)
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'))
process.on('SIGINT', () => handleShutdown('SIGINT'))

// Handle uncaught errors with structured logging
process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  const errorMsg =
    (err as NodeJS.ErrnoException).code || err.message || String(err)
  loggers.server.fatal({ error: errorMsg }, 'Uncaught Exception')
  handleShutdown('uncaughtException')
})

process.on('unhandledRejection', (reason: any) => {
  const errorMsg = reason?.code || reason?.message || String(reason)
  loggers.server.fatal({ error: errorMsg }, 'Unhandled Rejection')
  handleShutdown('unhandledRejection')
})

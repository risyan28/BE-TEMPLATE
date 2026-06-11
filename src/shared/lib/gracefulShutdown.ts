import { Server } from 'http'
import { getIO } from '@/ws/connectionHandler'
import prisma from '@/shared/lib/prisma'
import { SERVER } from '@/shared/config/constants'
import { loggers } from '@/shared/lib/logger'

export async function gracefulShutdown(
  httpServer: Server,
  signal: string,
): Promise<void> {
  loggers.server.info({ signal }, 'Starting graceful shutdown...')

  const forceShutdownTimer = setTimeout(() => {
    loggers.server.fatal('Graceful shutdown timeout, forcing exit...')
    process.exit(1)
  }, SERVER.SHUTDOWN_TIMEOUT_MS)

  try {
    loggers.server.info('Closing HTTP server...')
    try {
      httpServer.closeAllConnections?.()

      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => {
          if (err) reject(err)
          else resolve()
        })
      })
      loggers.server.info('HTTP server closed')
    } catch (err: any) {
      if (err.code === 'ERR_SERVER_NOT_RUNNING') {
        loggers.server.info('HTTP server already closed')
      } else {
        loggers.server.error('Error closing HTTP server', err)
      }
    }

    loggers.server.info('Closing WebSocket connections...')
    try {
      const io = getIO()
      io.close()
      loggers.server.info('WebSocket connections closed')
    } catch {
      loggers.server.info('No active WebSocket connections')
    }

    loggers.server.info('Closing database connections...')
    await prisma.$disconnect()
    loggers.server.info('Database connections closed')

    clearTimeout(forceShutdownTimer)
    loggers.server.info('Graceful shutdown completed')

    await new Promise((resolve) => setTimeout(resolve, 1000))
    process.exit(0)
  } catch (err) {
    loggers.server.fatal(
      { error: (err as any).code || (err as any).message || String(err) },
      'Error during graceful shutdown',
    )
    clearTimeout(forceShutdownTimer)
    process.exit(1)
  }
}

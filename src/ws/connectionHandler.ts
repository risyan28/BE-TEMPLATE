import { Server, Socket } from 'socket.io'
import { getConnection } from '@/shared/lib/db'
import { CORS_DEFAULTS } from '@/shared/config/constants'
import { loggers } from '@/shared/lib/logger'

let io: Server | null = null

const activePollings = new Map<string, { stop: () => void }>()

interface TopicConfig {
  eventName: string
  pollingModule: any
  requiresMSSQL?: boolean
}

const topicConfig = new Map<string, TopicConfig>()

function getAllowedOrigins(): string | string[] {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
    : ['*']
  return allowedOrigins.includes('*') ? '*' : allowedOrigins
}

function getSubscriberCount(topic: string): number {
  return io!.sockets.adapter.rooms.get(topic)?.size || 0
}

async function sendSnapshot(socket: Socket, topic: string, config: TopicConfig) {
  try {
    const snapshot = await config.pollingModule.pollingLogic(
      await getConnection(),
    )
    socket.emit(config.eventName, snapshot)
    loggers.ws.info(`Sent initial snapshot to ${socket.id} for topic: ${topic}`)
  } catch (err: any) {
    const errorMsg = err.code || err.message || 'Unknown error'
    loggers.ws.error(`Snapshot error for ${topic} (${socket.id}): ${errorMsg}`)
    socket.emit(`${config.eventName}:error`, {
      message: 'Failed to fetch initial data. Database may be unavailable.',
      error: errorMsg,
    })
  }
}

async function startPollingForTopic(io: Server, topic: string, config: TopicConfig) {
  try {
    const pollingResult = await config.pollingModule.start(io, topic)
    if (pollingResult?.stop) {
      if (!activePollings.has(topic)) {
        activePollings.set(topic, pollingResult)
      }
    } else {
      loggers.ws.error(`Invalid polling result for ${topic}`)
    }
  } catch (err: any) {
    const errorMsg = err.code || err.message || 'Unknown error'
    loggers.ws.error(`Failed to start polling for ${topic}: ${errorMsg}`)
  }
}

export function initConnectionHandler(
  server: any,
  pollings: { name: string; module: any; eventName: string; requiresMSSQL?: boolean }[],
) {
  io = new Server(server, {
    cors: {
      origin: getAllowedOrigins(),
      credentials: true,
      maxAge: CORS_DEFAULTS.MAX_AGE,
    },
    transports: ['polling', 'websocket'],
  })

  for (const { name, module, eventName } of pollings) {
    topicConfig.set(name, { eventName, pollingModule: module })
  }

  io.on('connection', async (socket: Socket) => {
    loggers.ws.info(`Client connected: ${socket.id}`)

    socket.on('subscribe', async (topic: string) => {
      const config = topicConfig.get(topic)
      if (!config) {
        loggers.ws.warn(`Unknown subscription topic: ${topic}`)
        return
      }

      socket.join(topic)
      loggers.ws.info(`Client ${socket.id} subscribed to: ${topic}`)

      if (getSubscriberCount(topic) === 1) {
        await startPollingForTopic(io!, topic, config)
      } else {
        loggers.ws.info(
          `Client ${socket.id} joining existing room ${topic} (${getSubscriberCount(topic)} subscribers)`,
        )
      }

      await sendSnapshot(socket, topic, config)
    })

    socket.on('sync', async (topic: string) => {
      const config = topicConfig.get(topic)
      if (!config) {
        loggers.ws.warn(`Unknown sync topic: ${topic}`)
        return
      }

      try {
        let pool: any = null
        if (config.requiresMSSQL) {
          try {
            pool = await getConnection()
          } catch {
            // MSSQL unavailable
          }
        }
        const snapshot = await config.pollingModule.pollingLogic(pool)
        socket.emit(config.eventName, snapshot)
        loggers.ws.info(`Manual sync sent to ${socket.id} for topic: ${topic}`)
      } catch (err: any) {
        const errorMsg = err.code || err.message || 'Unknown error'
        loggers.ws.error(`Sync error for ${topic} (${socket.id}): ${errorMsg}`)
        socket.emit(`${config.eventName}:error`, {
          message: 'Failed to sync data. Database may be unavailable.',
          error: errorMsg,
        })
      }
    })

    socket.on('unsubscribe', (topic: string) => {
      socket.leave(topic)
      loggers.ws.info(`Client ${socket.id} unsubscribed from: ${topic}`)

      if (getSubscriberCount(topic) === 0) {
        const polling = activePollings.get(topic)
        if (polling) {
          polling.stop()
          activePollings.delete(topic)
        }
      }
    })

    socket.on('disconnect', () => {
      loggers.ws.info(`Client disconnected: ${socket.id}`)
    })
  })

  return io
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO not initialized!')
  return io
}

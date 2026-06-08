import sql from 'mssql'
import { getConnection } from '@/utils/db'
import { POLLING } from '@/config/constants'
import { loggers } from '@/utils/logger'

async function loadCursor(
  pool: sql.ConnectionPool,
  tableName: string,
): Promise<number | null> {
  const res = await pool
    .request()
    .input('table_name', sql.NVarChar, tableName)
    .query(`SELECT last_lsn FROM CDC_CURSOR WHERE table_name = @table_name`)
  if (!res.recordset[0]?.last_lsn) return null
  return Number(res.recordset[0].last_lsn)
}

async function saveCursor(
  pool: sql.ConnectionPool,
  tableName: string,
  version: number,
) {
  await pool
    .request()
    .input('table_name', sql.NVarChar, tableName)
    .input('version', sql.BigInt, version).query(`
      MERGE CDC_CURSOR AS target
      USING (SELECT @table_name AS table_name) AS source
      ON target.table_name = source.table_name
      WHEN MATCHED THEN
          UPDATE SET last_lsn = @version, updated_at = GETDATE()
      WHEN NOT MATCHED THEN
          INSERT (table_name, last_lsn) VALUES (@table_name, @version);
    `)
}

function createPollingCallback<T>({
  io,
  room,
  intervalMs,
  eventName,
  tableName,
  pollingLogic,
  onChangeDetected,
  lastVersionRef,
  retryCountRef,
  pollingIntervalRef,
}: {
  io: any
  room: string
  intervalMs: number
  eventName: string
  tableName: string
  pollingLogic: (pool: sql.ConnectionPool) => Promise<T>
  onChangeDetected?: () => Promise<void>
  lastVersionRef: { current: number | null }
  retryCountRef: { current: number }
  pollingIntervalRef: { current: NodeJS.Timeout | null }
}) {
  return async () => {
    try {
      const pool = await getConnection()
      const result = await pool
        .request()
        .input('lastVersion', sql.BigInt, lastVersionRef.current ?? 0).query(`
          SELECT *
          FROM CHANGETABLE(CHANGES dbo.[${tableName}], @lastVersion) AS c
        `)

      if (result.recordset.length > 0) {
        const maxVersion = Math.max(
          ...result.recordset.map((r) => Number(r.SYS_CHANGE_VERSION)),
        )
        await saveCursor(pool, tableName, maxVersion)
        lastVersionRef.current = maxVersion

        if (onChangeDetected) {
          await onChangeDetected()
        }

        const snapshot = await pollingLogic(pool)
        io.to(room).emit(eventName, snapshot)
        loggers.ws.info(
          `Broadcast ${tableName} to room ${room} (changes: ${result.recordset.length}, newVersion: ${maxVersion})`,
        )

        retryCountRef.current = 0
      }
    } catch (err: any) {
      retryCountRef.current++
      const errorMsg = err.code || err.message || 'Unknown error'
      loggers.ws.error(
        `Polling error for ${tableName} (attempt ${retryCountRef.current}/${POLLING.MAX_RETRIES}): ${errorMsg}`,
      )

      io.to(room).emit(`${eventName}:error`, {
        message: 'Database temporarily unavailable',
        retryCount: retryCountRef.current,
        maxRetries: POLLING.MAX_RETRIES,
      })

      if (retryCountRef.current >= POLLING.MAX_RETRIES) {
        loggers.ws.error(
          `Max retries exceeded for ${tableName}. Stopping polling for room: ${room}`,
        )
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
          pollingIntervalRef.current = null
        }

        io.to(room).emit(`${eventName}:error`, {
          message: 'Polling stopped due to repeated failures. Please refresh the page.',
          fatal: true,
        })
      }
    }
  }
}

export function createCTPolling<T>({
  tableName,
  eventName,
  intervalMs = POLLING.INTERVAL_MS,
  pollingLogic,
  onChangeDetected,
}: {
  tableName: string
  eventName: string
  intervalMs?: number
  pollingLogic: (pool: sql.ConnectionPool) => Promise<T>
  onChangeDetected?: () => Promise<void>
}) {
  let pollingInterval: NodeJS.Timeout | null = null
  let lastVersion: number | null = null
  let retryCount = 0

  return {
    start: async (io: any, room: string) => {
      if (pollingInterval) {
        loggers.ws.info(`Polling for ${tableName} already running (room: ${room})`)
        return {
          stop: () => {
            loggers.ws.info(`Stop called on already running polling for ${tableName} (room: ${room})`)
          },
        }
      }

      try {
        loggers.ws.info(`Initializing CT polling for ${tableName} (room: ${room})`)
        const pool = await getConnection()
        lastVersion = await loadCursor(pool, tableName)

        const lastVersionRef: { current: number | null } = { current: lastVersion }
        const retryCountRef: { current: number } = { current: retryCount }
        const pollingIntervalRef: { current: NodeJS.Timeout | null } = { current: pollingInterval }

        pollingInterval = setInterval(
          createPollingCallback({
            io,
            room,
            intervalMs,
            eventName,
            tableName,
            pollingLogic,
            onChangeDetected,
            lastVersionRef,
            retryCountRef,
            pollingIntervalRef,
          }),
          intervalMs,
        )

        pollingIntervalRef.current = pollingInterval

        return {
          stop: () => {
            if (pollingInterval) {
              clearInterval(pollingInterval)
              pollingInterval = null
              retryCount = 0
              loggers.ws.info(`Stopped CT polling for ${tableName} (room: ${room})`)
            }
          },
        }
      } catch (initError: any) {
        const errorMsg = initError.code || initError.message || 'Unknown error'
        loggers.ws.error(`Failed to initialize polling for ${tableName} (room: ${room}): ${errorMsg}`)

        io.to(room).emit(`${eventName}:error`, {
          message: 'Failed to initialize real-time updates. Database may be unavailable.',
          error: errorMsg,
          fatal: true,
        })

        return {
          stop: () => {
            loggers.ws.info(`Dummy stop for failed ${tableName} (room: ${room})`)
          },
        }
      }
    },

    pollingLogic,
  }
}

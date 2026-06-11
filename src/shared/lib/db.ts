import { DATABASE } from '@/shared/config/constants'

function detectDbType(): 'mssql' | 'mysql' {
  const url = process.env.DATABASE_URL || ''
  const explicit = process.env.DB_PROVIDER
  if (explicit === 'mysql' || explicit === 'mssql') return explicit
  if (url.startsWith('mysql://') || url.startsWith('mysql2://')) return 'mysql'
  if (url.startsWith('sqlserver://')) return 'mssql'
  return 'mysql'
}

const dbType = detectDbType()

let pool: any = null
let isConnecting = false

type ConnectionPool = any

export async function getConnection(retryCount = 0): Promise<ConnectionPool> {
  if (pool) {
    try {
      if (dbType === 'mssql' && !pool.connected) {
        await pool.close().catch(() => {})
        pool = null
      } else if (dbType === 'mysql') {
        // mysql2 pool is always "connected" (lazy connections)
        return pool
      }
    } catch {
      pool = null
    }
  }

  if (isConnecting) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    if (pool) return pool
  }

  isConnecting = true

  try {
    if (dbType === 'mysql') {
      const mysql = await import('mysql2/promise')
      pool = mysql.createPool({
        host: process.env.MYSQL_HOST || 'localhost',
        port: Number(process.env.MYSQL_PORT) || 3306,
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'app_template',
        waitForConnections: true,
        connectionLimit: DATABASE.POOL.MAX,
        queueLimit: 0,
      })
      console.log(`✅ [MySQL] Pool created → ${process.env.MYSQL_HOST || 'localhost'}:${process.env.MYSQL_PORT || 3306} / DB: ${process.env.MYSQL_DATABASE || 'app_template'}`)
    } else {
      const sql = await import('mssql')
      pool = await sql.connect({
        user: process.env.MSSQL_USER,
        password: process.env.MSSQL_PASSWORD,
        server: process.env.MSSQL_SERVER || 'localhost',
        database: process.env.MSSQL_DATABASE,
        port: Number(process.env.MSSQL_PORT) || 1433,
        options: { encrypt: false, trustServerCertificate: true },
        pool: {
          max: DATABASE.POOL.MAX,
          min: DATABASE.POOL.MIN,
          idleTimeoutMillis: DATABASE.POOL.IDLE_TIMEOUT_MS,
        },
        connectionTimeout: 15000,
        requestTimeout: 30000,
      })
      console.log(`✅ [MSSQL] Connected → ${process.env.MSSQL_SERVER || 'localhost'}:${process.env.MSSQL_PORT || 1433} / DB: ${process.env.MSSQL_DATABASE}`)
    }

    isConnecting = false
    return pool
  } catch (err: any) {
    isConnecting = false

    if (retryCount < DATABASE.RETRY.MAX_ATTEMPTS) {
      const delay = Math.min(
        DATABASE.RETRY.INITIAL_DELAY_MS * Math.pow(DATABASE.RETRY.BACKOFF_MULTIPLIER, retryCount),
        DATABASE.RETRY.MAX_DELAY_MS,
      )
      console.warn(`⚠️  [${dbType.toUpperCase()}] Connection attempt ${retryCount + 1}/${DATABASE.RETRY.MAX_ATTEMPTS} failed. Retrying in ${delay}ms...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
      return getConnection(retryCount + 1)
    }

    const errorMsg = err.code || err.message || 'Unknown database error'
    console.error(`❌ [${dbType.toUpperCase()}] Failed to connect after ${DATABASE.RETRY.MAX_ATTEMPTS} attempts: ${errorMsg}`)
    const cleanError = new Error(`Database connection failed: ${errorMsg}`)
    cleanError.name = 'DatabaseConnectionError'
    throw cleanError
  }
}

// src/ws/ITEMS/itemPolling.ws.ts
// ============================================================
// Contoh WebSocket polling menggunakan MSSQL Change Tracking
// Duplikat file ini untuk setiap tabel yang ingin di-realtime-kan
//
// CARA KERJA:
// 1. Client subscribe ke topic "items"
// 2. Backend polling CHANGETABLE setiap 2 detik
// 3. Kalau ada perubahan → broadcast ke semua subscriber
//
// SYARAT DI SQL SERVER:
//   ALTER DATABASE [nama_db] SET CHANGE_TRACKING = ON (...)
//   ALTER TABLE TB_R_ITEMS ENABLE CHANGE_TRACKING
//   -- Buat juga tabel CDC_CURSOR:
//   CREATE TABLE CDC_CURSOR (
//     table_name NVARCHAR(100) PRIMARY KEY,
//     last_lsn   BIGINT NOT NULL DEFAULT 0,
//     updated_at DATETIME DEFAULT GETDATE()
//   )
// ============================================================
import { createCTPolling } from '@/ws/poller.ws'
import { cache } from '@/utils/cache'
import { loggers } from '@/utils/logger'

const CACHE_KEY = 'items:all'

export const itemPolling = createCTPolling({
  tableName: 'TB_R_ITEMS', // ← nama tabel di database
  eventName: 'items:update', // ← nama event yang diterima FE: socket.on('items:update', ...)

  // Invalidasi cache saat ada perubahan
  onChangeDetected: async () => {
    await cache.del(CACHE_KEY)
    loggers.cache.debug({ key: CACHE_KEY }, 'Cache invalidated by CT')
  },

  // Logic fetch data — apa yang dikirimkan ke FE
  pollingLogic: async (pool) => {
    const result = await pool.query(`
      SELECT TOP 500 *
      FROM TB_R_ITEMS
      WHERE FSTATUS = 0
      ORDER BY FID ASC
    `)
    return result.recordset
  },
})

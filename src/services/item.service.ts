// src/services/item.service.ts
// ============================================================
// Business logic untuk Item resource (contoh pola service)
// Menggunakan raw MSSQL — tidak bergantung Prisma model generation.
// Ganti nama tabel & kolom sesuai kebutuhan project kamu.
//
// OPSIONAL: Kalau mau pakai Prisma:
//   1. Edit prisma/schema.prisma — tambahkan model kamu
//   2. Jalankan: npx prisma generate
//   3. Import: import prisma from '@/prisma'
//   4. Gunakan: prisma.namaModel.findMany() dst
// ============================================================
import { getConnection } from '@/utils/db'
import { cache } from '@/utils/cache'
import { loggers } from '@/utils/logger'
import { CreateItemDto, UpdateItemDto } from '@/schemas/item.schema'

const CACHE_KEY = 'items:all'
const CACHE_TTL = 60 // seconds

export const itemService = {
  // ── GET ALL ─────────────────────────────────────────────
  async getAll() {
    return cache.getOrSet(
      CACHE_KEY,
      async () => {
        loggers.api.debug('Fetching all items')
        const pool = await getConnection()
        const result = await pool.query(`
          SELECT * FROM TB_R_ITEMS
          WHERE FSTATUS = 0
          ORDER BY FID ASC
        `)
        return result.recordset
      },
      CACHE_TTL,
    )
  },

  // ── GET BY ID ────────────────────────────────────────────
  async getById(id: number) {
    const pool = await getConnection()
    const result = await pool
      .request()
      .input('id', id)
      .query(`SELECT * FROM TB_R_ITEMS WHERE FID = @id`)
    return result.recordset[0] ?? null
  },

  // ── CREATE ───────────────────────────────────────────────
  async create(data: CreateItemDto) {
    const pool = await getConnection()
    await pool
      .request()
      .input('name', data.name)
      .input('description', data.description ?? null)
      .input('status', data.status ?? 0).query(`
        INSERT INTO TB_R_ITEMS (FNAME, FDESCRIPTION, FSTATUS, FDATETIME_CREATED)
        VALUES (@name, @description, @status, GETDATE())
      `)
    await cache.del(CACHE_KEY)
    return { message: 'Item created' }
  },

  // ── UPDATE ───────────────────────────────────────────────
  async update(id: number, data: UpdateItemDto) {
    const pool = await getConnection()
    await pool
      .request()
      .input('id', id)
      .input('name', data.name ?? null)
      .input('description', data.description ?? null)
      .input('status', data.status ?? null).query(`
        UPDATE TB_R_ITEMS
        SET
          FNAME             = ISNULL(@name, FNAME),
          FDESCRIPTION      = ISNULL(@description, FDESCRIPTION),
          FSTATUS           = ISNULL(@status, FSTATUS),
          FDATETIME_MODIFIED = GETDATE()
        WHERE FID = @id
      `)
    await cache.del(CACHE_KEY)
    return { message: 'Item updated', id }
  },

  // ── DELETE ───────────────────────────────────────────────
  async delete(id: number) {
    const pool = await getConnection()
    await pool
      .request()
      .input('id', id)
      .query(`DELETE FROM TB_R_ITEMS WHERE FID = @id`)
    await cache.del(CACHE_KEY)
  },
}

// src/controllers/files.controller.ts
// ============================================================
// File upload and serving controller
// Stores files on disk under /uploads/YYYY-MM-DD/
// based on the ?date= query parameter (Quotation Date)
// ============================================================
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import multer from 'multer'

// ── Upload directory ──────────────────────────────────────────────────────────
export const UPLOAD_DIR = path.join(process.cwd(), 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true, mode: 0o755 })
}

// Validate YYYY-MM-DD format; fallback to today
function resolveUploadDate(raw: unknown): string {
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return new Date().toISOString().split('T')[0]
}

// ── Multer storage config ─────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dateFolder = resolveUploadDate(req.query.date)
    const dir = path.join(UPLOAD_DIR, dateFolder)
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 })
    cb(null, dir)
  },
  filename: (_req, file, cb) => {
    // Keep original filename but sanitize: replace unsafe chars with underscore
    const ext = path.extname(file.originalname)
    const base = path.basename(file.originalname, ext)
    const safe = base
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .slice(0, 180)
    // Add short unique suffix to avoid collision when same name is uploaded
    const suffix = crypto.randomUUID().slice(0, 8)
    cb(null, `${safe}_${suffix}${ext}`)
  },
})

const ALLOWED_MIME = [
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroenabled.12', // .xlsm macro-enabled Excel
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`Tipe file tidak didukung: ${file.mimetype}`))
    }
  },
})

// ─── POST /api/files?date=YYYY-MM-DD ─────────────────────────────────────────
// Upload satu atau lebih file, simpan di /uploads/{date}/, kembalikan metadata + URL
export async function uploadFiles(req: Request, res: Response) {
  const files = req.files as Express.Multer.File[] | undefined
  if (!files || files.length === 0) {
    res.status(400).json({ error: 'Tidak ada file yang diunggah' })
    return
  }

  const dateFolder = resolveUploadDate(req.query.date)

  const result = files.map((f) => ({
    fileId: `${dateFolder}/${f.filename}`, // e.g. "2026-03-29/uuid.pdf"
    originalName: f.originalname,
    size:
      f.size > 1024 * 1024
        ? `${(f.size / 1024 / 1024).toFixed(1)} MB`
        : `${(f.size / 1024).toFixed(0)} KB`,
    type: path.extname(f.originalname).replace('.', '').toUpperCase() || 'FILE',
    url: `/api/files/${dateFolder}/${f.filename}`,
  }))

  res.status(201).json(result)
}

// ─── GET /api/files/:date/:fileId ────────────────────────────────────────────
// Serve stored file — inline for PDF, attachment for others
export function serveFile(req: Request, res: Response) {
  const date = String(req.params.date)
  const { fileId } = req.params

  // Validate date format to prevent path traversal
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'Format tanggal tidak valid' })
    return
  }

  const safeFile = path.basename(String(fileId))
  const filePath = path.join(UPLOAD_DIR, date, safeFile)

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File tidak ditemukan' })
    return
  }

  const ext = path.extname(safeFile).toLowerCase()
  const disposition = ext === '.pdf' ? 'inline' : 'attachment'
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeFile}"`)
  res.sendFile(filePath)
}

// ─── GET /api/files/:fileId (legacy — files tanpa date folder) ───────────────
export function serveFileLegacy(req: Request, res: Response) {
  const safeFile = path.basename(String(req.params.fileId))
  const filePath = path.join(UPLOAD_DIR, safeFile)

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File tidak ditemukan' })
    return
  }

  const ext = path.extname(safeFile).toLowerCase()
  const disposition = ext === '.pdf' ? 'inline' : 'attachment'
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeFile}"`)
  res.sendFile(filePath)
}

// ──────────────────────────────────────────────────────────────────────────────
// ─── SIGNATURE UPLOAD ──────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────────

const SIGNATURE_DIR = path.join(UPLOAD_DIR, 'signatures')
const ALLOWED_SIGNATURE_MIME = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/pdf',
]

const signatureStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(SIGNATURE_DIR)) {
      fs.mkdirSync(SIGNATURE_DIR, { recursive: true, mode: 0o755 })
    }
    cb(null, SIGNATURE_DIR)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    const base = path.basename(file.originalname, ext)
    const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
    const suffix = crypto.randomUUID().slice(0, 8)
    cb(null, `${safe}_${suffix}${ext}`)
  },
})

export const uploadSignature = multer({
  storage: signatureStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB for signatures
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_SIGNATURE_MIME.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`Format signature tidak didukung: ${file.mimetype}`))
    }
  },
}).single('signature')

const prisma = new PrismaClient()

// ─── POST /api/signatures/upload ──────────────────────────────────────────────
// Upload user signature (PNG, JPG, or PDF)
export async function uploadUserSignature(req: Request, res: Response) {
  try {
    const userId: number | undefined =
      req.user?.id ??
      (req.body.userId != null
        ? parseInt(String(req.body.userId), 10)
        : undefined)

    if (!userId) {
      res.status(400).json({ error: 'User ID diperlukan' })
      return
    }

    const file = req.file
    if (!file) {
      res.status(400).json({ error: 'File signature diperlukan' })
      return
    }

    // URLs for signature access — must match the route: /api/files/signatures/:filename
    const signatureUrl = `/api/files/signatures/${file.filename}`

    // Update user signature in database
    await prisma.user.update({
      where: { id: userId },
      data: { signatureUrl },
    })

    res.status(200).json({
      success: true,
      signatureUrl,
      message: 'Signature berhasil diupload',
    })
  } catch (error: any) {
    console.error('Error uploading signature:', error)
    res.status(500).json({
      error: 'Gagal mengupload signature',
      message: error.message,
    })
  }
}

// ─── GET /api/signatures/:filename ────────────────────────────────────────────
// Serve signature file
export function serveSignature(req: Request, res: Response) {
  const filename = path.basename(String(req.params.filename))
  const filePath = path.join(SIGNATURE_DIR, filename)

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Signature tidak ditemukan' })
    return
  }

  res.setHeader('Content-Disposition', 'inline')
  res.sendFile(filePath)
}

// ─── GET /api/users/:userId/signature ─────────────────────────────────────────
// Get user's signature URL
export async function getUserSignatureInfo(req: Request, res: Response) {
  try {
    const userId = parseInt(req.params.userId as string, 10)

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { signatureUrl: true, username: true },
    })

    if (!user) {
      res.status(404).json({ error: 'User tidak ditemukan' })
      return
    }

    res.status(200).json({
      userId,
      username: user.username,
      signatureUrl: user.signatureUrl,
      hasSignature: !!user.signatureUrl,
    })
  } catch (error: any) {
    console.error('Error getting user signature:', error)
    res.status(500).json({ error: 'Gagal mengambil signature user' })
  }
}

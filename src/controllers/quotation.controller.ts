// src/controllers/quotation.controller.ts
// ============================================================
// Quotation CRUD controller
// Auth middleware harus inject req.user sebelum route ini
// ============================================================
import fs from 'fs'
import path from 'path'
import { Request, Response } from 'express'
import prisma from '@/prisma'
import { UPLOAD_DIR } from '@/controllers/files.controller'
import {
  notifyDraftCreated,
  notifySubmittedToManager,
  notifyManagerApproved,
  notifyManagerRejected,
  notifyResubmittedToSalesPic,
  resolveManagerFromWorkGroup,
} from '@/services/quotation.service'
import { addSignatureToExcel } from '@/services/excel-signature.service'
import { generatePdfFromExcel } from '@/services/excel-pdf.service'
import { formatDateTime, toStoredWibDate } from '@/utils/date'
import { broadcastQuotationUpdate } from '@/ws/broadcast'

// Serialize Prisma Date fields → UTC+7 formatted strings before sending to client
function serializeQuotation<T extends Record<string, any>>(q: T): T {
  return {
    ...q,
    createdAt: formatDateTime(q.createdAt),
    updatedAt: formatDateTime(q.updatedAt),
    quotationDate: q.quotationDate ? formatDateTime(q.quotationDate) : null,
    sentToCustomerAt: q.sentToCustomerAt
      ? formatDateTime(q.sentToCustomerAt)
      : null,
  }
}

function extractStoredFiles(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const files = value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []

    const fileId =
      'fileId' in item && typeof item.fileId === 'string' ? item.fileId : null
    if (fileId) return [fileId]

    const url = 'url' in item && typeof item.url === 'string' ? item.url : null
    if (!url) return []

    const match = url.match(/\/api\/files\/(.+)$/)
    return match?.[1] ? [match[1]] : []
  })

  return [...new Set(files)]
}

function resolveStoredFilePath(storedFile: string): string | null {
  const normalized = storedFile.replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = normalized.split('/').filter(Boolean)

  if (parts.length === 1) {
    return path.join(UPLOAD_DIR, path.basename(parts[0]))
  }

  if (parts.length === 2 && /^\d{4}-\d{2}-\d{2}$/.test(parts[0])) {
    return path.join(UPLOAD_DIR, parts[0], path.basename(parts[1]))
  }

  return null
}

function deleteStoredFiles(storedFiles: string[]) {
  for (const storedFile of storedFiles) {
    const filePath = resolveStoredFilePath(storedFile)
    if (!filePath || !fs.existsSync(filePath)) continue

    try {
      fs.unlinkSync(filePath)

      const parentDir = path.dirname(filePath)
      if (parentDir !== UPLOAD_DIR && fs.existsSync(parentDir)) {
        const remaining = fs.readdirSync(parentDir)
        if (remaining.length === 0) {
          fs.rmdirSync(parentDir)
        }
      }
    } catch (error) {
      console.error(`Gagal menghapus file ${storedFile}:`, error)
    }
  }
}

/**
 * Extract Excel files from attachments
 * Returns array of file paths for all Excel files
 */
function extractExcelFiles(attachments: unknown): string[] {
  if (!Array.isArray(attachments)) return []

  return attachments
    .filter((item) => {
      if (!item || typeof item !== 'object') return false
      const type = 'type' in item ? String(item.type).toUpperCase() : ''
      return ['XLS', 'XLSX', 'XLSM'].includes(type)
    })
    .map((item) => {
      if ('fileId' in item && typeof item.fileId === 'string') {
        return item.fileId
      }
      if ('url' in item && typeof item.url === 'string') {
        const match = item.url.match(/\/api\/files\/(.+)$/)
        return match?.[1] || null
      }
      return null
    })
    .filter((path): path is string => path !== null)
}

/**
 * Sign Excel file with user signature
 * Non-blocking — catch errors silently
 */
async function signExcelFileAsync(
  filePath: string,
  userId: number,
  role: 'prepared' | 'checked' | 'approved',
) {
  try {
    const fullPath = resolveStoredFilePath(filePath)
    if (!fullPath || !fs.existsSync(fullPath)) {
      console.warn(`Excel file not found for signing: ${filePath}`)
      return
    }

    await addSignatureToExcel(fullPath, userId, role)
    console.log(`Signature added to ${filePath} for role ${role}`)
  } catch (error) {
    console.error(`Error signing Excel file ${filePath}:`, error)
    // Non-blocking — don't throw
  }
}

// ─── GET /api/quotations ──────────────────────────────────────────────────────
export async function getQuotations(req: Request, res: Response) {
  const userId = (req as any).user?.id
  const positionCode = (req as any).user?.positionCode

  // Filter by position: setiap posisi hanya lihat quotation yang relevan
  const where =
    positionCode === 'Assistance'
      ? { assistanceId: userId }
      : positionCode === 'Sales PIC'
        ? { salesPicId: userId }
        : positionCode === 'Manager'
          ? { managerId: userId }
          : {} // Administrator / tidak ada posisi → lihat semua

  const quotations = await prisma.quotation.findMany({
    where,
    include: {
      assistance: { select: { id: true, username: true } },
      salesPic: { select: { id: true, username: true } },
      manager: { select: { id: true, username: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  res.json(quotations.map(serializeQuotation))
}

// ─── GET /api/quotations/:id ──────────────────────────────────────────────────
export async function getQuotationById(req: Request, res: Response) {
  const id = parseInt(req.params.id as string, 10)

  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: {
      assistance: { select: { id: true, username: true } },
      salesPic: { select: { id: true, username: true } },
      manager: { select: { id: true, username: true } },
    },
  })

  if (!quotation) {
    res.status(404).json({ error: 'Quotation tidak ditemukan' })
    return
  }

  res.json(serializeQuotation(quotation))
}

// ─── POST /api/quotations ─────────────────────────────────────────────────────
// Assistance membuat draft baru → notif ke Sales PIC
export async function createQuotation(req: Request, res: Response) {
  const assistanceId = (req as any).user?.id
  const {
    salesPicId,
    quotationNumber,
    supplierQuoteNo,
    customerName,
    customer,
    quotationDate,
    date,
    priority,
    totalValue,
    value,
    notes,
    attachments,
    files,
  } = req.body

  console.log('[createQuotation] Received payload:', {
    assistanceId,
    salesPicId,
    customer: customerName ?? customer,
    quotationDate: quotationDate ?? date,
    totalValue: totalValue ?? value,
    attachments: attachments ?? files,
  })

  if (!assistanceId) {
    console.error(
      '[createQuotation] Missing assistanceId (user not authenticated)',
    )
    res.status(401).json({ error: 'Not authenticated' })
    return
  }

  if (!salesPicId) {
    console.error('[createQuotation] Missing salesPicId')
    res.status(400).json({ error: 'salesPicId wajib diisi' })
    return
  }

  // Resolve manager dari WorkGroup mapping
  let managerId: number | null = null
  try {
    managerId = await resolveManagerFromWorkGroup(assistanceId, salesPicId)
    console.log('[createQuotation] Resolved managerId:', managerId)
  } catch (err: any) {
    console.error('[createQuotation] Error resolving manager:', err?.message)
  }

  try {
    const quotation = await prisma.quotation.create({
      data: {
        assistanceId,
        salesPicId,
        managerId,
        status: 'PENDING_SALES_REVIEW',
        quotationNumber: quotationNumber ?? null,
        supplierQuoteNo: supplierQuoteNo ?? null,
        customerName: customerName ?? customer ?? null,
        quotationDate: quotationDate
          ? new Date(quotationDate)
          : date
            ? new Date(date)
            : null,
        priority: priority ?? null,
        totalValue: totalValue ?? value ?? null,
        notes: notes ?? null,
        attachments: attachments ?? files ?? null,
      },
    })

    console.log('[createQuotation] Created quotation:', quotation.id)

    // Non-blocking: Sign Excel files with Assistance signature
    const excelFiles = extractExcelFiles(quotation.attachments)
    for (const excelFile of excelFiles) {
      signExcelFileAsync(excelFile, assistanceId, 'prepared').catch(
        console.error,
      )
    }

    // Non-blocking — tidak blok response
    notifyDraftCreated(quotation.id).catch(console.error)
    broadcastQuotationUpdate()

    res.status(201).json(serializeQuotation(quotation))
  } catch (err: any) {
    console.error('[createQuotation] Error creating quotation:', err)
    res.status(400).json({
      error: 'Failed to create quotation',
      details: err?.message || String(err),
    })
  }
}

// ─── PATCH /api/quotations/:id/submit ─────────────────────────────────────────
// Sales PIC submit ke Manager → notif ke Manager
export async function submitToManager(req: Request, res: Response) {
  const id = parseInt(req.params.id as string, 10)
  const salesPicId = (req as any).user?.id

  const quotation = await prisma.quotation.update({
    where: { id },
    data: { status: 'PENDING_MANAGER_REVIEW', revisionNote: null },
  })

  // Non-blocking: Sign Excel files with Sales PIC signature
  const excelFiles = extractExcelFiles(quotation.attachments)
  for (const excelFile of excelFiles) {
    signExcelFileAsync(excelFile, salesPicId, 'checked').catch(console.error)
  }

  notifySubmittedToManager(quotation.id).catch(console.error)
  broadcastQuotationUpdate()

  res.json(serializeQuotation(quotation))
}

// ─── PATCH /api/quotations/:id/approve ───────────────────────────────────────
// Manager approve → notif ke Assistance + Sales PIC
export async function approveQuotation(req: Request, res: Response) {
  const id = parseInt(req.params.id as string, 10)
  const managerId = (req as any).user?.id

  const quotation = await prisma.quotation.update({
    where: { id },
    data: { status: 'APPROVED' },
  })

  // Non-blocking: Sign Excel files with Manager signature
  const excelFiles = extractExcelFiles(quotation.attachments)
  for (const excelFile of excelFiles) {
    signExcelFileAsync(excelFile, managerId, 'approved').catch(console.error)
  }

  notifyManagerApproved(quotation.id).catch(console.error)
  broadcastQuotationUpdate()

  res.json(serializeQuotation(quotation))
}

// ─── PATCH /api/quotations/:id/reject ────────────────────────────────────────
// Manager tolak → notif ke Assistance + Sales PIC
export async function rejectQuotation(req: Request, res: Response) {
  const id = parseInt(req.params.id as string, 10)
  const isRevision = req.body?.isRevision === true
  const revisionNote = req.body?.revisionNote as string | undefined

  const quotation = await prisma.quotation.update({
    where: { id },
    data: {
      status: isRevision ? 'REVISION' : 'REJECTED',
      revisionNote: revisionNote?.trim() || null,
    },
  })

  notifyManagerRejected(quotation.id, isRevision).catch(console.error)
  broadcastQuotationUpdate()

  res.json(serializeQuotation(quotation))
}

// ─── PATCH /api/quotations/:id/resubmit ─────────────────────────────────────
// Assistance kirim ulang hasil revisi → notif ke Sales PIC
export async function resubmitQuotation(req: Request, res: Response) {
  const id = parseInt(req.params.id as string, 10)

  const quotation = await prisma.quotation.update({
    where: { id },
    data: { status: 'PENDING_SALES_REVIEW' },
  })

  notifyResubmittedToSalesPic(quotation.id).catch(console.error)
  broadcastQuotationUpdate()

  res.json(serializeQuotation(quotation))
}

// ─── PATCH /api/quotations/:id/sent ─────────────────────────────────────────
// Tandai quotation approved sudah dikirim ke customer
export async function markQuotationSent(req: Request, res: Response) {
  const id = parseInt(req.params.id as string, 10)

  const quotation = await prisma.quotation.update({
    where: { id },
    data: { sentToCustomerAt: toStoredWibDate() },
  })

  broadcastQuotationUpdate()
  res.json(serializeQuotation(quotation))
}

// ─── PATCH /api/quotations/:id ───────────────────────────────────────────────
// Assistance update detail draft quotation
export async function updateQuotation(req: Request, res: Response) {
  const id = parseInt(req.params.id as string, 10)
  const userId = (req as any).user?.id

  const existing = await prisma.quotation.findUnique({ where: { id } })
  if (!existing) {
    res.status(404).json({ error: 'Quotation tidak ditemukan' })
    return
  }
  if (existing.assistanceId !== userId) {
    res.status(403).json({ error: 'Tidak diizinkan' })
    return
  }

  const {
    salesPicId,
    quotationNumber,
    supplierQuoteNo,
    customerName,
    quotationDate,
    priority,
    totalValue,
    notes,
    attachments,
  } = req.body

  let managerId = existing.managerId
  if (salesPicId && salesPicId !== existing.salesPicId) {
    managerId = await resolveManagerFromWorkGroup(userId, salesPicId)
  }

  const previousFiles = extractStoredFiles(existing.attachments)
  const nextFiles =
    attachments !== undefined ? extractStoredFiles(attachments) : previousFiles

  const quotation = await prisma.quotation.update({
    where: { id },
    data: {
      ...(salesPicId !== undefined && { salesPicId, managerId }),
      ...(quotationNumber !== undefined && { quotationNumber }),
      ...(supplierQuoteNo !== undefined && { supplierQuoteNo }),
      ...(customerName !== undefined && { customerName }),
      ...(quotationDate !== undefined && {
        quotationDate: quotationDate ? new Date(quotationDate) : null,
      }),
      ...(priority !== undefined && { priority }),
      ...(totalValue !== undefined && { totalValue }),
      ...(notes !== undefined && { notes }),
      ...(attachments !== undefined && { attachments }),
    },
    include: {
      assistance: { select: { id: true, username: true } },
      salesPic: { select: { id: true, username: true } },
      manager: { select: { id: true, username: true } },
    },
  })

  if (attachments !== undefined) {
    const nextSet = new Set(nextFiles)
    const removedFiles = previousFiles.filter((file) => !nextSet.has(file))
    deleteStoredFiles(removedFiles)
  }

  broadcastQuotationUpdate()
  res.json(serializeQuotation(quotation))
}

// ─── DELETE /api/quotations/:id ───────────────────────────────────────────────
// Assistance hapus draft quotation miliknya
export async function deleteQuotation(req: Request, res: Response) {
  const id = parseInt(req.params.id as string, 10)
  const userId = (req as any).user?.id

  const existing = await prisma.quotation.findUnique({ where: { id } })
  if (!existing) {
    res.status(404).json({ error: 'Quotation tidak ditemukan' })
    return
  }
  if (existing.assistanceId !== userId) {
    res.status(403).json({ error: 'Tidak diizinkan' })
    return
  }

  const storedFiles = extractStoredFiles(existing.attachments)
  await prisma.quotation.delete({ where: { id } })
  deleteStoredFiles(storedFiles)
  broadcastQuotationUpdate()
  res.status(204).end()
}

// ─── GET /api/quotations/:id/export-pdf ───────────────────────────────────────
// Download PDF rendition of an APPROVED quotation's first Excel attachment.
export async function downloadQuotationPdf(req: Request, res: Response) {
  const id = parseInt(req.params.id as string, 10)
  if (isNaN(id)) {
    res.status(400).json({ error: 'ID tidak valid' })
    return
  }

  const quotation = await prisma.quotation.findUnique({ where: { id } })
  if (!quotation) {
    res.status(404).json({ error: 'Quotation tidak ditemukan' })
    return
  }
  if (quotation.status !== 'APPROVED') {
    res.status(403).json({
      error: 'PDF hanya tersedia untuk quotation dengan status APPROVED',
    })
    return
  }

  const excelFiles = extractExcelFiles(quotation.attachments)
  if (excelFiles.length === 0) {
    res.status(404).json({ error: 'Tidak ada file Excel pada quotation ini' })
    return
  }

  const xlsmPath = resolveStoredFilePath(excelFiles[0])
  if (!xlsmPath || !fs.existsSync(xlsmPath)) {
    res.status(404).json({ error: 'File Excel tidak ditemukan di server' })
    return
  }

  try {
    const pdfBuffer = await generatePdfFromExcel(xlsmPath)
    if (!pdfBuffer) {
      res.status(500).json({ error: 'Gagal menghasilkan PDF' })
      return
    }
    const filename = `quotation-${id}.pdf`
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', pdfBuffer.length)
    res.end(pdfBuffer)
  } catch (error) {
    console.error(
      '[quotation.downloadQuotationPdf] PDF generation error:',
      error,
    )
    res.status(500).json({ error: 'Gagal menghasilkan PDF' })
  }
}

// src/services/quotation.service.ts
// ============================================================
// Quotation business logic + notification triggers
// Semua perubahan status quotation trigger push ke user terkait
// ============================================================
import prisma from '@/prisma'
import { sendPushToUser, sendPushToUsers } from './push.service'

// ─── TRIGGER 1: Draft dibuat oleh Assistance ──────────────────────────────────
// → Notifikasi ke Sales PIC yang ditugaskan dalam grup yang sama
export async function notifyDraftCreated(quotationId: number): Promise<void> {
  const q = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
    include: { assistance: { select: { username: true } } },
  })

  await sendPushToUser(q.salesPicId, {
    title: 'Draft Quotation Baru',
    body: `${q.assistance.username} membuat draft Quotation yang perlu Anda review.`,
    url: `/dashboard/review/${quotationId}`,
    tag: `quotation-review-${quotationId}`,
    quotationId,
    actions: [{ action: 'open', title: 'Buka Review' }],
  })
}

// ─── TRIGGER 2: Sales PIC submit ke Manager ───────────────────────────────────
// → Notifikasi ke Manager yang bertanggung jawab
export async function notifySubmittedToManager(
  quotationId: number,
): Promise<void> {
  const q = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
    include: {
      salesPic: { select: { username: true } },
      manager: { select: { username: true } },
    },
  })

  if (!q.managerId) {
    throw new Error(
      `Quotation ${quotationId} belum memiliki Manager. Pastikan WorkGroup sudah dikonfigurasi.`,
    )
  }

  await Promise.allSettled([
    sendPushToUser(q.managerId, {
      title: 'Quotation Perlu Approval Anda',
      body: `${q.salesPic.username} telah me-review Quotation dan membutuhkan approval Anda.`,
      url: `/dashboard/review/${quotationId}`,
      tag: `quotation-manager-approval-${quotationId}`,
      quotationId,
      actions: [{ action: 'open', title: 'Buka Approval' }],
    }),
    sendPushToUser(q.assistanceId, {
      title: 'Quotation Sudah Direview Sales PIC',
      body: `${q.salesPic.username} telah me-review Quotation dan meneruskannya ke ${q.manager?.username ?? 'Sales Manager'}.`,
      url: `/dashboard/review/${quotationId}`,
      tag: `quotation-submitted-${quotationId}`,
      quotationId,
      actions: [{ action: 'open', title: 'Lihat Status' }],
    }),
  ])
}

// ─── TRIGGER 3: Manager approve ───────────────────────────────────────────────
// → Notifikasi ke Assistance DAN Sales PIC — workflow selesai
export async function notifyManagerApproved(
  quotationId: number,
): Promise<void> {
  const q = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
    include: { manager: { select: { username: true } } },
  })

  await sendPushToUsers([q.assistanceId, q.salesPicId], {
    title: 'Quotation Disetujui ✓',
    body: `${q.manager?.username ?? 'Manager'} telah menyetujui Quotation ini.`,
    url: `/dashboard/approved/${quotationId}`,
    tag: `quotation-approved-${quotationId}`,
    quotationId,
  })
}

// ─── TRIGGER 4: Manager reject / minta revisi ─────────────────────────────────
// → Notifikasi ke Assistance dan Sales PIC
export async function notifyManagerRejected(
  quotationId: number,
  isRevision = false,
): Promise<void> {
  const q = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
    include: { manager: { select: { username: true } } },
  })

  const title = isRevision ? 'Quotation Perlu Revisi' : 'Quotation Ditolak'
  const body = isRevision
    ? `${q.manager?.username ?? 'Manager'} meminta revisi pada Quotation ini.`
    : `${q.manager?.username ?? 'Manager'} menolak Quotation ini.`

  await sendPushToUsers([q.assistanceId, q.salesPicId], {
    title,
    body,
    url: `/dashboard/revision/${quotationId}`,
    tag: `quotation-revision-${quotationId}`,
    quotationId,
    actions: [{ action: 'open', title: 'Lihat Detail' }],
  })
}

export async function notifyResubmittedToSalesPic(
  quotationId: number,
): Promise<void> {
  const q = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
    include: { assistance: { select: { username: true } } },
  })

  await sendPushToUser(q.salesPicId, {
    title: 'Quotation Revisi Siap Direview Ulang',
    body: `${q.assistance.username} telah mengirim ulang Quotation hasil revisi untuk Anda review.`,
    url: `/dashboard/sales-pic/${quotationId}`,
    tag: `quotation-resubmitted-${quotationId}`,
    quotationId,
    actions: [{ action: 'open', title: 'Buka Review' }],
  })
}

// ─── TRIGGER: Resend notif berdasarkan status quotation saat ini ──────────────
// DRAFT / PENDING_SALES_REVIEW  → kirim ulang ke Sales PIC
// PENDING_MANAGER_REVIEW        → kirim ulang ke Manager saja
// REVISION                      → kirim ulang ke Assistance saja
// APPROVED / REJECTED           → tidak diizinkan (throw)
export async function notifyResend(quotationId: number): Promise<void> {
  const q = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
    include: {
      assistance: { select: { username: true } },
      salesPic: { select: { username: true } },
      manager: { select: { username: true } },
    },
  })

  switch (q.status) {
    case 'DRAFT':
    case 'PENDING_SALES_REVIEW':
      await sendPushToUser(q.salesPicId, {
        title: 'Reminder: Draft Quotation Menunggu Review',
        body: `${q.assistance.username} mengingatkan Anda untuk me-review Quotation yang sudah dikirim.`,
        url: `/dashboard/review/${quotationId}`,
        tag: `quotation-review-${quotationId}`,
        quotationId,
        actions: [{ action: 'open', title: 'Buka Review' }],
      })
      break

    case 'PENDING_MANAGER_REVIEW':
      if (!q.managerId) throw new Error('Quotation belum memiliki Manager')
      await sendPushToUser(q.managerId, {
        title: 'Reminder: Quotation Menunggu Approval Anda',
        body: `${q.salesPic.username} mengingatkan Anda untuk meng-approve Quotation ini.`,
        url: `/dashboard/review/${quotationId}`,
        tag: `quotation-manager-approval-${quotationId}`,
        quotationId,
        actions: [{ action: 'open', title: 'Buka Approval' }],
      })
      break

    case 'REVISION':
      await sendPushToUser(q.assistanceId, {
        title: 'Reminder: Quotation Memerlukan Revisi',
        body: `Ada permintaan revisi dari ${q.manager?.username ?? 'Manager'} yang menunggu tindakan Anda.`,
        url: `/dashboard/draft`,
        tag: `quotation-revision-${quotationId}`,
        quotationId,
        actions: [{ action: 'open', title: 'Lihat Revisi' }],
      })
      break

    default:
      throw new Error(`Status '${q.status}' tidak mendukung resend notifikasi`)
  }
}

// ─── Helper: Resolve Manager dari WorkGroup ───────────────────────────────────
// Gunakan ini saat quotation pertama kali dibuat untuk set managerId
export async function resolveManagerFromWorkGroup(
  assistanceId: number,
  salesPicId: number,
): Promise<number | null> {
  const group = await prisma.workGroup.findFirst({
    where: { assistanceId, salesPicId },
    select: { managerId: true },
  })
  return group?.managerId ?? null
}

// src/routes/push.routes.ts
// ============================================================
// Push subscription + notification center endpoints
// Mount di app.ts: app.use('/api/push', pushRouter)
//                  app.use('/api/notifications', pushRouter)
// ============================================================
import { Router } from 'express'
import prisma from '@/prisma'
import { notifyResend } from '@/services/quotation.service'
import { sendPushToUser } from '@/services/push.service'

const router = Router()

// ─── Push Subscription ────────────────────────────────────────────────────────

/**
 * POST /api/push/subscribe
 * Simpan/update push subscription dari device.
 * Dipanggil frontend setelah login + request permission.
 * Upsert by endpoint sehingga login ulang tidak duplikat.
 */
router.post('/subscribe', async (req, res) => {
  try {
    const sub = req.body as {
      endpoint: string
      keys: { p256dh: string; auth: string }
    }

    const userId = (req as any).user?.id
    console.log('[Push] POST /subscribe', { userId, endpoint: sub?.endpoint })

    if (!userId) {
      console.warn('[Push] No userId in request')
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      console.warn('[Push] Invalid subscription payload', { sub })
      res.status(400).json({ error: 'Invalid subscription payload' })
      return
    }

    console.log('[Push] Upserting subscription...', {
      userId,
      endpoint: sub.endpoint,
    })
    const result = await prisma.pushSubscription.upsert({
      where: {
        userId_endpoint: { userId, endpoint: sub.endpoint },
      },
      update: {
        keys: sub.keys,
      },
      create: {
        endpoint: sub.endpoint,
        keys: sub.keys,
        userId,
      },
    })
    console.log('[Push] Subscription saved successfully', {
      id: result.id,
      userId,
    })

    res.json({ ok: true })
  } catch (error) {
    console.error('[Push] Error in POST /subscribe:', error)
    res
      .status(500)
      .json({ error: 'Failed to save subscription', details: String(error) })
  }
})

/**
 * GET /api/push/subscriptions/check
 * Cek apakah current user punya subscription untuk endpoint ini (device ini).
 * Digunakan saat login untuk determine apakah perlu tampilkan notification-setup page.
 * Query param: ?endpoint={endpoint}
 */
router.get('/subscriptions/check', async (req, res) => {
  try {
    const userId = (req as any).user?.id
    const endpoint = req.query.endpoint as string

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    if (!endpoint) {
      res.status(400).json({ error: 'Missing endpoint query param' })
      return
    }

    const subscription = await prisma.pushSubscription.findUnique({
      where: {
        userId_endpoint: { userId, endpoint },
      },
    })

    // If found = this user already has subscription for this device
    const isRegistered = !!subscription
    console.log('[Push] GET /subscriptions/check', {
      userId,
      endpoint: endpoint.slice(0, 50),
      isRegistered,
    })

    res.json({ isRegistered })
  } catch (error) {
    console.error('[Push] Error in GET /subscriptions/check:', error)
    res.status(500).json({ error: 'Failed to check subscription' })
  }
})

// ─── Notification Center ──────────────────────────────────────────────────────

/**
 * GET /api/notifications
 * Ambil 50 notifikasi terbaru + unread count untuk bell badge.
 */
router.get('/', async (req, res) => {
  const userId = (req as any).user?.id
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const [notifications, unreadCount] = await Promise.all([
    prisma.notificationLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.notificationLog.count({ where: { userId, isRead: false } }),
  ])

  res.json({ notifications, unreadCount })
})

/**
 * PATCH /api/notifications/:id/read
 * Tandai satu notifikasi sebagai sudah dibaca.
 */
router.patch('/:id/read', async (req, res) => {
  const userId = (req as any).user?.id
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  await prisma.notificationLog.updateMany({
    where: {
      id: parseInt(req.params.id as string, 10),
      userId, // guard: user hanya bisa update milik sendiri
    },
    data: { isRead: true },
  })

  res.json({ ok: true })
})

/**
 * PATCH /api/notifications/read-all
 * Tandai semua notifikasi user sebagai sudah dibaca.
 */
router.patch('/read-all', async (req, res) => {
  const userId = (req as any).user?.id
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  await prisma.notificationLog.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  })

  res.json({ ok: true })
})

/**
 * POST /api/push/resend/:quotationId
 * Kirim ulang push notification ke penerima yang tepat berdasarkan status:
 *   DRAFT / PENDING_SALES_REVIEW  → Sales PIC   (dipanggil oleh Assistance)
 *   PENDING_MANAGER_REVIEW        → Manager     (dipanggil oleh Sales PIC)
 *   REVISION                      → Assistance  (dipanggil oleh Sales PIC atau Manager)
 *   APPROVED / REJECTED           → diblokir
 * Mendukung multi-device — sendPushToUser mengirim ke SEMUA device terdaftar.
 */
router.post('/resend/:quotationId', async (req, res) => {
  const userId = (req as any).user?.id
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const quotationId = parseInt(req.params.quotationId as string, 10)

  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: {
      id: true,
      assistanceId: true,
      salesPicId: true,
      managerId: true,
      status: true,
    },
  })

  if (!quotation) {
    res.status(404).json({ error: 'Quotation tidak ditemukan' })
    return
  }

  // Blokir jika sudah final
  if (quotation.status === 'APPROVED' || quotation.status === 'REJECTED') {
    res.status(400).json({
      error: `Tidak bisa resend notif — quotation sudah '${quotation.status}'`,
    })
    return
  }

  // Validasi siapa yang boleh resend berdasarkan status
  const isAssistance = quotation.assistanceId === userId
  const isSalesPic = quotation.salesPicId === userId
  const isManager = quotation.managerId === userId

  const allowed =
    (['DRAFT', 'PENDING_SALES_REVIEW', 'PENDING_MANAGER_REVIEW'].includes(
      quotation.status,
    ) &&
      isAssistance) ||
    (quotation.status === 'REVISION' && (isSalesPic || isManager))

  if (!allowed) {
    res.status(403).json({ error: 'Akses ditolak' })
    return
  }

  const target = ['DRAFT', 'PENDING_SALES_REVIEW'].includes(quotation.status)
    ? { userId: quotation.salesPicId, label: 'Sales PIC' }
    : quotation.status === 'PENDING_MANAGER_REVIEW'
      ? quotation.managerId
        ? { userId: quotation.managerId, label: 'Manager' }
        : null
      : { userId: quotation.assistanceId, label: 'Assistance' }

  if (!target) {
    res.status(400).json({
      error: 'This quotation does not have a manager assigned yet.',
    })
    return
  }

  const deviceCount = await prisma.pushSubscription.count({
    where: { userId: target.userId },
  })

  if (deviceCount === 0) {
    res.status(409).json({
      error: `${target.label} has not subscribed to notifications yet.`,
    })
    return
  }

  await notifyResend(quotationId)

  res.json({
    ok: true,
    message: `Notification resent successfully to ${target.label}.`,
  })
})

/**
 * POST /api/push/test
 * Kirim test push notification ke semua device milik user yang sedang login.
 * Berguna untuk memverifikasi pipeline push end-to-end (incl. background/lock screen).
 */
router.post('/test', async (req, res) => {
  const userId = (req as any).user?.id
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const deviceCount = await prisma.pushSubscription.count({ where: { userId } })

  if (deviceCount === 0) {
    res.status(400).json({
      error: 'No registered devices. Please click "Aktifkan Notifikasi" first.',
      deviceCount: 0,
    })
    return
  }

  await sendPushToUser(userId, {
    title: 'Test Notification',
    body: 'Push delivery is working! This verifies background & lock screen delivery.',
    url: '/dashboard/notifications',
    tag: 'qc-test-push',
  })

  res.json({ ok: true, deviceCount })
})

export { router as pushRouter }

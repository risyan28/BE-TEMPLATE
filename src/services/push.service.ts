// src/services/push.service.ts
// ============================================================
// Web Push Service — kirim background push + log ke DB
// Dipakai oleh quotation.service.ts untuk trigger notifikasi
// ============================================================
import webpush from 'web-push'
import prisma from '@/prisma'
import { getIO } from '@/ws/connectionHandler'

// Inisialisasi VAPID satu kali saat module di-load
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

export interface NotificationPayload {
  title: string
  body: string
  url: string
  tag?: string
  quotationId?: number
  actions?: Array<{ action: string; title: string }>
}

// ── Retry helper ──────────────────────────────────────────────
/**
 * sendNotification with exponential backoff for transient FCM/push relay errors.
 * - 410 / 404: subscription expired/gone → throw immediately (caller removes it)
 * - 429 / 5xx: temporary relay error → retry up to maxRetries times
 * - Other client errors: throw immediately (no retry)
 */
async function sendWithRetry(
  subscription: webpush.PushSubscription,
  payload: string,
  options: webpush.RequestOptions,
  maxRetries = 3,
): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await webpush.sendNotification(subscription, payload, options)
      return
    } catch (err: any) {
      lastError = err
      const status: number | undefined = err?.statusCode
      // Expired / permanently gone — propagate so caller can clean up
      if (status === 410 || status === 404) throw err
      // Permanent client error (4xx but not 429) — no point retrying
      if (status && status >= 400 && status < 500 && status !== 429) throw err
      // Transient (429 rate-limit or 5xx server error) — retry with backoff
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 500 // 500ms, 1s, 2s
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
    }
  }
  throw lastError
}

/**
 * Kirim background push ke semua device milik satu user
 * + simpan ke NotificationLog untuk in-app notification center
 * + emit badge update via Socket.IO ke user yang sedang online
 *
 * Otomatis cleanup subscription expired (HTTP 410 / 404 Gone).
 */
export async function sendPushToUser(
  userId: number,
  payload: NotificationPayload,
): Promise<void> {
  // 1. Simpan ke DB terlebih dahulu (selalu, meski user tidak punya device)
  const notification = await prisma.notificationLog.create({
    data: {
      userId,
      title: payload.title,
      body: payload.body,
      url: payload.url,
      tag: payload.tag ?? null,
      quotationId: payload.quotationId ?? null,
    },
  })

  // 2. Emit badge count ke socket room user (jika sedang online)
  try {
    const unreadCount = await prisma.notificationLog.count({
      where: { userId, isRead: false },
    })
    const io = getIO()
    io.to(`user:${userId}`).emit('notification:new', notification)
    io.to(`user:${userId}`).emit('notification:badge', { unreadCount })
  } catch {
    // IO mungkin belum siap saat startup — abaikan
  }

  // 3. Kirim background push ke semua device terdaftar
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  })

  if (subscriptions.length === 0) return

  // Add timestamp so each push is unique — prevents OS-level deduplication
  const ts = Date.now()
  const payloadString = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag ? `${payload.tag}-${ts}` : `qc-${ts}`,
    actions: payload.actions,
  })

  const sendOptions: webpush.RequestOptions = {
    urgency: 'high', // Bangunkan device meski screen lock / background
    TTL: 86400, // Tahan 24 jam jika device sementara offline
    headers: {
      // Topic helps FCM route immediately instead of batching
      Topic: payload.tag ?? 'qc-notification',
    },
  }

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      sendWithRetry(
        {
          endpoint: sub.endpoint,
          keys: sub.keys as { p256dh: string; auth: string },
        },
        payloadString,
        sendOptions,
      ),
    ),
  )

  // 4. Cleanup + logging
  const expiredEndpoints: string[] = []
  let delivered = 0
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      delivered++
    } else {
      const err = result.reason as any
      const status: number | undefined = err?.statusCode
      if (status === 410 || status === 404) {
        // Subscription expired — schedule for removal
        expiredEndpoints.push(subscriptions[i].endpoint)
      } else {
        // Transient or unexpected failure — log for observability
        console.warn(
          `[Push] Failed to deliver to endpoint ...${subscriptions[i].endpoint.slice(-30)}: ` +
            `HTTP ${status ?? 'unknown'} — ${err?.message ?? String(err)}`,
        )
      }
    }
  })

  console.info(
    `[Push] user=${userId} title="${payload.title}" → ${delivered}/${subscriptions.length} delivered` +
      (expiredEndpoints.length
        ? `, ${expiredEndpoints.length} expired (kept for retry)`
        : ''),
  )

  // ✅ DO NOT DELETE expired subscriptions — keep them for retry
  // Some devices may be temporarily offline or have transient push relay issues.
  // The next push attempt might succeed. Only log for observability.
  if (expiredEndpoints.length > 0) {
    console.warn(
      `[Push] Expired endpoints for user ${userId}: ${expiredEndpoints.length} device(s) ` +
        `returned HTTP 410/404. Will retry on next push attempt.`,
    )
  }
}

/**
 * Kirim push ke beberapa user sekaligus (misal: assistance + salesPic).
 */
export async function sendPushToUsers(
  userIds: number[],
  payload: NotificationPayload,
): Promise<void> {
  await Promise.allSettled(userIds.map((id) => sendPushToUser(id, payload)))
}

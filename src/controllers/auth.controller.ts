// src/controllers/auth.controller.ts
// ============================================================
// Auth HTTP handlers: login, register, refresh, logout, me
// ============================================================
import type { Request, Response } from 'express'
import prisma from '@/prisma'
import {
  hashPassword,
  verifyPassword,
  generateTokens,
  verifyRefreshToken,
} from '@/services/auth.service'
import { toStoredWibDate } from '@/utils/date'

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
export async function login(req: Request, res: Response) {
  const { username, password } = req.body as {
    username?: string
    password?: string
  }

  if (!username || !password) {
    res.status(400).json({ error: 'Username dan password wajib diisi' })
    return
  }

  const user = await prisma.user.findUnique({
    where: { username },
    include: { position: { select: { name: true } } },
  })
  if (!user) {
    res.status(401).json({ error: 'Username atau password salah' })
    return
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    res.status(401).json({ error: 'Username atau password salah' })
    return
  }

  // Stamp last login time (fire-and-forget, non-blocking)
  prisma.user
    .update({
      where: { id: user.id },
      data: { lastLoginAt: toStoredWibDate() },
    })
    .catch(() => {})

  const payload = {
    id: user.id,
    username: user.username,
    email: user.email,
    positionCode: user.position?.name ?? '',
  }

  const { accessToken, refreshToken } = generateTokens(payload)

  res.json({
    token: accessToken,
    refreshToken,
    user: payload,
  })
}

// ─── POST /api/auth/register ──────────────────────────────────────────────────
// Hanya ADMIN yang boleh mendaftarkan user baru
export async function register(req: Request, res: Response) {
  const { username, email, password, positionId } = req.body as {
    username?: string
    email?: string
    password?: string
    positionId?: number | string
  }

  if (!username || !email || !password) {
    res.status(400).json({ error: 'username, email, dan password wajib diisi' })
    return
  }

  const passwordHash = await hashPassword(password)
  const parsedPositionId =
    positionId != null ? parseInt(String(positionId), 10) : null

  const user = await prisma.user.create({
    data: { username, email, passwordHash, positionId: parsedPositionId },
    include: { position: { select: { name: true } } },
  })

  res.status(201).json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      positionCode: user.position?.name ?? null,
      positionName: user.position?.name ?? null,
      createdAt: user.createdAt,
    },
  })
}

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
export async function refresh(req: Request, res: Response) {
  const { refreshToken } = req.body as { refreshToken?: string }

  if (!refreshToken) {
    res.status(400).json({ error: 'refreshToken wajib diisi' })
    return
  }

  try {
    const old = verifyRefreshToken(refreshToken)
    const user = await prisma.user.findUnique({
      where: { id: old.id },
      include: { position: { select: { name: true } } },
    })
    if (!user) {
      res.status(401).json({ error: 'User tidak ditemukan' })
      return
    }
    const { accessToken, refreshToken: newRefresh } = generateTokens({
      id: user.id,
      username: user.username,
      email: user.email,
      positionCode: user.position?.name ?? '',
    })
    res.json({ token: accessToken, refreshToken: newRefresh })
  } catch {
    res
      .status(401)
      .json({ error: 'Refresh token tidak valid atau sudah expired' })
  }
}

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
// Stateless — client cukup buang token dari localStorage
export function logout(_req: Request, res: Response) {
  res.json({ ok: true })
}

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
export function me(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  res.json({ user: req.user })
}

// ─── PATCH /api/auth/change-password ─────────────────────────────────────────
export async function changePassword(req: Request, res: Response) {
  const userId = req.user?.id
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string
    newPassword?: string
  }

  if (!currentPassword || !newPassword) {
    res
      .status(400)
      .json({ error: 'currentPassword dan newPassword wajib diisi' })
    return
  }

  if (newPassword.length < 8) {
    res.status(400).json({ error: 'Password baru minimal 8 karakter' })
    return
  }

  const user = await prisma.user.findUnique({ where: { id: Number(userId) } })
  if (!user) {
    res.status(404).json({ error: 'User tidak ditemukan' })
    return
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash)
  if (!valid) {
    res.status(400).json({ error: 'Password saat ini salah' })
    return
  }

  const newHash = await hashPassword(newPassword)
  await prisma.user.update({
    where: { id: Number(userId) },
    data: { passwordHash: newHash },
  })

  res.json({ ok: true })
}

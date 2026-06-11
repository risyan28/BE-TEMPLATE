import type { Request, Response } from 'express'
import prisma from '@/shared/lib/prisma'
import {
  hashPassword,
  verifyPassword,
  generateTokens,
  verifyRefreshToken,
} from '@/modules/auth/auth.service'

export async function login(req: Request, res: Response) {
  const { username, password } = req.body as { username?: string; password?: string }
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' })
    return
  }

  const user = await prisma.user.findUnique({ where: { username } })
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  const valid = await verifyPassword(password, user.password)
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  const payload = { id: user.id, username: user.username, email: user.email }
  const { accessToken, refreshToken } = generateTokens(payload)
  res.json({ token: accessToken, refreshToken, user: payload })
}

export async function register(req: Request, res: Response) {
  const { username, email, password } = req.body as { username?: string; email?: string; password?: string }
  if (!username || !email || !password) {
    res.status(400).json({ error: 'username, email, password required' })
    return
  }

  const hash = await hashPassword(password)
  const user = await prisma.user.create({
    data: { username, email, password: hash },
  })
  res.status(201).json({ user: { id: user.id, username: user.username, email: user.email, createdAt: user.createdAt } })
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = req.body as { refreshToken?: string }
  if (!refreshToken) {
    res.status(400).json({ error: 'refreshToken required' })
    return
  }

  try {
    const old = verifyRefreshToken(refreshToken)
    const user = await prisma.user.findUnique({ where: { id: old.id } })
    if (!user) {
      res.status(401).json({ error: 'User not found' })
      return
    }
    const { accessToken, refreshToken: newRefresh } = generateTokens({
      id: user.id, username: user.username, email: user.email,
    })
    res.json({ token: accessToken, refreshToken: newRefresh })
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' })
  }
}

export function logout(_req: Request, res: Response) {
  res.json({ ok: true })
}

export function me(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  res.json({ user: req.user })
}

export async function changePassword(req: Request, res: Response) {
  const userId = req.user?.id
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string }
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'currentPassword and newPassword required' })
    return
  }

  const user = await prisma.user.findUnique({ where: { id: Number(userId) } })
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const valid = await verifyPassword(currentPassword, user.password)
  if (!valid) {
    res.status(400).json({ error: 'Current password is incorrect' })
    return
  }

  const hash = await hashPassword(newPassword)
  await prisma.user.update({ where: { id: Number(userId) }, data: { password: hash } })
  res.json({ ok: true })
}

// src/controllers/users.controller.ts
import type { Request, Response } from 'express'
import prisma from '@/prisma'
import { hashPassword } from '@/services/auth.service'
import { broadcastMasterdataUpdate } from '@/ws/broadcast'

const USER_SELECT = {
  id: true,
  username: true,
  email: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  position: { select: { id: true, name: true } },
} as const

// ── LIST ─────────────────────────────────────────────────────
export async function listUsers(req: Request, res: Response) {
  const search =
    typeof req.query.search === 'string' ? req.query.search.trim() : undefined
  const includeInactive = req.query.includeInactive === 'true'
  const positionCode =
    typeof req.query.positionCode === 'string'
      ? req.query.positionCode
      : undefined

  const users = await prisma.user.findMany({
    where: {
      ...(search
        ? {
            OR: [
              { username: { contains: search } },
              { email: { contains: search } },
            ],
          }
        : {}),
      ...(!includeInactive ? { isActive: true } : {}),
      ...(positionCode ? { position: { name: positionCode } } : {}),
    },
    select: USER_SELECT,
    orderBy: { username: 'asc' },
  })

  res.json(users)
}

// ── GET ONE ──────────────────────────────────────────────────
export async function getUser(req: Request, res: Response) {
  const id = parseInt(req.params.id as string, 10)
  const user = await prisma.user.findUnique({
    where: { id },
    select: USER_SELECT,
  })
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  res.json(user)
}

// ── CREATE ───────────────────────────────────────────────────
export async function createUser(req: Request, res: Response) {
  const { username, email, password, positionId, isActive } = req.body as {
    username?: string
    email?: string
    password?: string
    positionId?: number | string | null
    isActive?: boolean
  }

  if (!username?.trim()) {
    res.status(400).json({ error: 'username is required' })
    return
  }
  if (!email?.trim()) {
    res.status(400).json({ error: 'email is required' })
    return
  }
  if (!password || password.length < 8) {
    res.status(400).json({ error: 'password must be at least 8 characters' })
    return
  }

  const dupeUsername = await prisma.user.findUnique({
    where: { username: username.trim() },
  })
  if (dupeUsername) {
    res.status(409).json({ error: 'Username already taken' })
    return
  }

  const dupeEmail = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  })
  if (dupeEmail) {
    res.status(409).json({ error: 'Email already registered' })
    return
  }

  const passwordHash = await hashPassword(password)
  const parsedPositionId =
    positionId != null && positionId !== ''
      ? parseInt(String(positionId), 10)
      : null

  const user = await prisma.user.create({
    data: {
      username: username.trim(),
      email: email.trim().toLowerCase(),
      passwordHash,
      positionId: parsedPositionId,
      isActive: isActive ?? true,
    },
    select: USER_SELECT,
  })

  broadcastMasterdataUpdate('users')
  res.status(201).json(user)
}

// ── UPDATE ───────────────────────────────────────────────────
export async function updateUser(req: Request, res: Response) {
  const id = parseInt(req.params.id as string, 10)
  const { username, email, password, positionId, isActive } = req.body as {
    username?: string
    email?: string
    password?: string
    positionId?: number | string | null
    isActive?: boolean
  }

  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  if (username?.trim()) {
    const dupe = await prisma.user.findFirst({
      where: { username: { equals: username.trim() }, NOT: { id } },
    })
    if (dupe) {
      res.status(409).json({ error: 'Username already taken' })
      return
    }
  }

  if (email?.trim()) {
    const dupe = await prisma.user.findFirst({
      where: { email: { equals: email.trim().toLowerCase() }, NOT: { id } },
    })
    if (dupe) {
      res.status(409).json({ error: 'Email already registered' })
      return
    }
  }

  if (password && password.length < 8) {
    res.status(400).json({ error: 'password must be at least 8 characters' })
    return
  }

  const newHash = password ? await hashPassword(password) : undefined

  const parsedPositionId =
    positionId !== undefined
      ? positionId === null || positionId === ''
        ? null
        : parseInt(String(positionId), 10)
      : undefined

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(username !== undefined ? { username: username.trim() } : {}),
      ...(email !== undefined ? { email: email.trim().toLowerCase() } : {}),
      ...(newHash !== undefined ? { passwordHash: newHash } : {}),
      ...(parsedPositionId !== undefined
        ? { positionId: parsedPositionId }
        : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
    select: USER_SELECT,
  })

  broadcastMasterdataUpdate('users')
  res.json(user)
}

// ── DELETE ───────────────────────────────────────────────────
export async function deleteUser(req: Request, res: Response) {
  const id = parseInt(req.params.id as string, 10)

  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  if (req.user?.id === id) {
    res.status(400).json({ error: 'Cannot delete your own account' })
    return
  }

  await prisma.user.delete({ where: { id } })
  broadcastMasterdataUpdate('users')
  res.status(204).send()
}

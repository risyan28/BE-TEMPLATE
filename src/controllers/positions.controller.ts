// src/controllers/positions.controller.ts
import type { Request, Response } from 'express'
import prisma from '@/prisma'
import { broadcastMasterdataUpdate } from '@/ws/broadcast'

// ── LIST ─────────────────────────────────────────────────────
export async function listPositions(req: Request, res: Response) {
  const search =
    typeof req.query.search === 'string' ? req.query.search.trim() : undefined
  const includeInactive = req.query.includeInactive === 'true'

  const positions = await prisma.position.findMany({
    where: {
      ...(search
        ? {
            OR: [{ name: { contains: search } }],
          }
        : {}),
      ...(!includeInactive ? { isActive: true } : {}),
    },
    include: {
      _count: { select: { users: true } },
    },
    orderBy: { name: 'asc' },
  })

  res.json(positions)
}

// ── GET ONE ──────────────────────────────────────────────────
export async function getPosition(req: Request, res: Response) {
  const id = parseInt(req.params.id as string, 10)
  const position = await prisma.position.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  })
  if (!position) {
    res.status(404).json({ error: 'Position not found' })
    return
  }
  res.json(position)
}

// ── CREATE ───────────────────────────────────────────────────
export async function createPosition(req: Request, res: Response) {
  const { name, isActive } = req.body as {
    name?: string
    isActive?: boolean
  }

  if (!name?.trim()) {
    res.status(400).json({ error: 'name wajib diisi' })
    return
  }

  // Check duplicate name
  const dupeName = await prisma.position.findFirst({
    where: { name: { equals: name.trim() } },
  })
  if (dupeName) {
    res.status(409).json({ error: 'Nama position sudah terdaftar' })
    return
  }

  const position = await prisma.position.create({
    data: {
      name: name.trim(),
      isActive: isActive ?? true,
    },
    include: { _count: { select: { users: true } } },
  })

  broadcastMasterdataUpdate('positions')
  res.status(201).json(position)
}

// ── UPDATE ───────────────────────────────────────────────────
export async function updatePosition(req: Request, res: Response) {
  const id = parseInt(req.params.id as string, 10)
  const { name, isActive } = req.body as {
    name?: string
    isActive?: boolean
  }

  const existing = await prisma.position.findUnique({ where: { id } })
  if (!existing) {
    res.status(404).json({ error: 'Position not found' })
    return
  }

  if (name?.trim()) {
    const dupeName = await prisma.position.findFirst({
      where: { name: { equals: name.trim() }, NOT: { id } },
    })
    if (dupeName) {
      res.status(409).json({ error: 'Nama position sudah terdaftar' })
      return
    }
  }

  const position = await prisma.position.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
    include: { _count: { select: { users: true } } },
  })

  broadcastMasterdataUpdate('positions')
  res.json(position)
}

// ── DELETE ───────────────────────────────────────────────────
export async function deletePosition(req: Request, res: Response) {
  const id = parseInt(req.params.id as string, 10)

  const existing = await prisma.position.findUnique({ where: { id } })
  if (!existing) {
    res.status(404).json({ error: 'Position not found' })
    return
  }

  // Guard: cannot delete if users are linked
  const linked = await prisma.user.count({ where: { positionId: id } })
  if (linked > 0) {
    res.status(409).json({
      error: `Position tidak bisa dihapus karena masih digunakan oleh ${linked} user`,
    })
    return
  }

  await prisma.position.delete({ where: { id } })
  broadcastMasterdataUpdate('positions')
  res.status(204).send()
}

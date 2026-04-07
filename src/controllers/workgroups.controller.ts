// src/controllers/workgroups.controller.ts
import type { Request, Response } from 'express'
import prisma from '@/prisma'
import { broadcastMasterdataUpdate } from '@/ws/broadcast'

const WG_SELECT = {
  id: true,
  name: true,
  assistance: { select: { id: true, username: true, email: true } },
  salesPic: { select: { id: true, username: true, email: true } },
  manager: { select: { id: true, username: true, email: true } },
} as const

// ── LIST ─────────────────────────────────────────────────────
export async function listWorkGroups(_req: Request, res: Response) {
  const workgroups = await prisma.workGroup.findMany({
    select: WG_SELECT,
    orderBy: { name: 'asc' },
  })
  res.json(workgroups)
}

// ── GET ONE ──────────────────────────────────────────────────
export async function getWorkGroup(req: Request, res: Response) {
  const id = parseInt(req.params.id as string, 10)
  const wg = await prisma.workGroup.findUnique({
    where: { id },
    select: WG_SELECT,
  })
  if (!wg) {
    res.status(404).json({ error: 'Work group not found' })
    return
  }
  res.json(wg)
}

// ── CREATE ───────────────────────────────────────────────────
export async function createWorkGroup(req: Request, res: Response) {
  const { name, assistanceId, salesPicId, managerId } = req.body as {
    name?: string
    assistanceId?: number
    salesPicId?: number
    managerId?: number
  }

  if (!name?.trim()) {
    res.status(400).json({ error: 'name wajib diisi' })
    return
  }
  if (!assistanceId || !salesPicId || !managerId) {
    res
      .status(400)
      .json({ error: 'assistanceId, salesPicId, managerId wajib diisi' })
    return
  }

  // Check duplicate combination
  const dupe = await prisma.workGroup.findFirst({
    where: { assistanceId, salesPicId, managerId },
  })
  if (dupe) {
    res
      .status(409)
      .json({ error: 'Kombinasi anggota group ini sudah terdaftar' })
    return
  }

  const wg = await prisma.workGroup.create({
    data: { name: name.trim(), assistanceId, salesPicId, managerId },
    select: WG_SELECT,
  })
  broadcastMasterdataUpdate('workgroups')
  res.status(201).json(wg)
}

// ── UPDATE ───────────────────────────────────────────────────
export async function updateWorkGroup(req: Request, res: Response) {
  const id = parseInt(req.params.id as string, 10)
  const { name, assistanceId, salesPicId, managerId } = req.body as {
    name?: string
    assistanceId?: number
    salesPicId?: number
    managerId?: number
  }

  const existing = await prisma.workGroup.findUnique({ where: { id } })
  if (!existing) {
    res.status(404).json({ error: 'Work group not found' })
    return
  }

  const newAssistanceId = assistanceId ?? existing.assistanceId
  const newSalesPicId = salesPicId ?? existing.salesPicId
  const newManagerId = managerId ?? existing.managerId

  // Check duplicate combination (excluding self)
  const dupe = await prisma.workGroup.findFirst({
    where: {
      assistanceId: newAssistanceId,
      salesPicId: newSalesPicId,
      managerId: newManagerId,
      NOT: { id },
    },
  })
  if (dupe) {
    res
      .status(409)
      .json({ error: 'Kombinasi anggota group ini sudah terdaftar' })
    return
  }

  const wg = await prisma.workGroup.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(assistanceId !== undefined ? { assistanceId } : {}),
      ...(salesPicId !== undefined ? { salesPicId } : {}),
      ...(managerId !== undefined ? { managerId } : {}),
    },
    select: WG_SELECT,
  })
  broadcastMasterdataUpdate('workgroups')
  res.json(wg)
}

// ── DELETE ───────────────────────────────────────────────────
export async function deleteWorkGroup(req: Request, res: Response) {
  const id = parseInt(req.params.id as string, 10)

  const existing = await prisma.workGroup.findUnique({ where: { id } })
  if (!existing) {
    res.status(404).json({ error: 'Work group not found' })
    return
  }

  await prisma.workGroup.delete({ where: { id } })
  broadcastMasterdataUpdate('workgroups')
  res.json({ success: true })
}

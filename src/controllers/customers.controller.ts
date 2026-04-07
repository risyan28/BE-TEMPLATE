// src/controllers/customers.controller.ts
import type { Request, Response } from 'express'
import prisma from '@/prisma'
import { broadcastMasterdataUpdate } from '@/ws/broadcast'

// ── LIST ─────────────────────────────────────────────────────
export async function listCustomers(req: Request, res: Response) {
  const search =
    typeof req.query.search === 'string' ? req.query.search.trim() : undefined
  const includeInactive = req.query.includeInactive === 'true'

  const customers = await prisma.customer.findMany({
    where: {
      ...(search ? { name: { contains: search } } : {}),
      ...(!includeInactive ? { isActive: true } : {}),
    },
    orderBy: { name: 'asc' },
  })

  res.json(customers)
}

// ── GET ONE ──────────────────────────────────────────────────
export async function getCustomer(req: Request, res: Response) {
  const id = parseInt(req.params.id as string, 10)
  const customer = await prisma.customer.findUnique({ where: { id } })
  if (!customer) {
    res.status(404).json({ error: 'Customer not found' })
    return
  }
  res.json(customer)
}

// ── CREATE ───────────────────────────────────────────────────
export async function createCustomer(req: Request, res: Response) {
  const { name, isActive } = req.body as { name: string; isActive?: boolean }

  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' })
    return
  }

  // Check duplicate name
  const dupe = await prisma.customer.findFirst({
    where: { name: { equals: name.trim() } },
  })
  if (dupe) {
    res.status(409).json({ error: 'Nama customer sudah terdaftar' })
    return
  }

  const customer = await prisma.customer.create({
    data: { name: name.trim(), isActive: isActive ?? true },
  })

  broadcastMasterdataUpdate('customers')
  res.status(201).json(customer)
}

// ── UPDATE ───────────────────────────────────────────────────
export async function updateCustomer(req: Request, res: Response) {
  const id = parseInt(req.params.id as string, 10)
  const { name, isActive } = req.body as { name?: string; isActive?: boolean }

  const existing = await prisma.customer.findUnique({ where: { id } })
  if (!existing) {
    res.status(404).json({ error: 'Customer not found' })
    return
  }

  // Check duplicate name (excluding self)
  if (name?.trim()) {
    const dupe = await prisma.customer.findFirst({
      where: { name: { equals: name.trim() }, NOT: { id } },
    })
    if (dupe) {
      res.status(409).json({ error: 'Nama customer sudah terdaftar' })
      return
    }
  }

  const customer = await prisma.customer.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
  })

  broadcastMasterdataUpdate('customers')
  res.json(customer)
}

// ── DELETE ───────────────────────────────────────────────────
export async function deleteCustomer(req: Request, res: Response) {
  const id = parseInt(req.params.id as string, 10)

  const existing = await prisma.customer.findUnique({ where: { id } })
  if (!existing) {
    res.status(404).json({ error: 'Customer not found' })
    return
  }

  // Check if any quotation is linked
  const linked = await prisma.quotation.count({ where: { customerId: id } })
  if (linked > 0) {
    res.status(409).json({
      error: `Customer tidak bisa dihapus karena terhubung ke ${linked} quotation`,
    })
    return
  }

  await prisma.customer.delete({ where: { id } })
  broadcastMasterdataUpdate('customers')
  res.status(204).send()
}

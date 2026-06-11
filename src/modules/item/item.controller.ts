// src/modules/item/item.controller.ts
// ============================================================
// Contoh controller CRUD + WebSocket-aware
// Ganti nama class & method sesuai resource
// ============================================================
import { Request, Response } from 'express'
import { itemService } from '@/modules/item/item.service'
import { CreateItemSchema, UpdateItemSchema } from '@/modules/item/item.schema'
import { AppError } from '@/shared/lib/app-error'

export const itemController = {
  async getAll(req: Request, res: Response) {
    const items = await itemService.getAll()
    res.json({ success: true, data: items, count: items.length })
  },

  async getById(req: Request, res: Response) {
    const id = Number(req.params.id)
    const item = await itemService.getById(id)
    if (!item) throw new AppError(404, 'Item not found')
    res.json({ success: true, data: item })
  },

  async create(req: Request, res: Response) {
    const parsed = CreateItemSchema.parse(req.body)
    const item = await itemService.create(parsed)
    res.status(201).json({ success: true, data: item })
  },

  async update(req: Request, res: Response) {
    const id = Number(req.params.id)
    const parsed = UpdateItemSchema.parse(req.body)
    const item = await itemService.update(id, parsed)
    res.json({ success: true, data: item })
  },

  async remove(req: Request, res: Response) {
    const id = Number(req.params.id)
    await itemService.delete(id)
    res.json({ success: true, message: 'Item deleted' })
  },
}

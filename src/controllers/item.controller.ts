// src/controllers/item.controller.ts
// ============================================================
// Contoh controller CRUD + WebSocket-aware
// Ganti nama class & method sesuai resource
// ============================================================
import { Request, Response } from 'express'
import { itemService } from '@/services/item.service'
import { CreateItemSchema, UpdateItemSchema } from '@/schemas/item.schema'
import { AppError } from '@/middleware/errorHandler'

export const itemController = {
  /**
   * GET /api/items
   * @swagger
   * /api/items:
   *   get:
   *     summary: Get all items
   *     tags: [Items]
   *     responses:
   *       200:
   *         description: List of items
   */
  async getAll(req: Request, res: Response) {
    const items = await itemService.getAll()
    res.json({ success: true, data: items, count: items.length })
  },

  /**
   * GET /api/items/:id
   * @swagger
   * /api/items/{id}:
   *   get:
   *     summary: Get item by ID
   *     tags: [Items]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Item found
   *       404:
   *         $ref: '#/components/responses/NotFound'
   */
  async getById(req: Request, res: Response) {
    const id = Number(req.params.id)
    const item = await itemService.getById(id)
    if (!item) throw new AppError(404, 'Item not found')
    res.json({ success: true, data: item })
  },

  /**
   * POST /api/items
   * @swagger
   * /api/items:
   *   post:
   *     summary: Create new item
   *     tags: [Items]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name]
   *             properties:
   *               name: { type: string }
   *               description: { type: string }
   *               status: { type: integer, example: 0 }
   *     responses:
   *       201:
   *         description: Item created
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   */
  async create(req: Request, res: Response) {
    const parsed = CreateItemSchema.parse(req.body)
    const item = await itemService.create(parsed)
    res.status(201).json({ success: true, data: item })
  },

  /**
   * PATCH /api/items/:id
   * @swagger
   * /api/items/{id}:
   *   patch:
   *     summary: Update item
   *     tags: [Items]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Item updated
   */
  async update(req: Request, res: Response) {
    const id = Number(req.params.id)
    const parsed = UpdateItemSchema.parse(req.body)
    const item = await itemService.update(id, parsed)
    res.json({ success: true, data: item })
  },

  /**
   * DELETE /api/items/:id
   * @swagger
   * /api/items/{id}:
   *   delete:
   *     summary: Delete item
   *     tags: [Items]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Item deleted
   */
  async remove(req: Request, res: Response) {
    const id = Number(req.params.id)
    await itemService.delete(id)
    res.json({ success: true, message: 'Item deleted' })
  },
}

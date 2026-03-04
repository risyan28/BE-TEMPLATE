// src/schemas/item.schema.ts
// ============================================================
// Zod validation schema untuk Item
// Ganti nama & field sesuai kebutuhan project
// ============================================================
import { z } from 'zod'

// Schema untuk CREATE item
export const CreateItemSchema = z.object({
  name: z.string().min(1, 'name is required').max(255),
  description: z.string().optional(),
  status: z.number().int().min(0).max(1).optional().default(0),
})

// Schema untuk UPDATE item (semua field opsional)
export const UpdateItemSchema = CreateItemSchema.partial()

// TypeScript types dari schema
export type CreateItemDto = z.infer<typeof CreateItemSchema>
export type UpdateItemDto = z.infer<typeof UpdateItemSchema>

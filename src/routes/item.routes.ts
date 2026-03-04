// src/routes/item.routes.ts
// ============================================================
// Route untuk Item resource
// Daftarkan ke app.ts dengan: app.use('/api/items', itemRouter)
// ============================================================
import { Router } from 'express'
import { itemController } from '@/controllers/item.controller'
import { asyncHandler } from '@/middleware/errorHandler'

const router = Router()

router.get('/', asyncHandler(itemController.getAll))
router.get('/:id', asyncHandler(itemController.getById))
router.post('/', asyncHandler(itemController.create))
router.patch('/:id', asyncHandler(itemController.update))
router.delete('/:id', asyncHandler(itemController.remove))

export { router as itemRouter }

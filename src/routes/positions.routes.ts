// src/routes/positions.routes.ts
import { Router } from 'express'
import {
  listPositions,
  getPosition,
  createPosition,
  updatePosition,
  deletePosition,
} from '@/controllers/positions.controller'

const router = Router()

router.get('/', listPositions) // GET    /api/positions
router.get('/:id', getPosition) // GET    /api/positions/:id
router.post('/', createPosition) // POST   /api/positions
router.patch('/:id', updatePosition) // PATCH  /api/positions/:id
router.delete('/:id', deletePosition) // DELETE /api/positions/:id

export { router as positionsRouter }

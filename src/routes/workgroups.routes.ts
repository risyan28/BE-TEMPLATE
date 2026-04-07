// src/routes/workgroups.routes.ts
import { Router } from 'express'
import {
  listWorkGroups,
  getWorkGroup,
  createWorkGroup,
  updateWorkGroup,
  deleteWorkGroup,
} from '@/controllers/workgroups.controller'

const router = Router()

router.get('/', listWorkGroups) // GET    /api/workgroups
router.get('/:id', getWorkGroup) // GET    /api/workgroups/:id
router.post('/', createWorkGroup) // POST   /api/workgroups
router.patch('/:id', updateWorkGroup) // PATCH  /api/workgroups/:id
router.delete('/:id', deleteWorkGroup) // DELETE /api/workgroups/:id

export { router as workgroupsRouter }

import { Router } from 'express'
import {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
} from '@/controllers/users.controller'

const router = Router()

router.get('/', listUsers) // GET    /api/users
router.get('/:id', getUser) // GET    /api/users/:id
router.post('/', createUser) // POST   /api/users
router.patch('/:id', updateUser) // PATCH  /api/users/:id
router.delete('/:id', deleteUser) // DELETE /api/users/:id

export { router as usersRouter }

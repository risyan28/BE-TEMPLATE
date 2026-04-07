// src/routes/auth.routes.ts
// ============================================================
// Auth endpoints — mounted at /api/auth
// ============================================================
import { Router } from 'express'
import { authenticate } from '@/middleware/authenticate'
import {
  login,
  register,
  refresh,
  logout,
  me,
  changePassword,
} from '@/controllers/auth.controller'

const router = Router()

router.post('/login', login)
router.post('/register', authenticate, register) // hanya user yang login (admin) bisa tambah user
router.post('/refresh', refresh)
router.post('/logout', logout)
router.get('/me', authenticate, me)
router.patch('/change-password', authenticate, changePassword)

export { router as authRouter }

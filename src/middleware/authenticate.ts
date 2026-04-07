// src/middleware/authenticate.ts
// ============================================================
// JWT Authentication Middleware
// Verifies Bearer token, attaches req.user
// ============================================================
import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface JwtPayload {
  id: number
  username: string
  email: string
  positionCode: string
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token tidak ditemukan' })
    return
  }

  const token = authHeader.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload
    req.user = {
      id: payload.id,
      username: payload.username,
      email: payload.email,
      positionCode: payload.positionCode,
    }
    next()
  } catch {
    res.status(401).json({ error: 'Token tidak valid atau sudah expired' })
  }
}

/**
 * Middleware factory — pastikan user memiliki salah satu dari role yang diizinkan.
 * Harus dipasang setelah authenticate().
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    if (!roles.includes(req.user.positionCode)) {
      res.status(403).json({
        error: `Akses ditolak. Role yang diperlukan: ${roles.join(' | ')}`,
      })
      return
    }
    next()
  }
}

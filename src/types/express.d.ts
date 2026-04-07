// src/types/express.d.ts
// Augment Express Request with authenticated user payload
import 'express'

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number
        username: string
        email: string
        positionCode: string
      }
    }
  }
}

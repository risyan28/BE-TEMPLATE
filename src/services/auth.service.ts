// src/services/auth.service.ts
// ============================================================
// Authentication business logic: hash, verify, token generation
// ============================================================
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { JwtPayload } from '@/middleware/authenticate'

const SALT_ROUNDS = 12
const ACCESS_TOKEN_TTL = '15m'
const REFRESH_TOKEN_TTL = '7d'

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export function generateTokens(payload: JwtPayload) {
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: ACCESS_TOKEN_TTL,
  })
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: REFRESH_TOKEN_TTL,
  })
  return { accessToken, refreshToken }
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as JwtPayload
}

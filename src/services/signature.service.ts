import { PrismaClient } from '@prisma/client'
import path from 'path'
import fs from 'fs'

const prisma = new PrismaClient()

/**
 * Signature Service
 * Manages user signature uploads and retrieval for Excel embedding
 */

export async function uploadUserSignature(
  userId: number,
  signatureUrl: string,
) {
  // Store signature URL for a user
  return prisma.user.update({
    where: { id: userId },
    data: { signatureUrl },
  })
}

export async function getUserSignature(userId: number) {
  // Get signature URL for a user
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { signatureUrl: true, username: true },
  })
  return user?.signatureUrl || null
}

export async function getUserSignatureFile(
  signatureUrl: string,
): Promise<Buffer | null> {
  // Read signature image file from disk
  if (!signatureUrl) return null

  try {
    // Extract filename from URL regardless of prefix format:
    // /api/files/signatures/filename.png  →  filename.png
    // /api/signatures/filename.png        →  filename.png (legacy)
    const filename = path.basename(signatureUrl)

    const fullPath = path.join(process.cwd(), 'uploads', 'signatures', filename)

    // Prevent path traversal
    const normalized = path.normalize(fullPath)
    const uploadsDir = path.join(process.cwd(), 'uploads', 'signatures')
    if (!normalized.startsWith(uploadsDir)) {
      console.error(`Signature path traversal attempted: ${filename}`)
      return null
    }

    if (fs.existsSync(normalized)) {
      return fs.readFileSync(normalized)
    }
  } catch (error) {
    console.error('Error reading signature file:', error)
  }

  return null
}

export function ensureSignatureDir() {
  // Ensure /uploads/signatures directory exists
  const dir = path.join(process.cwd(), 'uploads', 'signatures')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

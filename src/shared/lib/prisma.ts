import { PrismaClient } from '@prisma/client'

// Prisma 7: connection URL is read from DATABASE_URL env var at runtime.
// CLI (migrate/generate) reads from prisma.config.ts → datasourceUrl.
const prisma = new PrismaClient()
export default prisma

import { Router, Request, Response } from 'express'
import { asyncHandler } from '@/shared/middleware/errorHandler'
import prisma from '@/shared/lib/prisma'

const router = Router()

/**
 * @openapi
 * /api/health:
 *   get:
 *     tags: [Health]
 *     summary: Basic health check
 *     responses:
 *       200:
 *         description: Server is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: ok }
 *                 timestamp: { type: string }
 *                 uptime: { type: number }
 */
router.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

/**
 * @openapi
 * /api/health/detailed:
 *   get:
 *     tags: [Health]
 *     summary: Detailed health check with DB status
 *     responses:
 *       200:
 *         description: System health details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string }
 *                 checks:
 *                   type: object
 *                   properties:
 *                     prisma:
 *                       type: object
 *                       properties:
 *                         status: { type: string }
 *                         responseTime: { type: string }
 */
router.get(
  '/detailed',
  asyncHandler(async (req: Request, res: Response) => {
    const startTime = Date.now()
    let prismaStatus = 'unknown'
    let prismaResponseTime = 0
    try {
      const prismaStart = Date.now()
      await prisma.$queryRaw`SELECT 1`
      prismaResponseTime = Date.now() - prismaStart
      prismaStatus = 'healthy'
    } catch (err) {
      prismaStatus = 'unhealthy'
    }

    const totalTime = Date.now() - startTime
    const memoryUsage = process.memoryUsage()

    res.json({
      status: prismaStatus === 'healthy' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      checks: {
        prisma: {
          status: prismaStatus,
          responseTime: `${prismaResponseTime}ms`,
        },
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: {
          rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        },
      },
      responseTime: `${totalTime}ms`,
    })
  }),
)

export { router as healthRouter }

/**
 * HTTP Cache Control Middleware
 * All API endpoints return Cache-Control: no-store so browsers and proxies
 * never serve stale data. Data freshness is handled by the frontend (React Query
 * + WebSocket invalidation), not HTTP-level caching.
 */

import { Request, Response, NextFunction } from 'express'

export function cacheControl(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET') {
    // Personal/sensitive data served over HTTPS — prevent any caching
    res.set('Cache-Control', 'no-store')
  }
  next()
}

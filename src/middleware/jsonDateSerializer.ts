import type { NextFunction, Request, Response } from 'express'
import { serializeDatesForJson } from '@/utils/date'

export function jsonDateSerializer(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  const originalJson = res.json.bind(res)

  res.json = ((body: unknown) => {
    return originalJson(serializeDatesForJson(body))
  }) as Response['json']

  next()
}

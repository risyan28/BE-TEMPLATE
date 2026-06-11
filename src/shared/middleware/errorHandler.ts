import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { AppError } from '@/shared/lib/app-error'

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  console.error('❌ [ERROR]', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  })

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      details: err.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    })
  }

  const prismaErr = err as any
  if (prismaErr.name === 'PrismaClientKnownRequestError') {
    if (prismaErr.code === 'P2002') {
      return res
        .status(400)
        .json({
          success: false,
          error: 'Duplicate Entry',
          message: 'A record with this value already exists',
        })
    }
    if (prismaErr.code === 'P2025') {
      return res
        .status(404)
        .json({
          success: false,
          error: 'Not Found',
          message: 'The requested record does not exist',
        })
    }
    return res
      .status(400)
      .json({ success: false, error: 'Database Error', message: err.message })
  }

  if (prismaErr.name === 'PrismaClientValidationError') {
    return res
      .status(400)
      .json({
        success: false,
        error: 'Invalid Data',
        message: 'The provided data is invalid',
      })
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
    })
  }

  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message:
      process.env.NODE_ENV === 'development'
        ? err.message
        : 'Something went wrong',
  })
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

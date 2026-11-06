import type { ApiErrorBody, ErrorCode } from '@english-app/shared'
import type { FastifyInstance } from 'fastify'
import { ZodError, type ZodType } from 'zod'
import { isSpaRoute } from './spa.ts'

export class AppError extends Error {
  readonly code: ErrorCode
  readonly statusCode: number

  constructor(code: ErrorCode, statusCode: number, message: string) {
    super(message)
    this.code = code
    this.statusCode = statusCode
  }
}

/** Parses request data with a Zod schema; invalid data becomes a 400 VALIDATION_ERROR. */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new AppError('VALIDATION_ERROR', 400, result.error.issues[0]?.message ?? 'Invalid input')
  }
  return result.data
}

const codeByStatus: Record<number, ErrorCode> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  404: 'NOT_FOUND',
  429: 'RATE_LIMITED',
}

function body(code: ErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } }
}

export function registerErrorHandling(app: FastifyInstance, opts: { spaFallback: boolean }) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(body(error.code, error.message))
    }
    if (error instanceof ZodError) {
      return reply.status(400).send(body('VALIDATION_ERROR', 'Invalid input'))
    }
    const status = (error as { statusCode?: number }).statusCode
    // Other client errors Fastify raises (415 unsupported type, 413 too large...) keep their status.
    const code =
      status === undefined
        ? undefined
        : (codeByStatus[status] ?? (status >= 400 && status < 500 ? 'VALIDATION_ERROR' : undefined))
    if (status !== undefined && code !== undefined) {
      return reply.status(status).send(body(code, (error as Error).message))
    }
    request.log.error(error)
    return reply.status(500).send(body('INTERNAL_ERROR', 'Something went wrong'))
  })

  app.setNotFoundHandler((request, reply) => {
    if (opts.spaFallback && isSpaRoute(request)) return reply.sendFile('index.html')
    return reply.status(404).send(body('NOT_FOUND', 'Route not found'))
  })
}

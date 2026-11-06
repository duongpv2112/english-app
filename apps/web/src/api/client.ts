import { apiErrorBodySchema, type ErrorCode } from '@english-app/shared'

export class ApiError extends Error {
  readonly code: ErrorCode
  readonly status: number

  constructor(code: ErrorCode, status: number, message: string) {
    super(message)
    this.code = code
    this.status = status
  }
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch('/api' + path, {
    method: init.method ?? 'GET',
    credentials: 'include',
    headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })

  if (res.status === 204) return undefined as T
  if (res.ok) return (await res.json()) as T

  const parsed = apiErrorBodySchema.safeParse(await res.json().catch(() => null))
  if (parsed.success) {
    throw new ApiError(parsed.data.error.code, res.status, parsed.data.error.message)
  }
  throw new ApiError('INTERNAL_ERROR', res.status, `Request failed with status ${res.status}`)
}

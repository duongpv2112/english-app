import fastifyStatic from '@fastify/static'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { resolve } from 'node:path'

/** Serves the built web app from `dir`. */
export async function registerSpa(app: FastifyInstance, dir: string) {
  await app.register(fastifyStatic, { root: resolve(dir) })
}

/** GET requests for client-side routes (not /api, not a file) get index.html. */
export function isSpaRoute(request: FastifyRequest): boolean {
  const path = request.url.split('?')[0] ?? ''
  const lastSegment = path.split('/').pop() ?? ''
  return (
    request.method === 'GET' &&
    path !== '/api' &&
    !path.startsWith('/api/') &&
    !lastSegment.includes('.')
  )
}

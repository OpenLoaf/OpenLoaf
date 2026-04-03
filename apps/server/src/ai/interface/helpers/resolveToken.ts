import type { Context } from 'hono'

/** Extract bearer token from request headers. */
export function resolveBearerToken(c: Context): string | null {
  const authHeader =
    c.req.header('authorization') ?? c.req.header('Authorization')
  if (!authHeader) return null
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

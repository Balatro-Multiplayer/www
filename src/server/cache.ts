import { redis } from '@/server/redis'

type Envelope<T> = { value: T; storedAt: number }

type SwrOptions = {
  /** Seconds a cached value is served without triggering a refresh. */
  freshFor: number
  /** Seconds the value stays in Redis and can be served stale while refreshing. */
  ttl: number
}

const inflight = new Map<string, Promise<unknown>>()

function compute<T>(key: string, fn: () => Promise<T>, ttl: number) {
  const existing = inflight.get(key) as Promise<T> | undefined
  if (existing) return existing

  const promise = fn()
    .then(async (value) => {
      const envelope: Envelope<T> = { value, storedAt: Date.now() }
      await redis.set(key, JSON.stringify(envelope), { EX: ttl })
      return value
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, promise)
  return promise
}

/**
 * Cache a JSON-serializable computed value in Redis with stale-while-revalidate
 * semantics: a fresh hit returns immediately, a stale hit returns the old value
 * and refreshes in the background, and a miss computes inline. Concurrent
 * callers for the same key share one computation.
 */
export async function cachedSwr<T>(
  key: string,
  options: SwrOptions,
  fn: () => Promise<T>
): Promise<T> {
  const cached = await redis.get(key)
  if (cached) {
    const envelope = JSON.parse(cached) as Envelope<T>
    const ageSeconds = (Date.now() - envelope.storedAt) / 1000
    if (ageSeconds > options.freshFor) {
      compute(key, fn, options.ttl).catch((error) => {
        console.error(`Background refresh failed for ${key}:`, error)
      })
    }
    return envelope.value
  }

  return compute(key, fn, options.ttl)
}

/** Builds a deterministic cache key suffix from a procedure input. */
export function cacheKeyFromInput(input: unknown): string {
  if (input === undefined || input === null) return 'default'
  const entries = Object.entries(input as Record<string, unknown>)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify(Object.fromEntries(entries))
}

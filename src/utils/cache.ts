import { getRedisClient } from '@/config/redis'
import { loggers } from '@/utils/logger'

export class CacheService {
  private redis = getRedisClient()

  private async withRedis<T>(key: string, operation: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    if (!this.redis) return fallback

    try {
      return await fn()
    } catch (error) {
      loggers.cache.warn({ error, key }, `${operation} failed`)
      return fallback
    }
  }

  async get<T>(key: string): Promise<T | null> {
    return this.withRedis(key, 'Cache GET', async () => {
      const cached = await this.redis!.get(key)
      if (!cached) return null

      const data = JSON.parse(cached) as T
      loggers.cache.debug({ key }, 'Cache HIT')
      return data
    }, null)
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    return this.withRedis(key, 'Cache SET', async () => {
      const serialized = JSON.stringify(value)

      if (ttl) {
        await this.redis!.setex(key, ttl, serialized)
      } else {
        await this.redis!.set(key, serialized)
      }

      loggers.cache.debug({ key, ttl }, 'Cache SET')
      return true
    }, false)
  }

  async del(key: string): Promise<boolean> {
    return this.withRedis(key, 'Cache DEL', async () => {
      await this.redis!.del(key)
      loggers.cache.debug({ key }, 'Cache DEL')
      return true
    }, false)
  }

  async delPattern(pattern: string): Promise<number> {
    return this.withRedis(pattern, 'Cache DEL pattern', async () => {
      const keys = await this.redis!.keys(pattern)
      if (keys.length === 0) return 0

      await this.redis!.del(...keys)
      loggers.cache.debug({ pattern, count: keys.length }, 'Cache DEL pattern')
      return keys.length
    }, 0)
  }

  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    const cached = await this.get<T>(key)
    if (cached !== null) {
      return cached
    }

    loggers.cache.debug({ key }, 'Cache MISS - fetching from source')
    const data = await fetchFn()
    await this.set(key, data, ttl)

    return data
  }

  isAvailable(): boolean {
    return this.redis !== null && this.redis.status === 'ready'
  }
}

export const cache = new CacheService()

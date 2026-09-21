import { describe, it, expect } from 'vitest'
import { PrefetchCache, livePrefetchKey } from './live-prefetch'

describe('PrefetchCache', () => {
  it('returns the primed promise once, then nothing', async () => {
    const cache = new PrefetchCache<number>(1000, () => 0)
    let calls = 0
    cache.prime('k', async () => ++calls)
    expect(await cache.take('k')).toBe(1)
    expect(cache.take('k')).toBeNull()
    expect(calls).toBe(1)
  })

  it('reuses an in-flight prime instead of fetching twice', async () => {
    const cache = new PrefetchCache<number>(1000, () => 0)
    let calls = 0
    const a = cache.prime('k', async () => ++calls)
    const b = cache.prime('k', async () => ++calls)
    expect(a).toBe(b)
    expect(await b).toBe(1)
  })

  it('expires entries after the TTL', async () => {
    let t = 0
    const cache = new PrefetchCache<number>(1000, () => t)
    cache.prime('k', async () => 1)
    t = 1001
    expect(cache.take('k')).toBeNull()
  })

  it('re-primes after expiry', async () => {
    let t = 0
    let calls = 0
    const cache = new PrefetchCache<number>(1000, () => t)
    cache.prime('k', async () => ++calls)
    t = 2000
    cache.prime('k', async () => ++calls)
    expect(await cache.take('k')).toBe(2)
  })

  it('drops a failed prefetch so the consumer refetches', async () => {
    const cache = new PrefetchCache<number>(1000, () => 0)
    const p = cache.prime('k', async () => {
      throw new Error('boom')
    })
    await p.catch(() => {})
    await Promise.resolve()
    expect(cache.take('k')).toBeNull()
  })

  it('keys by user and language', () => {
    expect(livePrefetchKey('u1', 'pt-BR')).toBe('u1:pt-BR')
    expect(livePrefetchKey('u1', 'es-MX')).not.toBe(livePrefetchKey('u2', 'es-MX'))
  })
})

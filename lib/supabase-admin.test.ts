import { describe, it, expect, beforeAll } from 'vitest'
import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose'
import { createLocalJWKSet } from 'jose'
import { verifySupabaseJwt } from './supabase-admin'

// Local JWT verification replaces a Supabase auth round-trip on every API
// call. These tests sign tokens with a throwaway ES256 key and check the
// accept/reject rules match what Supabase's own getUser() would do.

const URL_ = 'https://example.supabase.co'
let privateKey: CryptoKey
let jwks: ReturnType<typeof createLocalJWKSet>

async function token(claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: string; key?: CryptoKey } = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
    .setIssuer(opts.iss ?? `${URL_}/auth/v1`)
    .setAudience(opts.aud ?? 'authenticated')
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '1h')
    .sign(opts.key ?? privateKey)
}

beforeAll(async () => {
  process.env.VITE_SUPABASE_URL = URL_
  const pair = await generateKeyPair('ES256')
  privateKey = pair.privateKey as CryptoKey
  const pub: JWK = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' }
  jwks = createLocalJWKSet({ keys: [pub] })
})

describe('verifySupabaseJwt', () => {
  it('accepts a valid token and returns id + email', async () => {
    const t = await token({ sub: 'user-1', email: 'a@b.co', role: 'authenticated' })
    expect(await verifySupabaseJwt(t, jwks)).toEqual({ id: 'user-1', email: 'a@b.co' })
  })

  it('returns a null email for anonymous users', async () => {
    const t = await token({ sub: 'anon-1', is_anonymous: true, role: 'authenticated' })
    expect(await verifySupabaseJwt(t, jwks)).toEqual({ id: 'anon-1', email: null })
  })

  it('rejects an expired token', async () => {
    const t = await token({ sub: 'user-1' }, { exp: '-1s' })
    expect(await verifySupabaseJwt(t, jwks)).toBeNull()
  })

  it('rejects a token from another project (issuer mismatch)', async () => {
    const t = await token({ sub: 'user-1' }, { iss: 'https://other.supabase.co/auth/v1' })
    expect(await verifySupabaseJwt(t, jwks)).toBeNull()
  })

  it('rejects a token signed by a different key', async () => {
    const other = await generateKeyPair('ES256')
    const t = await token({ sub: 'user-1' }, { key: other.privateKey as CryptoKey })
    expect(await verifySupabaseJwt(t, jwks)).toBeNull()
  })

  it('rejects garbage', async () => {
    expect(await verifySupabaseJwt('not-a-jwt', jwks)).toBeNull()
  })
})

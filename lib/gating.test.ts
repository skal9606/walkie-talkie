import { describe, it, expect } from 'vitest'
import { clientPlatform } from './gating'

// clientPlatform decides the iOS-vs-web label shown in the admin
// dashboard's Recent Signups table. The header parsing + the iOS
// device-id fallback are easy to break silently (a renamed header,
// a case mismatch) and there's no runtime signal when they do —
// the column just quietly fills with the wrong value or "—".

describe('clientPlatform', () => {
  it('reads an explicit ios header', () => {
    expect(clientPlatform({ 'x-walkie-platform': 'ios' })).toBe('ios')
  })

  it('reads an explicit web header', () => {
    expect(clientPlatform({ 'x-walkie-platform': 'web' })).toBe('web')
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(clientPlatform({ 'x-walkie-platform': '  iOS ' })).toBe('ios')
    expect(clientPlatform({ 'x-walkie-platform': 'WEB' })).toBe('web')
  })

  it('takes the first value when the header arrives as an array', () => {
    expect(clientPlatform({ 'x-walkie-platform': ['web', 'ios'] })).toBe('web')
  })

  it('falls back to ios when only the iOS device-id header is present', () => {
    // Older iOS builds send the Keychain device id but not yet the
    // explicit platform header — they should still resolve as iOS.
    expect(
      clientPlatform({ 'x-walkie-device-id': '11111111-2222-3333-4444-555555555555' }),
    ).toBe('ios')
  })

  it('prefers an explicit web header over the device-id fallback', () => {
    expect(
      clientPlatform({
        'x-walkie-platform': 'web',
        'x-walkie-device-id': '11111111-2222-3333-4444-555555555555',
      }),
    ).toBe('web')
  })

  it('returns null when nothing identifies the platform', () => {
    expect(clientPlatform({})).toBeNull()
  })

  it('returns null for an unrecognized platform value with no fallback', () => {
    expect(clientPlatform({ 'x-walkie-platform': 'android' })).toBeNull()
  })
})

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleAppleWebhook } from '../../lib/apple-iap.js'

// Apple App Store Server Notifications V2 endpoint. Configure this URL in
// App Store Connect → My Apps → [App] → App Store Server Notifications →
// Production / Sandbox URL. Apple POSTs JSON: { signedPayload: <JWS string> }.
//
// No webhook secret like Stripe — Apple authenticates by signing the payload
// with their cert chain. Verification happens inside handleAppleWebhook via
// the @apple/app-store-server-library SignedDataVerifier.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const body = (req.body ?? {}) as { signedPayload?: string }
  const result = await handleAppleWebhook(body.signedPayload)
  res.status(result.status).json(result.body)
}

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleVerifyAppleTransaction } from '../../lib/apple-iap.js'
import { getUserIdFromAuthHeader } from '../../lib/supabase-admin.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const userId = await getUserIdFromAuthHeader(req.headers.authorization)
  if (!userId) {
    return res.status(401).json({ error: 'Not signed in.' })
  }
  const body = (req.body ?? {}) as {
    signedTransaction?: string
    appleUserId?: string
  }
  const result = await handleVerifyAppleTransaction({
    userId,
    signedTransaction: body.signedTransaction,
    appleUserId: body.appleUserId,
  })
  res.status(result.status).json(result.body)
}

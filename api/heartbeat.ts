import type { VercelRequest, VercelResponse } from '@vercel/node'
import { addUsageSeconds, checkSessionAccess } from '../lib/gating'
import { getUserIdFromAuthHeader } from '../lib/supabase-admin'

/**
 * Called ~every 10s while a free-tier session is live. Server increments the
 * user's usage counter and returns their new remaining-seconds, so the client
 * can reconcile and know when to stop.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const userId = await getUserIdFromAuthHeader(req.headers.authorization)
  if (!userId) {
    return res.status(401).json({ error: 'Not signed in.' })
  }
  const body = (req.body ?? {}) as { seconds?: number }
  const seconds = Math.min(Math.max(0, Math.floor(body.seconds ?? 0)), 60)
  try {
    await addUsageSeconds(userId, seconds)
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  }
  const access = await checkSessionAccess(userId)
  return res.status(200).json({
    subscribed: access.subscribed,
    secondsRemaining: access.secondsRemaining,
  })
}

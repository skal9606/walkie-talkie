import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminStats, getSubscriptionDetail } from '../lib/api-handlers.js'
import { getUserFromAuthHeader } from '../lib/supabase-admin.js'

// Piggybacks the admin dashboard stats endpoint here (under
// ?scope=admin) so we stay at the Vercel Hobby 12-function limit. Auth
// is shared with the regular subscription-status flow — the admin path
// additionally requires the authenticated user's email to match
// ADMIN_EMAIL.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getUserFromAuthHeader(req.headers.authorization)
  if (!user) {
    return res.status(401).json({ error: 'Not signed in.' })
  }

  const scope = typeof req.query?.scope === 'string' ? req.query.scope : undefined
  if (scope === 'admin') {
    const adminEmail = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase()
    const userEmail = (user.email ?? '').trim().toLowerCase()
    if (!adminEmail || !userEmail || adminEmail !== userEmail) {
      // 404 (not 403) so the endpoint doesn't advertise its existence
      // to non-admin users probing the API.
      return res.status(404).json({ error: 'Not found.' })
    }
    try {
      const stats = await getAdminStats()
      return res.status(200).json(stats)
    } catch (err) {
      console.error('[admin-stats] failed:', err)
      return res.status(500).json({ error: 'Failed to load admin stats.' })
    }
  }

  const result = await getSubscriptionDetail(user.id, process.env.STRIPE_SECRET_KEY)
  res.status(result.status).json(result.body)
}

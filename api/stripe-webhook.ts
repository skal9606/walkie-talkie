import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleStripeWebhook } from '../lib/stripe-webhook.js'

// Disable Vercel's automatic JSON body parsing — Stripe's signature is
// calculated over the raw bytes and won't verify if we let Vercel reformat.
export const config = {
  api: { bodyParser: false },
}

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const raw = await readRawBody(req)
  const result = await handleStripeWebhook({
    rawBody: raw,
    signature: req.headers['stripe-signature'],
    stripeSecret: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  })
  res.status(result.status).json(result.body)
}

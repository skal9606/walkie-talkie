import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import {
  createCheckoutSession,
  reviewTranscript,
  translate,
  type HandlerResult,
} from './lib/api-handlers'
import { addUsageSeconds, checkSessionAccess, mintGatedSession } from './lib/gating'
import { handleStripeWebhook } from './lib/stripe-webhook'
import { getUserIdFromAuthHeader } from './lib/supabase-admin'

// Local dev API endpoints. In production these live in api/*.ts as Vercel
// serverless functions — both sides share the handler logic in lib/.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Copy env-file values into process.env so server-side modules (supabase
  // admin client, Stripe helpers) can read them the same way they do in
  // production serverless.
  for (const [k, v] of Object.entries(env)) {
    if (v && !process.env[k]) process.env[k] = v
  }

  async function readJsonBody<T = unknown>(req: IncomingMessage): Promise<T> {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    if (chunks.length === 0) return {} as T
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
  }

  async function readRawBody(req: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    return Buffer.concat(chunks)
  }

  function sendResult(res: ServerResponse, result: HandlerResult) {
    res.statusCode = result.status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(result.body))
  }

  function authHeader(req: IncomingMessage): string | undefined {
    const h = req.headers['authorization']
    return Array.isArray(h) ? h[0] : h
  }

  return {
    plugins: [
      react(),
      {
        name: 'dev-api',
        configureServer(server) {
          server.middlewares.use('/api/session', async (req, res) => {
            const userId = await getUserIdFromAuthHeader(authHeader(req))
            if (!userId) return sendResult(res, { status: 401, body: { error: 'Not signed in.' } })
            sendResult(res, await mintGatedSession(userId, env.OPENAI_API_KEY))
          })

          server.middlewares.use('/api/heartbeat', async (req, res) => {
            if (req.method !== 'POST') {
              return sendResult(res, { status: 405, body: { error: 'Method not allowed' } })
            }
            const userId = await getUserIdFromAuthHeader(authHeader(req))
            if (!userId) return sendResult(res, { status: 401, body: { error: 'Not signed in.' } })
            const body = await readJsonBody<{ seconds?: number }>(req)
            const seconds = Math.min(Math.max(0, Math.floor(body.seconds ?? 0)), 60)
            try {
              await addUsageSeconds(userId, seconds)
            } catch (err) {
              return sendResult(res, { status: 500, body: { error: String(err) } })
            }
            const access = await checkSessionAccess(userId)
            sendResult(res, {
              status: 200,
              body: {
                subscribed: access.subscribed,
                secondsRemaining: access.secondsRemaining,
              },
            })
          })

          server.middlewares.use('/api/translate', async (req, res) => {
            const body = await readJsonBody<{ text?: string }>(req)
            sendResult(res, await translate(env.OPENAI_API_KEY, body.text))
          })

          server.middlewares.use('/api/review', async (req, res) => {
            const body = await readJsonBody<Parameters<typeof reviewTranscript>[1]>(req)
            sendResult(res, await reviewTranscript(env.OPENAI_API_KEY, body))
          })

          server.middlewares.use('/api/stripe-webhook', async (req, res) => {
            if (req.method !== 'POST') {
              return sendResult(res, { status: 405, body: { error: 'Method not allowed' } })
            }
            const raw = await readRawBody(req)
            sendResult(
              res,
              await handleStripeWebhook({
                rawBody: raw,
                signature: req.headers['stripe-signature'],
                stripeSecret: env.STRIPE_SECRET_KEY,
                webhookSecret: env.STRIPE_WEBHOOK_SECRET,
              }),
            )
          })

          server.middlewares.use('/api/create-checkout-session', async (req, res) => {
            const userId = await getUserIdFromAuthHeader(authHeader(req))
            if (!userId) return sendResult(res, { status: 401, body: { error: 'Not signed in.' } })
            const body = await readJsonBody<Parameters<typeof createCheckoutSession>[1]>(req)
            sendResult(
              res,
              await createCheckoutSession(
                {
                  stripeSecretKey: env.STRIPE_SECRET_KEY,
                  monthlyPriceId: env.STRIPE_MONTHLY_PRICE_ID,
                  yearlyPriceId: env.STRIPE_YEARLY_PRICE_ID,
                },
                { ...body, userId },
              ),
            )
          })
        },
      },
    ],
  }
})

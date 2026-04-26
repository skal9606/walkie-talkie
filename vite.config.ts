import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import {
  cancelSubscription,
  createCheckoutSession,
  deleteAccount,
  getSubscriptionDetail,
  reviewTranscript,
  translate,
  type HandlerResult,
} from './lib/api-handlers.js'
import { addUsageSeconds, checkSessionAccess, mintGatedSession } from './lib/gating.js'
import { handleStripeWebhook } from './lib/stripe-webhook.js'
import { getUserIdFromAuthHeader } from './lib/supabase-admin.js'

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
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'apple-touch-icon.png',
          'icon-192.png',
          'icon-512.png',
          'icon-maskable-512.png',
        ],
        manifest: {
          name: 'Walkie Talkie',
          short_name: 'Walkie Talkie',
          description:
            'Master Brazilian Portuguese with a real-time AI voice tutor. Speak, listen, and learn.',
          theme_color: '#0f1115',
          background_color: '#0f1115',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: '/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // SPA navigation fallback for the app shell. The Realtime voice
          // session needs network anyway, so we don't try to cache /api or
          // serve anything offline beyond the shell.
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        },
        devOptions: {
          enabled: false,
        },
      }),
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
            const userId = await getUserIdFromAuthHeader(authHeader(req))
            if (!userId) return sendResult(res, { status: 401, body: { error: 'Not signed in.' } })
            const body = await readJsonBody<{ text?: string }>(req)
            sendResult(res, await translate(env.OPENAI_API_KEY, body.text))
          })

          server.middlewares.use('/api/review', async (req, res) => {
            const userId = await getUserIdFromAuthHeader(authHeader(req))
            if (!userId) return sendResult(res, { status: 401, body: { error: 'Not signed in.' } })
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

          server.middlewares.use('/api/subscription-status', async (req, res) => {
            const userId = await getUserIdFromAuthHeader(authHeader(req))
            if (!userId) return sendResult(res, { status: 401, body: { error: 'Not signed in.' } })
            sendResult(res, await getSubscriptionDetail(userId, env.STRIPE_SECRET_KEY))
          })

          server.middlewares.use('/api/cancel-subscription', async (req, res) => {
            if (req.method !== 'POST') {
              return sendResult(res, { status: 405, body: { error: 'Method not allowed' } })
            }
            const userId = await getUserIdFromAuthHeader(authHeader(req))
            if (!userId) return sendResult(res, { status: 401, body: { error: 'Not signed in.' } })
            sendResult(res, await cancelSubscription(userId, env.STRIPE_SECRET_KEY))
          })

          server.middlewares.use('/api/delete-account', async (req, res) => {
            if (req.method !== 'POST') {
              return sendResult(res, { status: 405, body: { error: 'Method not allowed' } })
            }
            const userId = await getUserIdFromAuthHeader(authHeader(req))
            if (!userId) return sendResult(res, { status: 401, body: { error: 'Not signed in.' } })
            sendResult(res, await deleteAccount(userId, env.STRIPE_SECRET_KEY))
          })
        },
      },
    ],
  }
})

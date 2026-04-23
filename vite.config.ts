import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import {
  createCheckoutSession,
  mintSessionToken,
  reviewTranscript,
  translate,
  type HandlerResult,
} from './lib/api-handlers'

// Local dev API endpoints. In production these live in api/*.ts as Vercel
// serverless functions — both sides share the handler logic in lib/api-handlers.ts.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  async function readJsonBody<T = unknown>(req: IncomingMessage): Promise<T> {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    if (chunks.length === 0) return {} as T
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
  }

  function sendResult(res: ServerResponse, result: HandlerResult) {
    res.statusCode = result.status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(result.body))
  }

  return {
    plugins: [
      react(),
      {
        name: 'dev-api',
        configureServer(server) {
          server.middlewares.use('/api/session', async (_req, res) => {
            sendResult(res, await mintSessionToken(env.OPENAI_API_KEY))
          })

          server.middlewares.use('/api/translate', async (req, res) => {
            const body = await readJsonBody<{ text?: string }>(req)
            sendResult(res, await translate(env.OPENAI_API_KEY, body.text))
          })

          server.middlewares.use('/api/review', async (req, res) => {
            const body = await readJsonBody<Parameters<typeof reviewTranscript>[1]>(req)
            sendResult(res, await reviewTranscript(env.OPENAI_API_KEY, body))
          })

          server.middlewares.use('/api/create-checkout-session', async (req, res) => {
            const body = await readJsonBody<Parameters<typeof createCheckoutSession>[1]>(req)
            sendResult(
              res,
              await createCheckoutSession(
                {
                  stripeSecretKey: env.STRIPE_SECRET_KEY,
                  monthlyPriceId: env.STRIPE_MONTHLY_PRICE_ID,
                  yearlyPriceId: env.STRIPE_YEARLY_PRICE_ID,
                },
                body,
              ),
            )
          })
        },
      },
    ],
  }
})

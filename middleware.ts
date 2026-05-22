// Vercel Edge Middleware. Runs ahead of route handlers; gates /admin
// behind HTTP Basic Auth so the dashboard URL is invisible to anyone
// without the password. Defense in depth — the API endpoint at
// /api/subscription-status?scope=admin still enforces the email check
// against ADMIN_EMAIL, so even if someone somehow got past Basic Auth
// they'd still get 404 on the data fetch.
//
// Browser UX: visiting /admin without credentials shows the standard
// HTTP Basic Auth prompt. Once entered, the browser caches them for
// the session — no separate login UI to build.
//
// Setup: set ADMIN_BASIC_AUTH in Vercel project env vars (Production,
// Preview, Development) as a single string "user:password".

export const config = {
  matcher: ['/admin', '/admin/:path*'],
}

export default function middleware(request: Request): Response | undefined {
  const expected = process.env.ADMIN_BASIC_AUTH
  if (!expected) {
    // Fail closed if not configured rather than allowing through.
    return new Response('Admin gate not configured.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  const header = request.headers.get('authorization') ?? ''
  // Standard format: "Basic <base64('user:password')>".
  const expectedHeader = `Basic ${btoa(expected)}`

  if (header !== expectedHeader) {
    return new Response('Authentication required.', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="walkietalkie admin"',
        'Content-Type': 'text/plain',
      },
    })
  }

  // Allow through — falling off the end (returning undefined) lets the
  // normal route handler take over.
  return undefined
}

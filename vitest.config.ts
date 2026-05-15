import { defineConfig } from 'vitest/config'

// Minimal vitest setup focused on src/lib/. UI-level component tests
// (React Testing Library, etc.) live elsewhere when we add them; this
// config exists for non-DOM logic tests + the WebRTC-shaped surface in
// realtime.ts. happy-dom is faster than jsdom and sufficient for the
// constructor-existence checks our WebRTC tests need.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'lib/**/*.test.ts'],
    globals: false,
  },
})

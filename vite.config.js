import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Expose only the public form configuration to the client. The narrow
  // TURNSTILE_SITE_ prefix makes TURNSTILE_SITE_KEY available without ever
  // matching the server-only TURNSTILE_SECRET_KEY.
  envPrefix: ['VITE_', 'INFINITY_', 'AIVEX_', 'TURNSTILE_SITE_'],
  server: {
    // Dev only (ignored by `vite build`): forward /api to the local
    // functions runner (`npm run dev:api`). In production Vercel serves
    // api/ natively on the same domain, so no proxy is needed there.
    proxy: {
      '/api': { target: `http://localhost:${process.env.DEV_API_PORT || 3001}`, changeOrigin: true },
    },
  },
})

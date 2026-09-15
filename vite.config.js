import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Expose the public form endpoints to the client. Kept narrow on purpose:
  // server secrets (SUPABASE_*, secrets, passwords) never match these
  // prefixes and are therefore never inlined into the browser bundle.
  envPrefix: ['VITE_', 'INFINITY_', 'AIVEX_'],
  server: {
    // Dev only (ignored by `vite build`): forward /api to the local
    // functions runner (`npm run dev:api`). In production Vercel serves
    // api/ natively on the same domain, so no proxy is needed there.
    proxy: {
      '/api': { target: `http://localhost:${process.env.DEV_API_PORT || 3001}`, changeOrigin: true },
    },
  },
})

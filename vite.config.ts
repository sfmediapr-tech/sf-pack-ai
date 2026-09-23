import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * A stand-in for /api/concept while developing.
 *
 * Vite does not run the Vercel function, and burning real image-model credits
 * on every reload is wasteful, so in `vite dev` this returns a procedural
 * surface graphic instead. It exercises the whole path — request, decode,
 * cover-fit, scrim, texture upload — without a provider key.
 *
 * `apply: 'serve'` keeps it out of the production build entirely. Deployed,
 * the real function in api/concept.ts answers this route.
 */
function conceptStub(): Plugin {
  return {
    name: 'concept-stub',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/concept', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end(JSON.stringify({ error: 'Use POST.' }))
        }
        let raw = ''
        req.on('data', (c) => (raw += c))
        req.on('end', () => {
          let width = 1024
          let height = 1024
          try {
            const b = JSON.parse(raw || '{}')
            width = b?.size?.width ?? width
            height = b?.size?.height ?? height
          } catch {
            /* defaults are fine */
          }
          const svg = placeholderSurface(width, height)
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(
            JSON.stringify({
              dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
              provider: 'dev-stub',
              model: 'procedural placeholder (no provider key in dev)',
            }),
          )
        })
      })
    },
  }
}

/** An abstract, text-free surface — the shape of thing a real model returns. */
function placeholderSurface(w: number, h: number): string {
  const rings = Array.from({ length: 7 }, (_, i) => {
    const r = (Math.min(w, h) / 2) * (0.22 + i * 0.12)
    return `<circle cx="${w / 2}" cy="${h * 0.42}" r="${r.toFixed(1)}" fill="none" stroke="#ffffff" stroke-opacity="${(0.16 - i * 0.018).toFixed(3)}" stroke-width="${(2 + i * 0.6).toFixed(1)}"/>`
  }).join('')
  const stems = Array.from({ length: 9 }, (_, i) => {
    const x = (w / 10) * (i + 1)
    const sway = (i % 2 ? 1 : -1) * w * 0.035
    return `<path d="M${x.toFixed(0)} ${h} C ${(x + sway).toFixed(0)} ${(h * 0.72).toFixed(0)}, ${(x - sway).toFixed(0)} ${(h * 0.5).toFixed(0)}, ${x.toFixed(0)} ${(h * 0.3).toFixed(0)}" fill="none" stroke="#ffffff" stroke-opacity="0.13" stroke-width="1.6"/>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#1d4a3a"/><stop offset="0.55" stop-color="#0e3b2e"/><stop offset="1" stop-color="#07231b"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  ${stems}${rings}
</svg>`
}

export default defineConfig({
  plugins: [react(), conceptStub()],
  server: { port: 5178 },
  build: {
    rollupOptions: {
      output: {
        // Three.js is the bulk of the app and changes rarely; keeping it in
        // its own chunk means a copy change to the studio does not invalidate
        // 600 kB of cached geometry code.
        manualChunks: {
          three: ['three'],
          gsap: ['gsap', '@gsap/react'],
        },
      },
    },
  },
})

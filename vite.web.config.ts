import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// Browser-only harness for visual validation against the design reference.
// The renderer must run without Electron APIs; see src/renderer/src/lib/bridge.ts.
export default defineConfig({
  root: 'src/renderer',
  resolve: {
    alias: { $lib: resolve('src/renderer/src/lib') },
  },
  server: { port: Number(process.env.PORT) || 5273, strictPort: true },
  plugins: [svelte()],
})

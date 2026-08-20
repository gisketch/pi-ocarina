import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  // The svelte plugin compiles `.svelte.ts` rune modules so state stores can be
  // exercised headlessly, without a DOM.
  plugins: [svelte()],
  resolve: {
    alias: { $lib: resolve('src/renderer/src/lib') },
    // The client runtime, not the server one: tests over stores must see the
    // same reactivity the app does — under the server build `$effect` is inert,
    // and an invalidation-granularity contract cannot be proved at all.
    conditions: ['browser'],
  },
  test: {
    include: ['src/**/*.{test,spec}.ts'],
    environment: 'node',
  },
})

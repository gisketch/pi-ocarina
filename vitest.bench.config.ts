import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

/** The perf bench runs alone: `pnpm bench` (vitest run -c this file). Kept out
 *  of `pnpm test`'s include so timing noise can never fail CI. */
export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: { $lib: resolve('src/renderer/src/lib') },
  },
  test: {
    include: ['scripts/bench/**/*.bench.ts'],
    environment: 'node',
    // One worker, no isolation churn: the numbers are the product.
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },
    testTimeout: 120_000,
  },
})

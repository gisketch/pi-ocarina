import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  // Output lives under dist/ (not electron-vite's default out/) so build
  // artifacts stay inside the harness's ignored paths.
  main: {
    // pi and its provider SDKs stay in node_modules rather than being bundled:
    // they ship their own dynamic requires and are far too heavy to inline.
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/main',
      rollupOptions: { input: resolve('src/main/index.ts') },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
      rollupOptions: { input: resolve('src/preload/index.ts') },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'dist/renderer',
      rollupOptions: { input: resolve('src/renderer/index.html') },
    },
    resolve: {
      alias: { $lib: resolve('src/renderer/src/lib') },
    },
    plugins: [svelte()],
  },
})

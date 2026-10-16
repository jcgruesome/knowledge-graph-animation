import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// `@kg/runtime` is the data seam main.ts reads through; the screensaver config swaps it.
export default defineConfig({
  resolve: { alias: { '@kg/runtime': fileURLToPath(new URL('./src/runtime.ts', import.meta.url)) } },
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/** Drops the Google Fonts links (fonts are bundled) and hides the interactive chrome. */
const screensaverHtml = (): Plugin => ({
  name: 'screensaver-html',
  transformIndexHtml(html) {
    return html
      .replace(/<link[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>\s*/g, '')
      .replace('</head>', '<style>#search, .hud .hint { display: none !important; }</style></head>');
  },
});

/** publicDir is off (public/kits can hold real prospect kits); ship only the one static asset the page references. */
const logoAsset = (): Plugin => ({
  name: 'screensaver-logo-asset',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'reshapex-logo.svg', source: readFileSync('public/reshapex-logo.svg') });
  },
});

export default defineConfig({
  base: './',
  plugins: [screensaverHtml(), logoAsset()],
  resolve: { alias: { '@kg/runtime': fileURLToPath(new URL('./src/screensaver/runtime.ts', import.meta.url)) } },
  publicDir: false,
  build: { outDir: 'dist-screensaver/web', emptyOutDir: true, target: 'es2022' },
});

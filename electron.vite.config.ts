import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { randomBytes } from 'node:crypto';

const devNonce = randomBytes(18).toString('base64');
export default defineConfig(({ command }) => ({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { main: resolve('src/main/main.ts'), interviewWorker: resolve('src/main/interviewWorker.ts') } } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve('src/main/preload.ts') } },
  },
  renderer: {
    root: 'src/renderer',
    // Allow .task binary model files to be imported as URLs
    assetsInclude: ['**/*.task'],
    html: command === 'serve' ? { cspNonce: devNonce } : undefined,
    plugins: [react(), {
      name: 'novi-development-csp', apply: 'serve',
      transformIndexHtml(html) {
        return html.replace(
          /script-src [^;]+;/,
          `script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob: 'nonce-${devNonce}';`
        );
      },
    }],
    build: { rollupOptions: { input: resolve('src/renderer/index.html') } },
  },
}));

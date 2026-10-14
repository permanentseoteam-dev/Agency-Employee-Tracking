import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const root = import.meta.dirname

// Production-only Content-Security-Policy. Dev is left without it because the
// React refresh preamble is an inline script that a strict CSP would block.
function cspPlugin(pbUrl: string): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${pbUrl}`,
    `connect-src 'self' ${pbUrl}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'"
  ].join('; ')
  return {
    name: 'pseo-tracker-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`
      )
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, 'VITE_')
  const pbUrl = env.VITE_PB_URL ?? 'http://127.0.0.1:8090'

  return {
    main: {
      build: {
        rollupOptions: {
          input: { index: resolve(root, 'electron/main/index.ts') }
        }
      }
    },
    preload: {
      build: {
        // Sandboxed preloads must be a single CommonJS file with no external imports.
        externalizeDeps: false,
        rollupOptions: {
          input: { index: resolve(root, 'electron/preload/index.ts') },
          output: { format: 'cjs' }
        }
      }
    },
    renderer: {
      root: '.',
      resolve: {
        alias: { '@': resolve(root, 'src') }
      },
      plugins: [react(), tailwindcss(), cspPlugin(pbUrl)],
      build: {
        minify: true,
        rollupOptions: {
          input: { index: resolve(root, 'index.html') }
        }
      }
    }
  }
})

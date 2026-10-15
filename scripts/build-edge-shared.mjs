// Bundles the tested pure logic (server/pb_hooks/lib/*.js, CommonJS) into ES modules the
// Supabase Edge Functions import: supabase/functions/_shared/logic/<name>.js.
// The CommonJS files stay the one source; Vitest keeps testing them.
// Run after changing any of them: node scripts/build-edge-shared.mjs
import { readdirSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'

const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'server', 'pb_hooks', 'lib')
const OUT = join(ROOT, 'supabase', 'functions', '_shared', 'logic')
mkdirSync(OUT, { recursive: true })

// Pure libraries only: the *_store.js files use PocketBase and are re-done in SQL.
const libs = readdirSync(SRC).filter((f) => f.endsWith('.js') && !f.endsWith('_store.js'))
for (const file of libs) {
  await build({
    entryPoints: [join(SRC, file)],
    outfile: join(OUT, file),
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    banner: { js: `// GENERATED from server/pb_hooks/lib/${file} by scripts/build-edge-shared.mjs. Do not edit.` },
    logLevel: 'warning'
  })
}
console.log(`bundled ${libs.length} libraries into supabase/functions/_shared/logic/`)

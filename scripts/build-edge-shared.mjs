// Bundles the tested pure logic (shared/logic/*.js, CommonJS) into ES modules the
// Supabase Edge Functions import: supabase/functions/_shared/logic/<name>.js.
// The CommonJS files stay the one source; Vitest keeps testing them.
// Run after changing any of them: node scripts/build-edge-shared.mjs
import { readdirSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'

const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'shared', 'logic')
const OUT = join(ROOT, 'supabase', 'functions', '_shared', 'logic')
mkdirSync(OUT, { recursive: true })

const libs = readdirSync(SRC).filter((f) => f.endsWith('.js'))
for (const file of libs) {
  await build({
    entryPoints: [join(SRC, file)],
    outfile: join(OUT, file),
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    banner: { js: `// GENERATED from shared/logic/${file} by scripts/build-edge-shared.mjs. Do not edit.` },
    logLevel: 'warning'
  })
}
console.log(`bundled ${libs.length} libraries into supabase/functions/_shared/logic/`)

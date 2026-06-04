#!/usr/bin/env node
/**
 * FoxCode channel — npm-pack bundle assembler.
 *
 * Copies ../extension/ (the Firefox WebExtension sources) into ./extension/
 * immediately before `npm pack`/`npm publish`. This makes the published
 * foxcode-channel tarball self-sufficient: a fresh `npx -y foxcode-channel`
 * has everything needed to launch Firefox without any IDE plugin payload.
 *
 * The local ./extension/ directory MUST stay gitignored — it is a build
 * artefact that only exists during the publish window. `npm pack`'s built-in
 * `postpack` (or scripts/test-channel-bundle-drift.sh) removes it.
 */
import { cp, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(HERE, '..', 'extension')
const DST = join(HERE, 'extension')

const SKIP_NAMES = new Set(['node_modules', '.foxcode', '.DS_Store'])

async function copyTree(src, dst) {
  await cp(src, dst, {
    recursive: true,
    force: true,
    filter: (s) => {
      const base = s.split(/[\\/]/).pop()
      if (SKIP_NAMES.has(base)) return false
      if (base.endsWith('.test.js') || base.endsWith('.test.mjs')) return false
      return true
    },
  })
}

async function main() {
  if (!existsSync(SRC)) {
    throw new Error(`prepack: source extension dir not found at ${SRC}`)
  }
  if (existsSync(DST)) await rm(DST, { recursive: true, force: true })
  await mkdir(DST, { recursive: true })
  console.error(`prepack: copying ${SRC} -> ${DST}`)
  await copyTree(SRC, DST)
  console.error('prepack: extension bundle ready')
}

main().catch((err) => {
  console.error(`prepack failed: ${err.stack || err.message}`)
  process.exit(1)
})

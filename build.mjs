/**
 * Build driver for dsh-reboot — runs tsdown (esm node half + cjs client half).
 * Runs tsdown's ESM entry directly with node instead of the node_modules/.bin
 * shim, because the shim is a POSIX shell script that cmd cannot run on Windows.
 */
import { rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
process.chdir(HERE)

await rm('lib', { recursive: true, force: true })

const require = createRequire(import.meta.url)
const pkgJson = require.resolve('tsdown/package.json')
const tsdownEntry = join(dirname(pkgJson), 'dist', 'run.mjs')
execFileSync(process.execPath, [tsdownEntry], { stdio: 'inherit' })

#!/usr/bin/env node
// Runs the Canvas2D proof-of-concept in headless Chrome and records real timings.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const page = resolve('scripts/poc/renderer-poc.html')
const profile = mkdtempSync(join(tmpdir(), 'coloring-poc-'))

let html = ''
try {
  html = execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      `--user-data-dir=${profile}`,
      '--virtual-time-budget=20000',
      '--dump-dom',
      `file://${page}`,
    ],
    { encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024 },
  )
} finally {
  rmSync(profile, { recursive: true, force: true })
}

const match = html.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!match) {
  console.error('POC result block not found')
  process.exit(1)
}
const text = match[1]
  .replaceAll('&quot;', '"')
  .replaceAll('&amp;', '&')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .trim()

if (!text.startsWith('{')) {
  console.error(text)
  process.exit(1)
}

const result = JSON.parse(text)
mkdirSync('.private', { recursive: true })
writeFileSync('.private/poc-results.json', JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
console.log('\nwritten to .private/poc-results.json')

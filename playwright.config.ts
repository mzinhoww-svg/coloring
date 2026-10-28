import path from 'node:path'
import { defineConfig } from '@playwright/test'

/**
 * Independent QA E2E configuration for the integrated Rabisco build.
 *
 * Owner: QA. This file never changes product code; it only serves the app.
 *   npm run dev        -> E2E_MODE=dev (default, serves current src)
 *   npm run preview    -> E2E_MODE=preview (serves dist)
 *   BASE_URL=...       -> point at an already-served build
 *
 * Port 5273 is reserved for QA on this app (dev 5173, preview 4173).
 */

const PORT = Number(process.env.E2E_PORT ?? 5273)
const MODE = process.env.E2E_MODE === 'preview' ? 'preview' : 'dev'
const BASE_URL = process.env.BASE_URL ?? `http://127.0.0.1:${PORT}`
const ROOT = import.meta.dirname
const ARTIFACTS = path.join(ROOT, 'evidence/qa/artifacts')

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: path.join(ARTIFACTS, 'test-results'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(ARTIFACTS, `results-${MODE}.json`) }],
    ['html', { outputFolder: path.join(ARTIFACTS, `html-${MODE}`), open: 'never' }],
  ],
  use: {
    baseURL: BASE_URL,
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `npm run ${MODE} -- --port ${PORT} --strictPort --host 127.0.0.1`,
        cwd: ROOT,
        url: BASE_URL,
        // Do not silently test a stale dev server when this run requests the
        // production preview (the service-worker E2E requires the real dist).
        reuseExistingServer: false,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'desktop-chrome',
      testMatch: /(^|\/)(walkthrough|gameplay|tools|persistence|offline|fullscreen)\.spec\.ts$/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'tablet-landscape',
      testMatch: /responsive\.spec\.ts/,
      use: {
        viewport: { width: 1180, height: 820 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'phone-portrait',
      testMatch: /(responsive|mobile)\.spec\.ts/,
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
})

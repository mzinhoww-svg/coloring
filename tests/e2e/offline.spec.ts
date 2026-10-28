import { expect, test } from '@playwright/test'
import {
  SEL,
  collectPageIssues,
  findPaperPixel,
  isColorClose,
  mouseStroke,
  readPixel,
  readStoredPixel,
  selectColor,
  settleCanvas,
  waitForSaved,
} from './helpers/app'

/**
 * Real offline E2E: no service-worker mock, no cached-response stub.
 *
 * Preconditions — the built app must be served, because only `dist/` carries
 * the stamped worker and `offline-manifest.json`:
 *
 *   npm run build && E2E_MODE=preview npx playwright test tests/e2e/offline.spec.ts \
 *     --project=desktop-chrome
 *
 * Flow: install the real worker → verify the "Disponível offline" status →
 * open a drawing through a deep hash route → cut the network → reload from the
 * cache → paint with a palette colour → autosave → reload still offline and
 * prove the pixel survived.
 */

const BLUE = '#5dcae2'
const DRAWING_ID = 'animals-1'
const READY = '[data-offline-host][aria-label="Disponível offline"]'

/** Chromium noise expected while the context has no network at all. */
const OFFLINE_NETWORK_NOISE =
  /(Failed to load resource|net::ERR_INTERNET_DISCONNECTED|net::ERR_NETWORK_CHANGED|net::ERR_CONNECTION_RESET)/

test.describe('offline mode with the real service worker', () => {
  test('paints on a deep link offline and keeps the pixel across reloads', async ({
    page,
    context,
  }) => {
    const issues = collectPageIssues(page)

    // Fails fast and clearly when the dev server is used instead of dist/.
    const manifest = await page.request.get('/offline-manifest.json')
    expect(
      manifest.ok(),
      'offline E2E needs the built app (E2E_MODE=preview, after npm run build)',
    ).toBe(true)
    expect(await manifest.json()).toMatchObject({ schemaVersion: 1 })

    // 1. Online boot: the real worker installs, verifies the precache and
    //    reports readiness through the status pill's accessible name.
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('pack-grid')).toBeVisible()
    await expect(page.locator(READY).first()).toBeVisible({ timeout: 40_000 })

    const worker = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      return {
        controlled: Boolean(navigator.serviceWorker.controller),
        active: registration?.active?.state ?? null,
        scope: registration?.scope ?? null,
        caches: await caches.keys(),
      }
    })
    expect(worker.active, 'service worker is activated for the app scope').toBe('activated')
    expect(worker.scope, 'worker scope is the app root').toBe(`${new URL(page.url()).origin}/`)
    expect(worker.caches.some((name) => name.startsWith('coloring-offline-v1-'))).toBe(true)

    // 2. Deep hash route, like a shared link to one drawing.
    await page.goto(`/#/draw/${DRAWING_ID}`, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(new RegExp(`#/draw/${DRAWING_ID}$`))
    await expect(page.getByTestId('studio')).toBeVisible()
    await expect(page.locator(SEL.canvas)).toHaveAttribute('width', '1024')
    await expect(page.locator(SEL.loading)).toHaveCount(0)

    // 3. Cut the network and reload: the document must come from the cache.
    //    The shell and manifest are served `no-cache`/`no-store`, so the HTTP
    //    cache must revalidate; with the network down only the worker can answer.
    await context.setOffline(true)
    await page.reload({ waitUntil: 'domcontentloaded' })

    await expect(page).toHaveURL(new RegExp(`#/draw/${DRAWING_ID}$`))
    await expect(page.getByTestId('studio')).toBeVisible()
    await expect(page.locator(SEL.canvas)).toBeVisible()
    await expect(page.locator(SEL.loading)).toHaveCount(0)
    await expect(page.locator(READY).first()).toBeVisible({ timeout: 20_000 })
    expect(await page.evaluate(() => navigator.onLine), 'browser reports no network').toBe(false)
    expect(
      await page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
      'the cached document is controlled by the real worker',
    ).toBe(true)

    // 4. Paint offline with a colour from the integrated palette.
    const target = await findPaperPixel(page, 512, 512)
    expect((await readPixel(page, target.x, target.y)).a, 'target starts as paper').toBe(0)
    await selectColor(page, BLUE)
    await mouseStroke(page, target, { x: target.x + 70, y: target.y })
    await settleCanvas(page)

    const painted = await readPixel(page, target.x, target.y)
    expect(isColorClose(painted, BLUE), `offline stroke was ${JSON.stringify(painted)}`).toBe(true)

    // 5. Autosave must finish while still offline.
    await waitForSaved(page)
    const stored = await readStoredPixel(page, DRAWING_ID, target.x, target.y)
    expect(stored, 'IndexedDB holds the offline stroke').not.toBeNull()
    expect(isColorClose(stored!, BLUE), 'stored blob matches the palette colour').toBe(true)

    // 6. Second reload, still offline: pixel and readiness survive.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('studio')).toBeVisible()
    await expect(page.locator(SEL.canvas)).toBeVisible()
    await expect(page.locator(SEL.loading)).toHaveCount(0)
    await settleCanvas(page)

    const restored = await readPixel(page, target.x, target.y)
    expect(
      isColorClose(restored, BLUE),
      `pixel lost across offline reloads: ${JSON.stringify(restored)}`,
    ).toBe(true)
    await expect(page.locator(READY).first()).toBeVisible({ timeout: 20_000 })
    expect(await page.evaluate(() => navigator.onLine)).toBe(false)

    // Strict failure budget: unhandled exceptions never pass; only the network
    // errors caused by deliberately disabling connectivity are tolerated.
    const pageErrors = issues.filter((issue) => issue.startsWith('pageerror:'))
    expect(pageErrors, `unhandled page errors: ${pageErrors.join(' | ')}`).toEqual([])
    const unexpected = issues.filter(
      (issue) => issue.startsWith('console.error:') && !OFFLINE_NETWORK_NOISE.test(issue),
    )
    expect(unexpected, `unexpected console errors: ${unexpected.join(' | ')}`).toEqual([])
  })
})

import { expect, test } from '@playwright/test'
import { openDrawing } from './helpers/app'

test('studio fullscreen control enters and exits immersive mode', async ({ page }) => {
  await openDrawing(page, 'animals-3')
  const button = page.getByTestId('fullscreen-toggle')

  await expect(button).toHaveAttribute('aria-label', 'Ativar tela cheia')
  await button.click()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute('data-testid'))).toBe('studio')
  await expect(button).toHaveAttribute('aria-label', 'Sair da tela cheia')

  await button.click()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull()
  await expect(button).toHaveAttribute('aria-label', 'Ativar tela cheia')
})

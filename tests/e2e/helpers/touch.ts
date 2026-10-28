import type { Page } from '@playwright/test'
import { canvasBox, toClient, type Box } from './app'

/** Minimal structural type for a Chrome DevTools Protocol session. */
interface CdpLike {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>
  detach(): Promise<void>
}

/**
 * Real touch input through CDP. Chrome turns these into trusted touch events,
 * which the browser translates into pointerdown/move/up with pointerType
 * "touch" — the same path a finger takes, unlike synthetic dispatchEvent.
 */
export class TouchDriver {
  private constructor(private readonly client: CdpLike) {}

  static async attach(page: Page): Promise<TouchDriver> {
    const session = (await page.context().newCDPSession(page)) as unknown as CdpLike
    return new TouchDriver(session)
  }

  async tap(x: number, y: number): Promise<void> {
    await this.client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id: 1 }],
    })
    await this.client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }

  async drag(
    from: { x: number; y: number },
    to: { x: number; y: number },
    steps = 10,
  ): Promise<void> {
    await this.client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: from.x, y: from.y, id: 1 }],
    })
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      await this.client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, id: 1 },
        ],
      })
    }
    await this.client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }

  /** Starts a drag and cancels it with a real touchCancel (OS/browser interruption). */
  async cancelDrag(
    from: { x: number; y: number },
    to: { x: number; y: number },
    steps = 4,
  ): Promise<void> {
    await this.client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: from.x, y: from.y, id: 1 }],
    })
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      await this.client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, id: 1 },
        ],
      })
    }
    await this.client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  }

  async detach(): Promise<void> {
    await this.client.detach().catch(() => undefined)
  }
}

export async function touchGeometry(page: Page): Promise<{ box: Box }> {
  return { box: await canvasBox(page) }
}

export async function touchStroke(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 10,
): Promise<void> {
  const box = await canvasBox(page)
  const driver = await TouchDriver.attach(page)
  try {
    await driver.drag(toClient(box, from.x, from.y), toClient(box, to.x, to.y), steps)
  } finally {
    await driver.detach()
  }
}

export async function touchTap(page: Page, x: number, y: number): Promise<void> {
  const box = await canvasBox(page)
  const driver = await TouchDriver.attach(page)
  try {
    const point = toClient(box, x, y)
    await driver.tap(point.x, point.y)
  } finally {
    await driver.detach()
  }
}

export async function touchCancelStroke(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const box = await canvasBox(page)
  const driver = await TouchDriver.attach(page)
  try {
    await driver.cancelDrag(toClient(box, from.x, from.y), toClient(box, to.x, to.y))
  } finally {
    await driver.detach()
  }
}

import { describe, expect, it } from 'vitest'
import { LatestWriter } from '../../src/storage/latest-writer'

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('LatestWriter', () => {
  it('serialises writes per drawing and keeps the newest payload', async () => {
    const writes: string[] = []
    const gates = [deferred(), deferred()]
    let gateIndex = 0
    const writer = new LatestWriter<string>(async (id, payload) => {
      writes.push(`${id}:${payload}`)
      await gates[gateIndex++].promise
    })

    const first = writer.submit('cat', 'v1')
    await Promise.resolve()
    await Promise.resolve()
    expect(writes).toEqual(['cat:v1'])

    const second = writer.submit('cat', 'v2')

    gates[0].resolve()
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(writes).toEqual(['cat:v1', 'cat:v2'])

    gates[1].resolve()
    await Promise.all([first, second])
    expect(writes).toEqual(['cat:v1', 'cat:v2'])
  })

  it('never mixes payloads across drawing ids', async () => {
    const writes: Array<[string, string]> = []
    const gateA = deferred()
    const writer = new LatestWriter<string>(async (id, payload) => {
      writes.push([id, payload])
      if (id === 'a') await gateA.promise
    })

    const a = writer.submit('a', 'a1')
    const b = writer.submit('b', 'b1')
    await b
    expect(writes).toEqual([
      ['a', 'a1'],
      ['b', 'b1'],
    ])

    gateA.resolve()
    await a
    expect(writer.isBusy('a')).toBe(false)
    expect(writer.isBusy('b')).toBe(false)
  })

  it('flushes queued payloads and resolves callers', async () => {
    const writes: string[] = []
    const writer = new LatestWriter<string>(async (_id, payload) => {
      await new Promise((resolve) => setTimeout(resolve, 1))
      writes.push(payload)
    })
    const pending = writer.submit('x', 'latest')
    await writer.flush('x')
    await pending
    expect(writes).toEqual(['latest'])
    expect(writer.pendingIds).toEqual([])
  })

  it('propagates write failures and allows a later retry', async () => {
    let calls = 0
    const writer = new LatestWriter<string>(async (_id, payload) => {
      calls++
      if (calls === 1) throw new Error('quota')
      expect(payload).toBe('retry')
    })

    await expect(writer.submit('x', 'first')).rejects.toThrow('quota')
    await writer.submit('x', 'retry')
    expect(calls).toBe(2)
  })

  it('does not lose a payload submitted while a write is in flight', async () => {
    const release = deferred()
    const writes: string[] = []
    const writer = new LatestWriter<string>(async (_id, payload) => {
      writes.push(payload)
      if (payload === 'one') await release.promise
    })

    const first = writer.submit('x', 'one')
    await Promise.resolve()
    await Promise.resolve()
    const second = writer.submit('x', 'two')
    release.resolve()
    await Promise.all([first, second])
    expect(writes).toEqual(['one', 'two'])
  })

  it('opens the first write synchronously, inside the caller task', async () => {
    const release = deferred()
    const order: string[] = []
    const writer = new LatestWriter<string>(async (_id, payload) => {
      order.push(`write:${payload}`)
      await release.promise
    })

    // Durability depends on this: the IndexedDB transaction must start in the
    // same task as the stroke. If submit deferred the write to a later task, a
    // reload triggered right after painting would win the race.
    const pending = writer.submit('x', 'stroke')
    order.push('after-submit')
    expect(order).toEqual(['write:stroke', 'after-submit'])

    release.resolve()
    await pending
  })
})

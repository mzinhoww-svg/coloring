/**
 * Serialises writes per drawing id and always writes the newest payload.
 *
 * A slow save for drawing A can never overwrite drawing B, and two saves for
 * the same drawing cannot finish out of order. Callers get a promise that
 * settles after their payload (or a newer one) has been written.
 *
 * The first write for an idle id starts synchronously inside `submit()` (an
 * async function runs to its first `await` in the calling task). That matters
 * for durability: the IndexedDB transaction is opened in the same task as the
 * stroke, so reloading or closing the tab right after painting cannot drop it.
 */
export class LatestWriter<T> {
  private readonly latest = new Map<string, T>()
  private readonly chains = new Map<string, Promise<void>>()

  constructor(private readonly write: (id: string, payload: T) => Promise<void>) {}

  /** Queues `payload` and resolves once the queue for `id` is drained. */
  submit(id: string, payload: T): Promise<void> {
    this.latest.set(id, payload)
    let chain = this.chains.get(id)
    if (!chain) {
      chain = this.drain(id).finally(() => {
        if (this.chains.get(id) === chain) this.chains.delete(id)
      })
      this.chains.set(id, chain)
    }
    return chain
  }

  /** Resolves when nothing is queued or in flight for `id`, or all ids. */
  async flush(id?: string): Promise<void> {
    if (id !== undefined) {
      const chain = this.chains.get(id)
      if (chain) await chain
      return
    }
    await Promise.all([...this.chains.values()])
  }

  get pendingIds(): string[] {
    return [...this.chains.keys()]
  }

  isBusy(id: string): boolean {
    return this.chains.has(id)
  }

  private async drain(id: string): Promise<void> {
    while (this.latest.has(id)) {
      const next = this.latest.get(id) as T
      this.latest.delete(id)
      await this.write(id, next)
    }
  }
}

/**
 * IndexedDB persistence. Raster pixels are stored as PNG Blobs; no base64 or
 * pixel strings ever reach localStorage. One record per drawing.
 */

export interface StoredDrawing {
  id: string
  /** Full-resolution colour layer (transparent background, PNG). */
  blob: Blob
  /** Small composited preview used by the gallery. */
  thumbnail: Blob | null
  updatedAt: number
  width: number
  height: number
}

export interface DrawingStoreLike {
  put(record: StoredDrawing): Promise<void>
  get(id: string): Promise<StoredDrawing | undefined>
  getAll(): Promise<StoredDrawing[]>
  delete(id: string): Promise<void>
  close(): void
}

const DB_NAME = 'coloring-web'
const DB_VERSION = 1
const STORE = 'drawings'

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export class DrawingStore implements DrawingStoreLike {
  private constructor(private readonly db: IDBDatabase) {}

  static isSupported(): boolean {
    return typeof indexedDB !== 'undefined'
  }

  static open(): Promise<DrawingStore> {
    if (!DrawingStore.isSupported()) {
      return Promise.reject(new Error('Este navegador não oferece armazenamento IndexedDB.'))
    }
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' })
          store.createIndex('updatedAt', 'updatedAt')
        }
      }
      request.onsuccess = () => resolve(new DrawingStore(request.result))
      request.onerror = () =>
        reject(request.error ?? new Error('Não foi possível abrir o armazenamento local.'))
      request.onblocked = () =>
        reject(new Error('O armazenamento local está bloqueado por outra aba.'))
    })
  }

  async put(record: StoredDrawing): Promise<void> {
    const tx = this.db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(record)
    await transactionDone(tx)
  }

  async get(id: string): Promise<StoredDrawing | undefined> {
    const tx = this.db.transaction(STORE, 'readonly')
    const result = await requestToPromise<StoredDrawing | undefined>(
      tx.objectStore(STORE).get(id),
    )
    await transactionDone(tx)
    return result
  }

  async getAll(): Promise<StoredDrawing[]> {
    const tx = this.db.transaction(STORE, 'readonly')
    const result = await requestToPromise<StoredDrawing[]>(tx.objectStore(STORE).getAll())
    await transactionDone(tx)
    return result.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async delete(id: string): Promise<void> {
    const tx = this.db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    await transactionDone(tx)
  }

  close(): void {
    this.db.close()
  }
}

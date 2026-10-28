import './style.css'
import { packs, drawings, getDrawingSvg } from './content/art'
import { basePalette } from './content/palette'
import { prepareOffline, registerOffline } from './offline'
import { WORK_SIZE, PaintingEngine, type HistoryState, type ToolId } from './engine/painting-engine'
import type { PaintFinish } from './engine/brushes'
import { TOOLS } from './engine/brushes'
import { SoundPlayer } from './engine/sound'
import { DrawingStore, type StoredDrawing } from './storage/drawing-store'
import { LatestWriter } from './storage/latest-writer'

interface OfflineState {
  ready: boolean
  online: boolean
  error?: string
}

type SaveStatus = 'new' | 'dirty' | 'saving' | 'saved' | 'error'

type Route =
  | { name: 'home' }
  | { name: 'pack'; packId: string }
  | { name: 'mine' }
  | { name: 'draw'; drawingId: string }
  | { name: 'missing' }

interface DrawingMeta {
  id: string
  packId: string
  title: string
}

/** The 40 colours serialized in the original APK, in their recovered order. */
const PALETTE = basePalette.map((color) => color.hex.toLowerCase())

const TOOL_KEYS: Record<string, ToolId> = {
  b: 'brush',
  p: 'pencil',
  m: 'marker',
  c: 'crayon',
  f: 'fill',
  e: 'eraser',
}

const TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
})

type IconName =
  | 'brush'
  | 'pencil'
  | 'marker'
  | 'crayon'
  | 'glitter'
  | 'fill'
  | 'eraser'
  | 'undo'
  | 'redo'
  | 'trash'
  | 'download'
  | 'back'
  | 'sound'
  | 'muted'
  | 'offline'
  | 'check'
  | 'warning'
  | 'cloud'
  | 'sparkle'
  | 'expand'
  | 'compress'

const ICONS: Record<IconName, string> = {
  brush:
    '<path d="M4 20c3.2.2 5.3-1.3 6.2-4.1l7.6-7.6-3.1-3.1-7.6 7.6C4.3 13.7 2.7 15.8 3 19c.1.6.4 1 1 1Z"/><path d="m13.4 6.6 4 4"/>',
  pencil:
    '<path d="m4 20 1.1-4.2L15.7 5.2a2 2 0 0 1 2.8 0l1.3 1.3a2 2 0 0 1 0 2.8L9.2 19.9 5 21l-1-1Z"/><path d="m14.2 6.7 3.1 3.1"/>',
  marker:
    '<path d="m6 18 7.6-7.6 3 3L9 21H6v-3Z"/><path d="m13.6 6.4 2.4-2.4 3 3-2.4 2.4"/><path d="M7 18h1"/>',
  crayon:
    '<path d="M8.5 21 5 17.5 14.2 4.6l5.2 3.8L10.2 21H8.5Z"/><path d="m13.2 5.8 4 3.1"/><path d="m7 17 4 3"/>',
  glitter:
    '<path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/><path d="m18.5 15.5.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1Z"/>',
  fill:
    '<path d="m5 11 7-7 7 7-7 7-7-7Z"/><path d="M19 14.5c1.4 1.9 2 3 2 4a2 2 0 0 1-4 0c0-1 .6-2.1 2-4Z"/><path d="m8.5 8.5 7 7"/>',
  eraser:
    '<path d="m4 16.5 8.2-8.2 5.5 5.5-8.2 8.2H6l-2-2v-3.5Z"/><path d="m9.1 11.4 5.5 5.5"/><path d="M10 22h9"/>',
  undo:
    '<path d="M9 7 4 12l5 5"/><path d="M4 12h9.5a5.5 5.5 0 0 1 0 11H9"/>',
  redo:
    '<path d="m15 7 5 5-5 5"/><path d="M20 12h-9.5a5.5 5.5 0 0 0 0 11H15"/>',
  trash:
    '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="m6 7 1 13h10l1-13"/><path d="M10 11v5"/><path d="M14 11v5"/>',
  download:
    '<path d="M12 4v11"/><path d="m8 11 4 4 4-4"/><path d="M5 20h14"/>',
  back: '<path d="M15 5 8 12l7 7"/><path d="M8 12h12"/>',
  sound:
    '<path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M18.5 6.5a8 8 0 0 1 0 11"/>',
  muted:
    '<path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="m16 10 4 4"/><path d="m20 10-4 4"/>',
  offline:
    '<path d="M7 18h9.5a3.5 3.5 0 0 0 .4-7 5.5 5.5 0 0 0-10.6 1.3A3 3 0 0 0 7 18Z"/><path d="M12 12v6"/><path d="m9.5 15.5 2.5 2.5 2.5-2.5"/>',
  check: '<path d="m5 12.5 4.2 4.2L19 6.8"/>',
  warning:
    '<path d="M12 4 3 20h18L12 4Z"/><path d="M12 9v5"/><path d="M12 17h.01"/>',
  cloud:
    '<path d="M7 18h9.5a3.5 3.5 0 0 0 .4-7 5.5 5.5 0 0 0-10.6 1.3A3 3 0 0 0 7 18Z"/>',
  sparkle:
    '<path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/>',
  expand:
    '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  compress:
    '<path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3M16 21v-3a2 2 0 0 1 2-2h3"/>',
}

function icon(name: IconName, className = 'icon'): string {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

function safeColor(value: string): string {
  return /^#[0-9a-f]{3,8}$/i.test(value) ? value : '#e85d78'
}

function drawingHref(id: string): string {
  return `#/draw/${encodeURIComponent(id)}`
}

function packHref(id: string): string {
  return `#/pack/${encodeURIComponent(id)}`
}

function parseRoute(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '')
  let parts: string[]
  try {
    parts = clean.split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    return { name: 'missing' }
  }
  if (parts[0] === 'pack' && parts[1]) return { name: 'pack', packId: parts[1] }
  if (parts[0] === 'draw' && parts[1]) return { name: 'draw', drawingId: parts[1] }
  if (parts[0] === 'mine') return { name: 'mine' }
  return { name: 'home' }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
}

function formatSavedAt(timestamp: number): string {
  const saved = new Date(timestamp)
  const today = new Date()
  if (saved.toDateString() === today.toDateString()) {
    return `Salvo às ${TIME_FORMAT.format(saved)}`
  }
  return `Salvo em ${saved.toLocaleDateString('pt-BR')}`
}

function offlineErrorMessage(code?: string): string {
  if (!code) return 'O modo offline ainda não está disponível.'
  if (code.includes('insecure')) return 'O modo offline exige HTTPS ou localhost.'
  if (code.includes('unsupported')) return 'Este navegador não oferece modo offline.'
  if (code.includes('activation') || code.includes('timeout')) {
    return 'A preparação offline demorou demais. Tente novamente.'
  }
  if (code.includes('registration')) return 'O modo offline não pôde ser registrado. Recarregue a página.'
  if (code.includes('missing') || code.includes('verify')) {
    return 'Alguns arquivos ainda não foram guardados. Tente novamente com internet.'
  }
  return 'O modo offline ainda não está disponível.'
}

function formatWorkDate(timestamp: number): string {
  const date = new Date(timestamp)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) {
    return `Hoje, ${TIME_FORMAT.format(date)}`
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

class ColoringApp {
  private readonly root: HTMLElement
  private store: DrawingStore | null = null
  private storeError: string | null = null
  private saved = new Map<string, StoredDrawing>()
  private writer: LatestWriter<StoredDrawing>
  private sound = new SoundPlayer()
  private offline: OfflineState = { ready: false, online: navigator.onLine }
  private offlinePreparing = false

  private engine: PaintingEngine | null = null
  private activeDrawingId: string | null = null
  private saveStatus: SaveStatus = 'new'
  private saveTimestamp: number | null = null
  private saveError: string | null = null
  private dirty = false
  private saving: Promise<void> | null = null
  private saveSeq = 0
  private lastSaveErrorToast = 0
  private studioRoot: HTMLElement | null = null
  private assetUrls: string[] = []
  private routeChain: Promise<void> = Promise.resolve()
  private toastTimer: number | undefined
  private disposed = false

  constructor(root: HTMLElement) {
    this.root = root
    this.writer = new LatestWriter<StoredDrawing>(async (id, record) => {
      if (record.id !== id) throw new Error('Registro de desenho inconsistente.')
      if (!this.store) throw new Error(this.storeError ?? 'Armazenamento local indisponível.')
      await this.store.put(record)
      this.saved.set(id, record)
    })
  }

  async boot(): Promise<void> {
    this.root.innerHTML = `
      <div class="boot-screen" role="status">
        <div class="brand-mark" aria-hidden="true">${icon('brush')}</div>
        <p>Abrindo o estojo…</p>
        <span class="spinner" aria-hidden="true"></span>
      </div>`
    await this.openStore()
    this.registerOffline()
    window.addEventListener('hashchange', () => this.queueRoute())
    window.addEventListener('pagehide', () => {
      void this.flushSave()
    })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.flushSave()
    })
    document.addEventListener('click', this.handleGlobalClick)
    document.addEventListener('fullscreenchange', this.handleFullscreenChange)
    await this.render()
  }

  private async openStore(): Promise<void> {
    try {
      this.store = await DrawingStore.open()
      const records = await this.store.getAll()
      this.saved = new Map(records.map((record) => [record.id, record]))
      this.storeError = null
    } catch (error) {
      this.store = null
      this.storeError = errorMessage(error)
    }
  }

  private registerOffline(): void {
    try {
      void registerOffline((state: OfflineState) => {
        this.offline = {
          ready: Boolean(state.ready),
          online: Boolean(state.online),
          error: state.error,
        }
        this.updateOfflineControls()
      }).catch((error: unknown) => {
        this.offline = {
          ready: false,
          online: navigator.onLine,
          error: errorMessage(error),
        }
        this.updateOfflineControls()
      })
    } catch (error) {
      this.offline = {
        ready: false,
        online: navigator.onLine,
        error: errorMessage(error),
      }
    }
  }

  private queueRoute(): void {
    this.routeChain = this.routeChain
      .then(() => this.render())
      .catch((error) => {
        this.toast(errorMessage(error), 'error')
      })
  }

  private async render(): Promise<void> {
    if (this.disposed) return
    const route = parseRoute(window.location.hash)
    if (this.engine) {
      await this.flushSave()
      this.teardownStudio()
    }
    this.releaseAssets()
    this.root.innerHTML = ''
    switch (route.name) {
      case 'pack':
        this.renderPack(route.packId)
        break
      case 'mine':
        this.renderMine()
        break
      case 'draw':
        await this.renderStudio(route.drawingId)
        break
      case 'missing':
        this.renderMissing()
        break
      default:
        this.renderHome()
    }
    if (route.name !== 'draw') window.scrollTo({ top: 0, behavior: 'auto' })
  }

  private releaseAssets(): void {
    for (const url of this.assetUrls) URL.revokeObjectURL(url)
    this.assetUrls = []
  }

  private svgUrl(svg: string): string {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    this.assetUrls.push(url)
    return url
  }

  private thumbUrl(record: StoredDrawing): string {
    const blob = record.thumbnail ?? record.blob
    const url = URL.createObjectURL(blob)
    this.assetUrls.push(url)
    return url
  }

  private drawingImage(drawing: DrawingMeta, saved?: StoredDrawing): string {
    if (saved) {
      return `<img src="${this.thumbUrl(saved)}" alt="" loading="lazy" draggable="false">`
    }
    try {
      const svg = getDrawingSvg(drawing.id)
      return `<img src="${this.svgUrl(svg)}" alt="" loading="lazy" draggable="false">`
    } catch {
      return '<span class="art-fallback" aria-hidden="true"></span>'
    }
  }

  private packCover(packId: string): string {
    const first = drawings.find((drawing) => drawing.packId === packId)
    if (!first) return '<span class="art-fallback" aria-hidden="true"></span>'
    try {
      return `<img src="${this.svgUrl(getDrawingSvg(first.id))}" alt="" loading="lazy" draggable="false">`
    } catch {
      return '<span class="art-fallback" aria-hidden="true"></span>'
    }
  }

  private offlineControl(): string {
    if (this.offlinePreparing) {
      return `<span class="status-pill is-pending" data-offline-host role="status" aria-label="Preparando o modo offline" title="Preparando o modo offline">${icon('cloud')}<span>Preparando…</span></span>`
    }
    if (this.offline.ready) {
      return `<span class="status-pill is-ready" data-offline-host role="status" aria-label="Disponível offline" title="O jogo abre sem internet">${icon('check')}<span>Offline pronto</span></span>`
    }
    if (!this.offline.online) {
      return `<span class="status-pill is-warning" data-offline-host role="status" aria-label="Sem conexão e ainda não disponível offline" title="${escapeHtml(
        this.offline.error ? offlineErrorMessage(this.offline.error) : 'Conecte-se para baixar o jogo',
      )}">${icon('warning')}<span>Sem conexão</span></span>`
    }
    return `<button class="status-pill is-action" data-action="offline" data-offline-host aria-label="Baixar o jogo para uso offline" title="${escapeHtml(
      this.offline.error ? offlineErrorMessage(this.offline.error) : 'Guardar o jogo no dispositivo',
    )}">${icon('offline')}<span>Baixar offline</span></button>`
  }

  private soundButton(): string {
    const enabled = this.sound.isEnabled
    return `<button class="icon-button" data-action="sound" aria-pressed="${enabled}" aria-label="${
      enabled ? 'Desativar sons' : 'Ativar sons'
    }" title="${enabled ? 'Som ligado' : 'Som desligado'}">${icon(enabled ? 'sound' : 'muted')}</button>`
  }

  private storageBanner(): string {
    if (!this.storeError) return ''
    return `<div class="storage-banner" data-storage-banner role="alert">
      ${icon('warning')}
      <div><strong>Não foi possível salvar no aparelho.</strong><span>${escapeHtml(
        this.storeError,
      )}</span></div>
      <button class="text-button" data-action="retry-storage">Tentar novamente</button>
    </div>`
  }

  private topbar(): string {
    return `<header class="topbar">
      <a class="brand" href="#/" aria-label="Rabisco, ir para as galerias">
        <span class="brand-mark">${icon('brush')}</span>
        <span class="brand-name">Rabisco</span>
      </a>
      <div class="topbar-actions">
        <span data-offline-host>${this.offlineControl().replace('data-offline-host', '')}</span>
        ${this.soundButton()}
      </div>
    </header>`
  }

  private renderHome(): void {
    const savedCount = this.saved.size
    const recent = [...this.saved.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((record) => ({
        record,
        drawing: drawings.find((drawing) => drawing.id === record.id),
        pack: packs.find((pack) => pack.id === drawings.find((d) => d.id === record.id)?.packId),
      }))
      .filter(
        (item): item is { record: StoredDrawing; drawing: DrawingMeta; pack: (typeof packs)[number] } =>
          Boolean(item.drawing && item.pack),
      )
      .slice(0, 4)

    const heroDrawings = packs
      .map((pack) => drawings.find((drawing) => drawing.packId === pack.id))
      .filter((drawing): drawing is DrawingMeta => Boolean(drawing))
      .slice(0, 3)

    this.root.innerHTML = `
      <div class="site">
        ${this.topbar()}
        <main class="home">
          ${this.storageBanner()}
          <section class="hero">
            <div class="hero-copy">
              <p class="eyebrow">${icon('sparkle')} Desenhos originais para pintar</p>
              <h1>Um mundo de cores<br><em>na sua tela.</em></h1>
              <p class="lede">Escolha uma galeria, solte a imaginação e guarde cada obra. Tudo funciona no navegador — e continua funcionando offline.</p>
              <div class="hero-actions">
                ${packs[0] ? `<a class="primary-button" href="${packHref(packs[0].id)}">Começar a colorir ${icon('sparkle')}</a>` : ''}
                <a class="secondary-button" href="#/mine">Minhas obras${
                  savedCount > 0 ? ` <span class="count-badge">${savedCount}</span>` : ''
                }</a>
              </div>
            </div>
            <div class="hero-collage" aria-hidden="true">
              ${heroDrawings
                .map(
                  (drawing, index) => `<figure class="hero-card hero-card-${index + 1}">
                    ${this.drawingImage(drawing)}
                  </figure>`,
                )
                .join('')}
              <span class="hero-blob hero-blob-1"></span>
              <span class="hero-blob hero-blob-2"></span>
            </div>
          </section>

          <section class="section-block" id="galerias">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Nove mundos</p>
                <h2>Galerias para explorar</h2>
              </div>
              <span class="section-note">${drawings.length} desenhos no total</span>
            </div>
            <div class="pack-grid" data-testid="pack-grid">
              ${packs
                .map((pack) => {
                  const packDrawings = drawings.filter((drawing) => drawing.packId === pack.id)
                  const done = packDrawings.filter((drawing) => this.saved.has(drawing.id)).length
                  return `<a class="pack-card" href="${packHref(pack.id)}" style="--pack-color:${safeColor(
                    pack.color,
                  )}" data-testid="pack-card-${pack.id}">
                    <div class="pack-cover" aria-hidden="true">${this.packCover(pack.id)}</div>
                    <div class="pack-copy">
                      <span class="pack-emoji" aria-hidden="true">${escapeHtml(pack.emoji)}</span>
                      <div>
                        <h3>${escapeHtml(pack.title)}</h3>
                        <p>${packDrawings.length} desenhos${done > 0 ? ` · ${done} começado${done === 1 ? '' : 's'}` : ''}</p>
                      </div>
                      <span class="pack-arrow" aria-hidden="true">${icon('back')}</span>
                    </div>
                  </a>`
                })
                .join('')}
            </div>
          </section>

          ${
            recent.length > 0
              ? `<section class="section-block">
                  <div class="section-heading">
                    <div><p class="eyebrow">Suas obras</p><h2>Continue de onde parou</h2></div>
                    <a class="text-link" href="#/mine">Ver todas</a>
                  </div>
                  <div class="recent-grid">
                    ${recent
                      .map(
                        ({ record, drawing, pack }) => `<a class="recent-card" href="${drawingHref(
                          drawing.id,
                        )}" data-testid="recent-${drawing.id}">
                          <div class="recent-art"><img src="${this.thumbUrl(record)}" alt="" draggable="false"></div>
                          <div class="recent-copy">
                            <h3>${escapeHtml(drawing.title)}</h3>
                            <p>${escapeHtml(pack.title)} · ${formatWorkDate(record.updatedAt)}</p>
                          </div>
                        </a>`,
                      )
                      .join('')}
                  </div>
                </section>`
              : ''
          }
        </main>
        <footer class="site-footer">
          <span class="brand-mini">${icon('brush')} Rabisco</span>
          <p>Arte original feita para esta versão web. Nada de anúncios, compras ou contas.</p>
        </footer>
      </div>`
  }

  private renderPack(packId: string): void {
    const pack = packs.find((candidate) => candidate.id === packId)
    if (!pack) {
      this.renderMissing()
      return
    }
    const packDrawings = drawings.filter((drawing) => drawing.packId === packId)
    const done = packDrawings.filter((drawing) => this.saved.has(drawing.id)).length
    this.root.innerHTML = `
      <div class="site">
        ${this.topbar()}
        <main class="page">
          ${this.storageBanner()}
          <nav class="breadcrumb" aria-label="Navegação">
            <a href="#/" class="text-link">${icon('back')} Galerias</a>
          </nav>
          <header class="pack-header" style="--pack-color:${safeColor(pack.color)}">
            <div class="pack-header-emoji" aria-hidden="true">${escapeHtml(pack.emoji)}</div>
            <div>
              <p class="eyebrow">Galeria</p>
              <h1>${escapeHtml(pack.title)}</h1>
              <p>${packDrawings.length} desenhos${done > 0 ? ` · ${done} começado${done === 1 ? '' : 's'}` : ''}</p>
            </div>
          </header>
          <div class="drawing-grid" data-testid="drawing-grid">
            ${packDrawings
              .map((drawing, index) => {
                const record = this.saved.get(drawing.id)
                return `<a class="drawing-card${record ? ' has-work' : ''}" href="${drawingHref(
                  drawing.id,
                )}" data-testid="drawing-card-${drawing.id}">
                  <span class="drawing-number">${String(index + 1).padStart(2, '0')}</span>
                  <div class="drawing-art">${this.drawingImage(drawing, record)}</div>
                  <div class="drawing-copy">
                    <h2>${escapeHtml(drawing.title)}</h2>
                    ${
                      record
                        ? `<span class="work-badge">${icon('check')} Salvo</span>`
                        : '<span class="start-badge">Colorir</span>'
                    }
                  </div>
                </a>`
              })
              .join('')}
          </div>
          ${packDrawings.length === 0 ? '<p class="empty-note">Esta galeria ainda não tem desenhos.</p>' : ''}
        </main>
        <footer class="site-footer">
          <span class="brand-mini">${icon('brush')} Rabisco</span>
          <p>${escapeHtml(pack.title)} · ${packDrawings.length} desenhos</p>
        </footer>
      </div>`
  }

  private renderMine(): void {
    const records = [...this.saved.values()].sort((a, b) => b.updatedAt - a.updatedAt)
    const works = records
      .map((record) => {
        const drawing = drawings.find((candidate) => candidate.id === record.id)
        const pack = drawing ? packs.find((candidate) => candidate.id === drawing.packId) : undefined
        return drawing && pack ? { record, drawing, pack } : null
      })
      .filter((work): work is { record: StoredDrawing; drawing: DrawingMeta; pack: (typeof packs)[number] } =>
        Boolean(work),
      )

    this.root.innerHTML = `
      <div class="site">
        ${this.topbar()}
        <main class="page">
          ${this.storageBanner()}
          <nav class="breadcrumb" aria-label="Navegação">
            <a href="#/" class="text-link">${icon('back')} Galerias</a>
          </nav>
          <header class="page-header">
            <p class="eyebrow">Salvos neste aparelho</p>
            <h1>Minhas obras</h1>
            <p class="page-subtitle">${
              works.length === 0
                ? 'Nenhum desenho salvo ainda.'
                : `${works.length} desenho${works.length === 1 ? '' : 's'} guardado${works.length === 1 ? '' : 's'}.`
            }</p>
          </header>
          ${
            works.length > 0
              ? `<div class="mine-grid" data-testid="mine-grid">
                  ${works
                    .map(
                      ({ record, drawing, pack }) => `<a class="mine-card" href="${drawingHref(
                        drawing.id,
                      )}" data-testid="mine-card-${drawing.id}">
                        <div class="mine-art"><img src="${this.thumbUrl(record)}" alt="" loading="lazy" draggable="false"></div>
                        <div class="mine-copy">
                          <h2>${escapeHtml(drawing.title)}</h2>
                          <p>${escapeHtml(pack.title)} · ${formatWorkDate(record.updatedAt)}</p>
                        </div>
                      </a>`,
                    )
                    .join('')}
                </div>`
              : `<div class="empty-state">
                  <div class="empty-illustration" aria-hidden="true">${icon('sparkle')}</div>
                  <h2>O primeiro rabisco começa agora</h2>
                  <p>Escolha uma galeria e pinte. O progresso é salvo sozinho neste aparelho.</p>
                  ${packs[0] ? `<a class="primary-button" href="${packHref(packs[0].id)}">Escolher um desenho</a>` : ''}
                </div>`
          }
        </main>
        <footer class="site-footer">
          <span class="brand-mini">${icon('brush')} Rabisco</span>
          <p>Salvo localmente no navegador.</p>
        </footer>
      </div>`
  }

  private renderMissing(): void {
    this.root.innerHTML = `
      <div class="site">
        ${this.topbar()}
        <main class="page">
          <div class="empty-state">
            <div class="empty-illustration" aria-hidden="true">${icon('warning')}</div>
            <h1>Não encontramos este desenho</h1>
            <p>Ele pode ter saído da galeria. Volte e escolha outra página para colorir.</p>
            <a class="primary-button" href="#/">Voltar às galerias</a>
          </div>
        </main>
      </div>`
  }

  private toolButton(tool: { id: ToolId; label: string }): string {
    return `<button class="tool-button" data-tool="${tool.id}" aria-pressed="false" title="${tool.label}">
      ${icon(tool.id as IconName)}<span>${tool.label}</span>
    </button>`
  }

  private async renderStudio(drawingId: string): Promise<void> {
    const drawing = drawings.find((candidate) => candidate.id === drawingId)
    const pack = drawing ? packs.find((candidate) => candidate.id === drawing.packId) : undefined
    if (!drawing || !pack) {
      this.renderMissing()
      return
    }
    const record = this.saved.get(drawing.id)
    this.saveStatus = record ? 'saved' : 'new'
    this.saveTimestamp = record?.updatedAt ?? null
    this.saveError = null
    this.dirty = false

    this.root.innerHTML = `
      <div class="studio" data-testid="studio">
        <header class="studio-bar">
          <button class="icon-button is-done" data-action="back" aria-label="Concluir e voltar para a galeria" title="Concluir">${icon(
            'check',
          )}</button>
          <div class="studio-title">
            <span class="studio-emoji" aria-hidden="true">${escapeHtml(pack.emoji)}</span>
            <div>
              <p>${escapeHtml(pack.title)}</p>
              <h1>${escapeHtml(drawing.title)}</h1>
            </div>
          </div>
          <div class="studio-status">
            <button class="save-chip is-${this.saveStatus}" data-action="save" data-testid="save-status" title="Salvar agora">
              ${this.saveChipContent()}
            </button>
            <span class="studio-offline"><span data-offline-host>${this.offlineControl().replace(
              'data-offline-host',
              '',
            )}</span></span>
            ${this.soundButton()}
            <button class="icon-button" data-action="fullscreen" data-testid="fullscreen-toggle" aria-label="Ativar tela cheia" title="Ativar tela cheia" aria-pressed="false"${
              this.fullscreenSupported() ? '' : ' disabled'
            }>${icon('expand')}</button>
          </div>
        </header>
        <main class="studio-main">
          <section class="stage-column">
            ${this.storageBanner()}
            <div class="stage-frame">
              <div class="canvas-host" data-testid="canvas-host"></div>
              <div class="stage-loading" data-loading role="status">
                <span class="spinner" aria-hidden="true"></span>
                <p>Preparando o desenho…</p>
              </div>
              <div class="stage-error" data-load-error hidden></div>
            </div>
            <p class="stage-hint">${icon('sparkle')} Pinte com o dedo ou o mouse. Seu progresso é salvo sozinho.</p>
          </section>
          <aside class="tool-rail" aria-label="Ferramentas de pintura">
            <section class="rail-section">
              <div class="rail-heading"><h2>Ferramentas</h2><span class="rail-note">${TOOLS.length}</span></div>
              <div class="tool-grid" data-testid="tool-grid">
                ${TOOLS.map((tool) => this.toolButton(tool)).join('')}
              </div>
            </section>
            <section class="rail-section">
              <div class="rail-heading">
                <label for="brush-size">Tamanho</label>
                <output for="brush-size" data-size-output>16</output>
              </div>
              <div class="size-row">
                <span class="size-preview" data-size-preview aria-hidden="true"></span>
                <input id="brush-size" data-testid="size-range" type="range" min="2" max="64" step="1" value="16" aria-label="Tamanho do pincel">
              </div>
            </section>
            <section class="rail-section">
              <div class="rail-heading"><h2>Cores</h2><span class="rail-note">Toque para escolher</span></div>
              <div class="palette" data-testid="palette" role="group" aria-label="Cores">
                ${PALETTE.map(
                  (color, index) =>
                    `<button class="swatch${index === 0 ? ' is-selected' : ''}" style="--swatch:${color}" data-color="${color}" aria-label="${escapeHtml(
                      basePalette[index].name,
                    )}" title="${escapeHtml(basePalette[index].name)}" aria-pressed="${index === 0}"></button>`,
                ).join('')}
                <button class="swatch swatch-glitter" data-finish="glitter" data-testid="palette-glitter" aria-label="Glitter para pincel ou balde" aria-pressed="false" title="Glitter para pincel ou balde">
                  ${icon('glitter')}
                </button>
              </div>
            </section>
            <section class="rail-section rail-actions">
              <div class="action-row">
                <button class="action-button" data-action="undo" data-testid="undo" aria-label="Desfazer" title="Desfazer" disabled>${icon(
                  'undo',
                )}<span>Desfazer</span></button>
                <button class="action-button" data-action="redo" data-testid="redo" aria-label="Refazer" title="Refazer" disabled>${icon(
                  'redo',
                )}<span>Refazer</span></button>
              </div>
              <div class="action-row">
                <button class="action-button" data-action="export" data-testid="export" aria-label="Baixar PNG" title="Baixar PNG">${icon(
                  'download',
                )}<span>Baixar PNG</span></button>
                <button class="action-button is-danger" data-action="clear" data-testid="clear" aria-label="Limpar o desenho" title="Limpar o desenho">${icon(
                  'trash',
                )}<span>Limpar</span></button>
              </div>
            </section>
          </aside>
        </main>
        <dialog class="confirm-dialog" data-clear-dialog aria-labelledby="clear-title">
          <form method="dialog">
            <div class="dialog-icon" aria-hidden="true">${icon('trash')}</div>
            <h2 id="clear-title">Limpar o desenho?</h2>
            <p>As cores saem, mas o desenho continua aqui. Você pode desfazer depois.</p>
            <div class="dialog-actions">
              <button value="cancel" class="secondary-button">Cancelar</button>
              <button value="confirm" class="danger-button">Sim, limpar</button>
            </div>
          </form>
        </dialog>
      </div>`

    this.studioRoot = this.root.querySelector<HTMLElement>('.studio')
    const host = this.root.querySelector<HTMLElement>('[data-testid="canvas-host"]')
    if (!host || !this.studioRoot) return

    const engine = new PaintingEngine(host, {
      onHistoryChange: (state) => this.updateHistoryButtons(state),
      onDirty: () => this.markDirty(),
      onSound: (sound) => this.sound.play(sound),
    })
    this.engine = engine
    this.activeDrawingId = drawing.id
    engine.setColor(PALETTE[0])
    this.studioRoot.style.setProperty('--tool-color', safeColor(PALETTE[0]))
    engine.setSize(16)
    this.selectTool(engine.tool)

    this.bindStudioControls(engine)
    this.updateFullscreenButton()
    window.addEventListener('keydown', this.handleKeyDown)
    this.updateOfflineControls()

    try {
      let savedBlob: Blob | null = record?.blob ?? null
      try {
        await engine.load(getDrawingSvg(drawing.id), savedBlob)
      } catch (error) {
        if (!savedBlob) throw error
        savedBlob = null
        await engine.load(getDrawingSvg(drawing.id), null)
        this.saveStatus = 'new'
        this.saveTimestamp = null
        this.updateSaveChip()
        this.toast('A pintura anterior não pôde ser restaurada. Começando uma página nova.', 'warning')
      }
      if (this.engine !== engine) return
      this.root.querySelector('[data-loading]')?.remove()
      this.updateHistoryButtons(engine.historyState)
      this.updateSaveChip()
    } catch (error) {
      if (this.engine !== engine) return
      const loading = this.root.querySelector<HTMLElement>('[data-loading]')
      if (loading) loading.hidden = true
      const box = this.root.querySelector<HTMLElement>('[data-load-error]')
      if (box) {
        box.hidden = false
        box.innerHTML = `<div class="dialog-icon">${icon('warning')}</div>
          <h2>Não foi possível abrir o desenho</h2>
          <p>${escapeHtml(errorMessage(error))}</p>
          <a class="secondary-button" href="${packHref(pack.id)}">Voltar para a galeria</a>`
      }
    }
  }

  private bindStudioControls(engine: PaintingEngine): void {
    const studio = this.studioRoot
    if (!studio) return

    studio.addEventListener('click', (event) => {
      const target = event.target as HTMLElement

      const toolButton = target.closest<HTMLElement>('[data-tool]')
      if (toolButton?.dataset.tool) {
        this.selectTool(toolButton.dataset.tool as ToolId)
        return
      }

      const swatch = target.closest<HTMLElement>('[data-color]')
      if (swatch?.dataset.color) {
        this.selectColor(swatch.dataset.color)
        return
      }

      const finish = target.closest<HTMLElement>('[data-finish]')
      if (finish?.dataset.finish === 'glitter') {
        this.selectFinish('glitter')
        return
      }

      const action = target.closest<HTMLElement>('[data-action]')?.dataset.action
      if (!action) return
      switch (action) {
        case 'back':
          void this.leaveStudio()
          break
        case 'undo':
          engine.undo()
          break
        case 'redo':
          engine.redo()
          break
        case 'clear': {
          const dialog = studio.querySelector<HTMLDialogElement>('[data-clear-dialog]')
          dialog?.showModal()
          break
        }
        case 'export':
          void this.exportPng(engine)
          break
        case 'save':
          void this.flushSave()
          break
        case 'fullscreen':
          void this.toggleFullscreen()
          break
        default:
          break
      }
    })

    const dialog = studio.querySelector<HTMLDialogElement>('[data-clear-dialog]')
    dialog?.addEventListener('close', () => {
      if (dialog.returnValue === 'confirm' && this.engine === engine) {
        engine.clear()
        dialog.returnValue = ''
      }
    })

    const slider = studio.querySelector<HTMLInputElement>('#brush-size')
    const output = studio.querySelector<HTMLOutputElement>('[data-size-output]')
    const preview = studio.querySelector<HTMLElement>('[data-size-preview]')
    const applySize = (value: number) => {
      engine.setSize(value)
      if (output) output.value = String(engine.size)
      if (preview) preview.style.setProperty('--dot', `${Math.min(44, engine.size)}px`)
    }
    slider?.addEventListener('input', () => applySize(Number(slider.value)))
    applySize(engine.size)
  }

  private selectTool(tool: ToolId): void {
    if (!this.engine) return
    this.engine.setTool(tool)
    this.root.querySelectorAll<HTMLElement>('[data-tool]').forEach((button) => {
      const active = button.dataset.tool === tool
      button.classList.toggle('is-selected', active)
      button.setAttribute('aria-pressed', String(active))
    })
  }

  private selectColor(color: string): void {
    if (!this.engine) return
    this.engine.setColor(color)
    this.engine.setFinish('solid')
    // Tools show the active colour, like the tinted part of each APK tool.
    this.studioRoot?.style.setProperty('--tool-color', safeColor(color))
    this.root.querySelectorAll<HTMLElement>('[data-color], [data-finish]').forEach((button) => {
      const active = button.dataset.color === color
      button.classList.toggle('is-selected', active)
      button.setAttribute('aria-pressed', String(active))
    })
  }

  private selectFinish(finish: PaintFinish): void {
    if (!this.engine) return
    this.engine.setFinish(finish)
    this.root.querySelectorAll<HTMLElement>('[data-color], [data-finish]').forEach((button) => {
      const active = button.dataset.finish === finish
      button.classList.toggle('is-selected', active)
      button.setAttribute('aria-pressed', String(active))
    })
  }

  private updateHistoryButtons(state: HistoryState): void {
    const undo = this.root.querySelector<HTMLButtonElement>('[data-testid="undo"]')
    const redo = this.root.querySelector<HTMLButtonElement>('[data-testid="redo"]')
    if (undo) undo.disabled = !state.canUndo
    if (redo) redo.disabled = !state.canRedo
  }

  private markDirty(): void {
    this.dirty = true
    this.saveStatus = 'dirty'
    this.updateSaveChip()
    // Encode and persist in this very task. An await (canvas.toBlob), a timer
    // or an idle callback hands control back to the browser, and a reload right
    // after painting tears the document down before the IndexedDB transaction
    // even starts, losing the stroke. See queueSave().
    void this.queueSave()
  }

  /**
   * Snapshots the canvas synchronously and starts the write immediately.
   *
   * The synchronous snapshot is what makes autosave durable: the IndexedDB
   * transaction is opened inside the same task as the pointerup/undo/fill that
   * changed the pixels, so a reload that follows cannot beat it. Resolves once
   * this payload (or a newer one) is on disk.
   */
  private queueSave(): Promise<void> {
    const engine = this.engine
    const drawingId = this.activeDrawingId
    if (!engine || !drawingId) return Promise.resolve()

    let record: StoredDrawing
    try {
      record = {
        id: drawingId,
        blob: engine.getColorSnapshot(),
        thumbnail: engine.getThumbnailSnapshot(),
        updatedAt: Date.now(),
        width: WORK_SIZE,
        height: WORK_SIZE,
      }
    } catch (error) {
      this.dirty = true
      if (this.activeDrawingId === drawingId) {
        this.saveStatus = 'error'
        this.saveError = errorMessage(error)
        this.updateSaveChip()
      }
      return Promise.resolve()
    }

    const seq = ++this.saveSeq
    this.dirty = false
    this.saveStatus = 'saving'
    this.updateSaveChip()

    const write = this.writer.submit(drawingId, record)
    const tracked = write.then(
      () => {
        if (seq === this.saveSeq && this.activeDrawingId === drawingId) {
          this.saveStatus = 'saved'
          this.saveTimestamp = record.updatedAt
          this.saveError = null
          this.updateSaveChip()
        }
      },
      (error: unknown) => {
        if (seq === this.saveSeq) this.dirty = true
        if (this.activeDrawingId === drawingId) {
          this.saveStatus = 'error'
          this.saveError = errorMessage(error)
          this.updateSaveChip()
          this.reportSaveError()
        }
      },
    )
    this.saving = tracked
    void tracked.finally(() => {
      if (this.saving === tracked) this.saving = null
    })
    return tracked
  }

  private reportSaveError(): void {
    const now = Date.now()
    if (now - this.lastSaveErrorToast <= 4000) return
    this.lastSaveErrorToast = now
    this.toast('Não foi possível salvar. Toque em “Falha ao salvar” para tentar de novo.', 'error')
  }

  private async flushSave(): Promise<void> {
    let guard = 0
    while (guard++ < 8) {
      if (this.saving) {
        await this.saving
        continue
      }
      if (!this.dirty) break
      await this.queueSave()
      if (this.dirty) break
    }
    if (this.saving) await this.saving
    await this.writer.flush().catch(() => undefined)
  }

  private async leaveStudio(): Promise<void> {
    await this.flushSave()
    if (document.fullscreenElement === this.studioRoot) {
      await document.exitFullscreen().catch(() => undefined)
    }
    const drawing = drawings.find((candidate) => candidate.id === this.activeDrawingId)
    window.location.hash = drawing ? packHref(drawing.packId) : '#/'
  }

  private fullscreenSupported(): boolean {
    return document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function'
  }

  private handleFullscreenChange = (): void => {
    this.updateFullscreenButton()
  }

  private updateFullscreenButton(): void {
    const button = this.root.querySelector<HTMLButtonElement>('[data-testid="fullscreen-toggle"]')
    const studio = this.studioRoot
    if (!button || !studio) return
    const active = document.fullscreenElement === studio
    const label = active ? 'Sair da tela cheia' : 'Ativar tela cheia'
    button.setAttribute('aria-label', label)
    button.setAttribute('aria-pressed', String(active))
    button.title = this.fullscreenSupported() ? label : 'Tela cheia indisponível neste navegador'
    button.innerHTML = icon(active ? 'compress' : 'expand')
  }

  private async toggleFullscreen(): Promise<void> {
    const studio = this.studioRoot
    if (!studio || !this.fullscreenSupported()) return
    try {
      if (document.fullscreenElement === studio) {
        await document.exitFullscreen()
      } else {
        await studio.requestFullscreen()
      }
    } catch {
      this.toast('Não foi possível ativar a tela cheia neste navegador.', 'warning')
    }
  }

  private teardownStudio(): void {
    window.removeEventListener('keydown', this.handleKeyDown)
    this.engine?.destroy()
    this.engine = null
    this.activeDrawingId = null
    this.dirty = false
    this.saving = null
    this.studioRoot = null
    this.saveStatus = 'new'
    this.saveTimestamp = null
    this.saveError = null
    this.updateOfflineControls()
  }

  private saveLabels(): { full: string; short: string } {
    switch (this.saveStatus) {
      case 'saving':
        return { full: 'Salvando…', short: 'Salvando' }
      case 'saved':
        return {
          full: this.saveTimestamp ? formatSavedAt(this.saveTimestamp) : 'Salvo',
          short: 'Salvo',
        }
      case 'dirty':
        return { full: 'Alterando…', short: 'Alterado' }
      case 'error':
        return { full: 'Falha ao salvar', short: 'Erro' }
      default:
        return { full: 'Auto-save ligado', short: 'Auto' }
    }
  }

  private saveChipContent(): string {
    const label = this.saveLabels()
    const marker =
      this.saveStatus === 'saving'
        ? '<span class="spinner spinner-small" aria-hidden="true"></span>'
        : icon(
            this.saveStatus === 'saved'
              ? 'check'
              : this.saveStatus === 'error'
                ? 'warning'
                : 'cloud',
          )
    return `${marker}<span class="save-label-full">${label.full}</span><span class="save-label-short">${label.short}</span>`
  }

  private updateSaveChip(): void {
    const chip = this.root.querySelector<HTMLButtonElement>('[data-testid="save-status"]')
    if (!chip) return
    const label = this.saveLabels()
    chip.className = `save-chip is-${this.saveStatus}`
    chip.innerHTML = this.saveChipContent()
    chip.title = this.saveError ?? 'Salvar agora'
    chip.setAttribute(
      'aria-label',
      this.saveError ? `Falha ao salvar: ${this.saveError}` : `${label.full}. Salvar agora`,
    )
  }

  private updateOfflineControls(): void {
    const hosts = document.querySelectorAll<HTMLElement>('[data-offline-host]')
    for (const host of hosts) {
      host.outerHTML = this.offlineControl()
    }
    this.updateSoundButtons()
  }

  private updateSoundButtons(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-action="sound"]').forEach((button) => {
      const enabled = this.sound.isEnabled
      button.setAttribute('aria-pressed', String(enabled))
      button.setAttribute('aria-label', enabled ? 'Desativar sons' : 'Ativar sons')
      button.title = enabled ? 'Som ligado' : 'Som desligado'
      button.innerHTML = icon(enabled ? 'sound' : 'muted')
    })
  }

  private handleGlobalClick = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')
    if (!target) return
    switch (target.dataset.action) {
      case 'offline':
        void this.prepareOffline()
        break
      case 'sound':
        this.sound.toggle()
        this.updateSoundButtons()
        break
      case 'retry-storage':
        void this.retryStorage()
        break
      default:
        break
    }
  }

  private async prepareOffline(): Promise<void> {
    if (this.offlinePreparing || this.offline.ready) return
    this.offlinePreparing = true
    this.updateOfflineControls()
    try {
      await prepareOffline()
    } catch (error) {
      this.toast(
        `Não foi possível preparar o modo offline. ${offlineErrorMessage(
          this.offline.error,
        )} ${errorMessage(error)}`.trim(),
        'error',
      )
    } finally {
      this.offlinePreparing = false
      this.updateOfflineControls()
    }
  }

  private async retryStorage(): Promise<void> {
    await this.openStore()
    this.updateStorageBanners()
    if (this.store) {
      this.toast('Armazenamento disponível. O progresso volta a ser salvo.', 'success')
    } else {
      this.toast(this.storeError ?? 'Armazenamento ainda indisponível.', 'error')
    }
  }

  private updateStorageBanners(): void {
    document.querySelectorAll<HTMLElement>('[data-storage-banner]').forEach((banner) => {
      if (!this.storeError) {
        banner.remove()
        return
      }
      const detail = banner.querySelector('span')
      if (detail) detail.textContent = this.storeError
      banner.hidden = false
    })
  }

  private async exportPng(engine: PaintingEngine): Promise<void> {
    try {
      const blob = await engine.getExportBlob()
      const drawing = drawings.find((candidate) => candidate.id === this.activeDrawingId)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `rabisco-${drawing?.id ?? 'desenho'}.png`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 2000)
      this.toast('PNG pronto para guardar ou compartilhar.', 'success')
    } catch (error) {
      this.toast(errorMessage(error), 'error')
    }
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.engine) return
    if (document.querySelector('dialog[open]')) return
    const target = event.target as HTMLElement | null
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target?.isContentEditable
    ) {
      return
    }
    const meta = event.metaKey || event.ctrlKey
    const key = event.key.toLowerCase()

    if (meta && key === 'z') {
      event.preventDefault()
      if (event.shiftKey) this.engine.redo()
      else this.engine.undo()
      return
    }
    if (meta && key === 'y') {
      event.preventDefault()
      this.engine.redo()
      return
    }
    if (meta && key === 's') {
      event.preventDefault()
      void this.flushSave()
      return
    }
    if (meta) return

    if (key === '[' || key === ']') {
      event.preventDefault()
      const slider = this.root.querySelector<HTMLInputElement>('#brush-size')
      const next = this.engine.size + (key === ']' ? 2 : -2)
      this.engine.setSize(next)
      const output = this.root.querySelector<HTMLOutputElement>('[data-size-output]')
      const preview = this.root.querySelector<HTMLElement>('[data-size-preview]')
      if (slider) slider.value = String(this.engine.size)
      if (output) output.value = String(this.engine.size)
      if (preview) preview.style.setProperty('--dot', `${Math.min(44, this.engine.size)}px`)
      return
    }

    const tool = TOOL_KEYS[key]
    if (tool) {
      event.preventDefault()
      this.selectTool(tool)
    }
  }

  private toast(message: string, tone: 'success' | 'error' | 'warning' = 'success'): void {
    let host = document.querySelector<HTMLElement>('[data-toast-host]')
    if (!host) {
      host = document.createElement('div')
      host.className = 'toast-host'
      host.dataset.toastHost = ''
      host.setAttribute('aria-live', 'polite')
      document.body.appendChild(host)
    }
    host.innerHTML = `<div class="toast is-${tone}">${tone === 'success' ? icon('check') : icon('warning')}<span>${escapeHtml(
      message,
    )}</span></div>`
    if (this.toastTimer) window.clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => {
      host?.replaceChildren()
    }, 4200)
  }
}

const root = document.getElementById('app')
if (!root) throw new Error('Elemento #app não encontrado.')
const app = new ColoringApp(root)
void app.boot()

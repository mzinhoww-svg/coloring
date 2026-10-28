/**
 * Offline / PWA integration for the Coloring web app.
 *
 * Usage (src/main.ts):
 *
 *   import { registerOffline, prepareOffline } from './offline'
 *   registerOffline((state) => renderOfflineBadge(state))
 *   // later, once the first paint is done:
 *   prepareOffline()
 *
 * Contract:
 * - `ready` is only true after the service worker has verified that every asset
 *   from `offline-manifest.json` exists in the active versioned cache with the
 *   expected byte size (and hash when WebCrypto is available). `navigator.onLine`
 *   is never used to decide readiness.
 * - `online` is a reachability hint reported by the service worker probe (with a
 *   navigator.onLine fallback when the worker cannot answer).
 * - when service workers are unavailable (insecure context, unsupported browser)
 *   the functions resolve and report a truthful `error` instead of throwing.
 * - the service worker is never replaced mid-session while the page is visible;
 *   a waiting update is activated when the page is hidden or on the next visit.
 */

export interface OfflineState {
  readonly ready: boolean;
  readonly online: boolean;
  readonly error?: string;
}

export type OfflineStateHandler = (state: OfflineState) => void;

export interface RegisterOfflineOptions {
  /** Application base path, e.g. `/` or `/coloring/`. Auto-detected by default. */
  readonly baseUrl?: string;
  /** How long to wait for the worker to reply to VERIFY_OFFLINE. */
  readonly verifyTimeoutMs?: number;
  /** How long to wait for the service worker to become active. */
  readonly activationTimeoutMs?: number;
  /** How long to wait for PREPARE_OFFLINE (repairing a cache can take longer). */
  readonly prepareTimeoutMs?: number;
  /** Periodic registration.update() interval. `0` disables it. */
  readonly updateCheckMs?: number;
  readonly onState?: OfflineStateHandler;
}

interface WorkerReply {
  type?: string;
  requestId?: string | null;
  ready?: boolean;
  online?: boolean;
  error?: string;
  version?: string;
  checked?: number;
  missing?: string[];
  verified?: string;
}

interface Settings {
  baseUrl?: string;
  verifyTimeoutMs: number;
  activationTimeoutMs: number;
  prepareTimeoutMs: number;
  updateCheckMs: number;
}

const DEFAULT_SETTINGS: Settings = {
  verifyTimeoutMs: 8000,
  activationTimeoutMs: 15000,
  prepareTimeoutMs: 60000,
  updateCheckMs: 15 * 60 * 1000,
};

const MIN_TIMEOUT_MS = 10;
const VERIFY_THROTTLE_MS = 30000;
const MAX_ERROR_LENGTH = 200;

let settings: Settings = { ...DEFAULT_SETTINGS };
let stateHandler: OfflineStateHandler | null = null;
let state: OfflineState = { ready: false, online: false };
let registration: ServiceWorkerRegistration | null = null;
let bootPromise: Promise<void> | null = null;
let verifyPromise: Promise<OfflineState> | null = null;
let sequence = 0;
let updateTimer: ReturnType<typeof setInterval> | null = null;
let globalListenersAttached = false;
const observedRegistrations = new WeakSet<ServiceWorkerRegistration>();
let lastVerifiedAt = 0;
let verifyDebounce: ReturnType<typeof setTimeout> | null = null;

/** Returns the last state that was published to the state handler. */
export function getOfflineState(): OfflineState {
  return { ...state };
}

/**
 * Registers the offline service worker and starts reporting readiness.
 * Never rejects: unsupported environments and network failures are reported
 * through `onState` with `ready: false` and a truthful `error` code.
 */
export async function registerOffline(
  onState?: OfflineStateHandler,
  options: RegisterOfflineOptions = {},
): Promise<void> {
  applyOptions(options);
  if (onState) stateHandler = onState;
  if (!bootPromise) bootPromise = boot();
  await bootPromise;
}

/**
 * Asks the active service worker to complete/repair its precache and then
 * re-verifies it. Safe to call after first paint or on reconnect. Never rejects.
 */
export async function prepareOffline(options: RegisterOfflineOptions = {}): Promise<void> {
  applyOptions(options);
  if (options.onState) stateHandler = options.onState;
  if (!bootPromise) bootPromise = boot();
  await bootPromise;
  if (!registration) return;
  const reply = await requestFromWorker('PREPARE_OFFLINE', settings.prepareTimeoutMs);
  publish(interpret(reply));
}

/* ------------------------------------------------------------------------- */
/* Boot                                                                      */
/* ------------------------------------------------------------------------- */

async function boot(): Promise<void> {
  publish({ ready: false, online: onlineHint() }, true);

  if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
    publish({ ready: false, online: onlineHint(), error: 'service-worker-unsupported' });
    return;
  }
  if (typeof isSecureContext !== 'undefined' && isSecureContext === false) {
    publish({ ready: false, online: onlineHint(), error: 'insecure-context' });
    return;
  }

  attachGlobalListeners();

  const base = resolveAppBase(settings.baseUrl);
  let registered: ServiceWorkerRegistration;
  try {
    registered = await navigator.serviceWorker.register(serviceWorkerUrl(base), {
      scope: base,
      updateViaCache: 'none',
    });
  } catch (error) {
    publish({
      ready: false,
      online: onlineHint(),
      error: prefixError('registration-failed', error),
    });
    return;
  }

  registration = registered;
  attachRegistrationListeners(registered);

  try {
    registration = await withTimeout(navigator.serviceWorker.ready, settings.activationTimeoutMs, 'activation-timeout');
  } catch (error) {
    publish({ ready: false, online: onlineHint(), error: errorCode(error) });
    startUpdateChecks();
    void requestUpdateCheck();
    return;
  }

  attachRegistrationListeners(registration);
  await verifyNow();
  startUpdateChecks();
  void requestUpdateCheck();
}

function applyOptions(options: RegisterOfflineOptions): void {
  if (typeof options.baseUrl === 'string' && options.baseUrl.length > 0) {
    settings.baseUrl = normalizeBase(options.baseUrl);
  }
  settings.verifyTimeoutMs = positiveOr(options.verifyTimeoutMs, settings.verifyTimeoutMs);
  settings.activationTimeoutMs = positiveOr(options.activationTimeoutMs, settings.activationTimeoutMs);
  settings.prepareTimeoutMs = positiveOr(options.prepareTimeoutMs, settings.prepareTimeoutMs);
  if (typeof options.updateCheckMs === 'number' && Number.isFinite(options.updateCheckMs) && options.updateCheckMs >= 0) {
    settings.updateCheckMs = options.updateCheckMs;
  }
}

/* ------------------------------------------------------------------------- */
/* Base path resolution                                                      */
/* ------------------------------------------------------------------------- */

/**
 * Resolves the deployment base path without relying on the current URL path
 * (SPA routes such as /drawing/42 must still find /sw.js). Prefers an explicit
 * override, then <base>, the web manifest link and the Vite module script.
 */
export function resolveAppBase(explicit?: string): string {
  if (typeof explicit === 'string' && explicit.length > 0) return normalizeBase(explicit);

  if (typeof document !== 'undefined') {
    const baseElement = document.querySelector<HTMLBaseElement>('base[href]');
    if (baseElement && baseElement.href) {
      try {
        return normalizeBase(new URL(baseElement.href).pathname);
      } catch {
        /* ignore malformed base */
      }
    }

    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifestLink && manifestLink.href) {
      try {
        return normalizeBase(directoryOf(new URL(manifestLink.href).pathname));
      } catch {
        /* ignore malformed manifest link */
      }
    }

    const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
    if (script && script.src) {
      try {
        const scriptPath = new URL(script.src).pathname;
        const directory = directoryOf(scriptPath);
        // Vite emits hashed chunks under <base>assets/; strip that segment.
        return normalizeBase(directory.endsWith('/assets/') ? directory.slice(0, -'assets/'.length) : directory);
      } catch {
        /* ignore malformed script src */
      }
    }
  }

  const envBase = (import.meta as ImportMeta & { readonly env?: { readonly BASE_URL?: string } }).env?.BASE_URL;
  if (typeof envBase === 'string' && envBase.startsWith('/')) return normalizeBase(envBase);
  return '/';
}

function normalizeBase(value: string): string {
  let path = value;
  try {
    path = new URL(value, 'https://offline.invalid').pathname;
  } catch {
    path = '/';
  }
  if (!path.startsWith('/')) path = `/${path}`;
  if (!path.endsWith('/')) path = `${path}/`;
  return path.replace(/\/{2,}/g, '/');
}

function directoryOf(pathname: string): string {
  const index = pathname.lastIndexOf('/');
  return index < 0 ? '/' : pathname.slice(0, index + 1);
}

function serviceWorkerUrl(base: string): string {
  let origin = 'https://offline.invalid';
  if (typeof location !== 'undefined' && location.origin && location.origin !== 'null') origin = location.origin;
  return new URL('sw.js', new URL(base, origin)).href;
}

/* ------------------------------------------------------------------------- */
/* Verification protocol                                                     */
/* ------------------------------------------------------------------------- */

function verifyNow(): Promise<OfflineState> {
  if (verifyPromise) return verifyPromise;
  verifyPromise = (async () => {
    const reply = await requestFromWorker('VERIFY_OFFLINE', settings.verifyTimeoutMs);
    const interpreted = interpret(reply);
    lastVerifiedAt = Date.now();
    publish(interpreted);
    return interpreted;
  })()
    .catch((error: unknown) => {
      const failed: OfflineState = { ready: false, online: onlineHint(), error: errorCode(error) };
      publish(failed);
      return failed;
    })
    .finally(() => {
      verifyPromise = null;
    });
  return verifyPromise;
}

function scheduleVerify(delayMs = 250): void {
  if (verifyDebounce !== null) return;
  verifyDebounce = setTimeout(() => {
    verifyDebounce = null;
    void verifyNow();
  }, delayMs);
  unrefTimer(verifyDebounce);
}

function requestFromWorker(type: 'VERIFY_OFFLINE' | 'PREPARE_OFFLINE', timeoutMs: number): Promise<WorkerReply> {
  const worker = currentWorker();
  const requestId = `${type}:${Date.now().toString(36)}:${(sequence += 1).toString(36)}`;
  if (!worker) {
    return Promise.resolve({
      type: 'OFFLINE_STATE',
      requestId,
      ready: false,
      online: onlineHint(),
      error: 'sw-unavailable',
    });
  }

  return new Promise<WorkerReply>((resolve) => {
    let settled = false;
    const finish = (reply: WorkerReply): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        navigator.serviceWorker.removeEventListener('message', onMessage);
      } catch {
        /* listener removal is best effort */
      }
      resolve(reply);
    };
    const onMessage = (event: MessageEvent<WorkerReply | null>): void => {
      const data = event.data;
      if (!data || data.type !== 'OFFLINE_STATE' || data.requestId !== requestId) return;
      finish(data);
    };
    const timer = setTimeout(() => {
      finish({
        type: 'OFFLINE_STATE',
        requestId,
        ready: false,
        online: onlineHint(),
        error: type === 'PREPARE_OFFLINE' ? 'prepare-timeout' : 'verify-timeout',
      });
    }, Math.max(MIN_TIMEOUT_MS, timeoutMs));

    try {
      navigator.serviceWorker.addEventListener('message', onMessage);
      worker.postMessage({ type, requestId });
    } catch (error) {
      finish({
        type: 'OFFLINE_STATE',
        requestId,
        ready: false,
        online: onlineHint(),
        error: prefixError('post-message-failed', error),
      });
    }
  });
}

function interpret(reply: WorkerReply): OfflineState {
  const online = typeof reply.online === 'boolean' ? reply.online : onlineHint();
  if (reply.ready === true) return { ready: true, online };
  const code = typeof reply.error === 'string' && reply.error.length > 0 ? reply.error : 'precache-incomplete';
  return { ready: false, online, error: code };
}

function currentWorker(): ServiceWorker | null {
  try {
    const controller = navigator.serviceWorker.controller;
    if (controller) return controller;
    if (registration?.waiting) return registration.waiting;
    if (registration?.active) return registration.active;
  } catch {
    return null;
  }
  return null;
}

/* ------------------------------------------------------------------------- */
/* Service worker lifecycle                                                  */
/* ------------------------------------------------------------------------- */

function attachGlobalListeners(): void {
  if (globalListenersAttached) return;
  globalListenersAttached = true;

  try {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      void verifyNow();
    });
    navigator.serviceWorker.addEventListener('message', (event: MessageEvent<WorkerReply | null>) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'OFFLINE_CHANGED') {
        void verifyNow();
        return;
      }
      if (data.type === 'OFFLINE_STATE' && !data.requestId) scheduleVerify();
    });
  } catch {
    /* message events are an optimisation; verify requests still work */
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      publish({ ...state, online: true });
      void verifyNow();
      void requestUpdateCheck();
    });
    window.addEventListener('offline', () => {
      publish({ ...state, online: false });
      void verifyNow();
    });
    window.addEventListener('pagehide', (event) => {
      if (!event.persisted) applyWaitingUpdate();
    });
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        applyWaitingUpdate();
        return;
      }
      if (Date.now() - lastVerifiedAt > VERIFY_THROTTLE_MS) void verifyNow();
      void requestUpdateCheck();
    });
  }
}

function attachRegistrationListeners(target: ServiceWorkerRegistration): void {
  if (typeof target.addEventListener !== 'function') return;
  if (observedRegistrations.has(target)) return;
  observedRegistrations.add(target);

  target.addEventListener('updatefound', () => {
    const installing = target.installing;
    if (!installing || typeof installing.addEventListener !== 'function') return;
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed') {
        if (navigator.serviceWorker.controller) {
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') applyWaitingUpdate();
        } else {
          void verifyNow();
        }
      }
      if (installing.state === 'activated') void verifyNow();
    });
  });

  if (target.waiting && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    applyWaitingUpdate();
  }
}

function applyWaitingUpdate(): void {
  const waiting = registration?.waiting;
  if (!waiting) return;
  try {
    waiting.postMessage({ type: 'SKIP_WAITING' });
  } catch {
    /* the next visit will activate the waiting worker anyway */
  }
}

function startUpdateChecks(): void {
  if (updateTimer !== null || settings.updateCheckMs <= 0) return;
  if (typeof window === 'undefined') return;
  updateTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    void requestUpdateCheck();
  }, settings.updateCheckMs);
  unrefTimer(updateTimer);
}

async function requestUpdateCheck(): Promise<void> {
  if (!registration) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  try {
    await registration.update();
  } catch {
    /* an offline update check is expected to fail; the cached app still works */
  }
}

/* ------------------------------------------------------------------------- */
/* State helpers                                                             */
/* ------------------------------------------------------------------------- */

function publish(next: OfflineState, force = false): void {
  const normalized: OfflineState = {
    ready: next.ready === true,
    online: next.online === true,
    ...(next.error ? { error: next.error } : {}),
  };
  if (!force && state.ready === normalized.ready && state.online === normalized.online && state.error === normalized.error) {
    return;
  }
  state = normalized;
  if (!stateHandler) return;
  try {
    stateHandler({ ...state });
  } catch {
    /* a faulty UI handler must not break offline bookkeeping */
  }
}

function onlineHint(): boolean {
  try {
    return typeof navigator !== 'undefined' && navigator.onLine === true;
  } catch {
    return false;
  }
}

function errorCode(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, MAX_ERROR_LENGTH);
  const value = typeof error === 'string' ? error : String(error);
  return value.slice(0, MAX_ERROR_LENGTH) || 'offline-error';
}

function prefixError(prefix: string, error: unknown): string {
  return `${prefix}: ${errorCode(error)}`.slice(0, MAX_ERROR_LENGTH);
}

function positiveOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_TIMEOUT_MS ? value : fallback;
}

function unrefTimer(timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>): void {
  const candidate = timer as unknown as { unref?: () => void };
  if (typeof candidate.unref === 'function') candidate.unref();
}

function withTimeout<T>(promise: Promise<T>, ms: number, code: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(code)), Math.max(MIN_TIMEOUT_MS, ms));
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(code));
      },
    );
  });
}

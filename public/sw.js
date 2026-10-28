/*
 * Coloring offline service worker.
 *
 * This file is served from the application base path and is version-stamped by
 * tools/build-offline.mjs during the production build. Keep it dependency-free:
 * Vite copies public/ verbatim and never bundles this file.
 *
 * Guarantees:
 * - a versioned cache is installed atomically; a failed install leaves the
 *   previous worker (and its cache) untouched;
 * - readiness is based on the verified contents of the active cache, never on
 *   navigator.onLine;
 * - old caches are removed only after a complete new cache exists;
 * - IndexedDB is never opened, migrated or deleted by this worker.
 */
'use strict';

const BUILD_VERSION = '__OFFLINE_BUILD_VERSION__';
const CACHE_PREFIX = 'coloring-offline-v1-';
const MANIFEST_FILE = 'offline-manifest.json';
const OFFLINE_META_FILE = '__offline_meta__.json';
const SHELL_FILE = 'index.html';
const REQUEST_TIMEOUT_MS = 10000;
const ASSET_TIMEOUT_MS = 20000;
const ONLINE_PROBE_TIMEOUT_MS = 4000;

const IS_STAMPED = BUILD_VERSION !== '__OFFLINE_BUILD_VERSION__' && BUILD_VERSION.length > 0;

const scopeUrl = () => new URL('./', self.location.href);
const manifestUrl = () => new URL(MANIFEST_FILE, scopeUrl());
const manifestCacheKey = () => manifestUrl().href;
const metaCacheKey = () => new URL(OFFLINE_META_FILE, scopeUrl()).href;
const absoluteUrl = (value) => new URL(value, scopeUrl()).href;

let activeCachePromise = null;
let prepareTask = null;

/* ------------------------------------------------------------------------- */
/* Manifest handling                                                         */
/* ------------------------------------------------------------------------- */

function expectedVersion(manifest) {
  return IS_STAMPED ? BUILD_VERSION : manifest.version;
}

function normalizeManifest(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('manifest-invalid');
  if (typeof raw.version !== 'string' || !/^[A-Za-z0-9._-]+$/.test(raw.version)) {
    throw new Error('manifest-invalid-version');
  }
  if (!Array.isArray(raw.entries) || raw.entries.length === 0) {
    throw new Error('manifest-empty');
  }
  const seen = new Set();
  const entries = raw.entries.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('manifest-invalid-entry');
    if (typeof entry.url !== 'string' || entry.url.length === 0) {
      throw new Error('manifest-invalid-entry-url');
    }
    const url = new URL(entry.url, scopeUrl());
    if (url.origin !== self.location.origin) throw new Error('manifest-cross-origin-entry');
    const href = url.href;
    if (seen.has(href)) throw new Error('manifest-duplicate-entry');
    seen.add(href);
    const size = Number.isInteger(entry.size) && entry.size >= 0 ? entry.size : null;
    const hash = typeof entry.hash === 'string' && /^[a-f0-9]{64}$/i.test(entry.hash) ? entry.hash.toLowerCase() : null;
    return { url: entry.url, href, size, hash };
  });
  const shell = typeof raw.shell === 'string' ? new URL(raw.shell, scopeUrl()).href : null;
  return { version: raw.version, entries, shell };
}

async function fetchManifestFromNetwork() {
  const url = manifestUrl();
  url.searchParams.set('v', IS_STAMPED ? BUILD_VERSION : 'dev');
  url.searchParams.set('t', String(Date.now()));
  const response = await withTimeout(
    fetch(new Request(url.href, { cache: 'no-store', credentials: 'same-origin' })),
    REQUEST_TIMEOUT_MS,
    'manifest-timeout',
  );
  if (!response || !response.ok) {
    throw new Error('manifest-http-' + (response ? response.status : '0'));
  }
  return normalizeManifest(await response.json());
}

async function readCachedManifest() {
  let names = [];
  try {
    names = (await caches.keys()).filter((name) => name.indexOf(CACHE_PREFIX) === 0);
  } catch (error) {
    return null;
  }
  if (IS_STAMPED) {
    names.sort((a, b) => {
      const exact = CACHE_PREFIX + BUILD_VERSION;
      return (b === exact ? 1 : 0) - (a === exact ? 1 : 0);
    });
  }
  for (const name of names) {
    try {
      const cache = await caches.open(name);
      const response = await cache.match(manifestCacheKey());
      if (!response) continue;
      const manifest = normalizeManifest(await response.json());
      if (expectedVersion(manifest) === manifest.version || !IS_STAMPED) return manifest;
    } catch (error) {
      /* keep looking: one damaged cache must not break readiness checks */
    }
  }
  return null;
}

async function readManifest(mode) {
  if (mode === 'cache-first') {
    const cached = await readCachedManifest();
    if (cached) return cached;
  }
  try {
    return await fetchManifestFromNetwork();
  } catch (error) {
    if (mode === 'cache-first') throw error;
    const cached = await readCachedManifest();
    if (cached) return cached;
    throw error;
  }
}

/* ------------------------------------------------------------------------- */
/* Cache installation                                                        */
/* ------------------------------------------------------------------------- */

async function installOffline() {
  const manifest = await fetchManifestFromNetwork();
  if (IS_STAMPED && manifest.version !== BUILD_VERSION) {
    throw new Error('manifest-version-mismatch');
  }
  const version = expectedVersion(manifest);
  const cacheName = CACHE_PREFIX + version;
  try {
    await precache(version, manifest);
  } catch (error) {
    try {
      await caches.delete(cacheName);
    } catch (cleanupError) {
      /* best effort: a leftover partial cache is rebuilt on the next attempt */
    }
    throw error;
  }
  activeCachePromise = null;
}

async function ensurePrepared(manifest) {
  if (!prepareTask) {
    prepareTask = precache(expectedVersion(manifest), manifest)
      .then(() => {
        activeCachePromise = null;
      })
      .finally(() => {
        prepareTask = null;
      });
  }
  await prepareTask;
}

async function precache(version, manifest) {
  const cacheName = CACHE_PREFIX + version;
  if (await caches.has(cacheName)) {
    const existing = await caches.open(cacheName);
    const meta = await readMeta(existing);
    const missing = await verifyEntries(existing, manifest.entries, true);
    if (meta && meta.version === version && missing.length === 0) {
      await writeManifestAndMeta(existing, version, manifest);
      return cacheName;
    }
    await caches.delete(cacheName);
  }

  const cache = await caches.open(cacheName);
  try {
    for (const entry of manifest.entries) {
      const response = await fetchAsset(entry.href);
      const measured = await response.clone().arrayBuffer();
      if (entry.size !== null && measured.byteLength !== entry.size) {
        throw new Error('precache-size-mismatch:' + entry.url);
      }
      await cache.put(entry.href, response);
    }
    await aliasShell(cache, manifest);
    const missing = await verifyEntries(cache, manifest.entries, false);
    if (missing.length > 0) {
      throw new Error('precache-incomplete:' + missing.slice(0, 5).join(','));
    }
    await writeManifestAndMeta(cache, version, manifest);
  } catch (error) {
    await caches.delete(cacheName);
    throw error;
  }
  return cacheName;
}

async function fetchAsset(href) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await withTimeout(
        fetch(new Request(href, { cache: 'reload', credentials: 'same-origin' })),
        ASSET_TIMEOUT_MS,
        'precache-timeout:' + href,
      );
      if (!response) throw new Error('precache-no-response:' + href);
      if (response.type === 'opaque') throw new Error('precache-opaque:' + href);
      if (!response.ok) throw new Error('precache-http-' + response.status + ':' + href);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await delay(200);
    }
  }
  throw lastError || new Error('precache-failed:' + href);
}

async function aliasShell(cache, manifest) {
  const shellHref = manifest.shell || absoluteUrl(SHELL_FILE);
  let shell = await cache.match(shellHref);
  if (!shell) {
    const fallbackEntry = manifest.entries.find((entry) => entry.href.endsWith('/' + SHELL_FILE));
    if (fallbackEntry) shell = await cache.match(fallbackEntry.href);
  }
  if (!shell) return;
  const scope = scopeUrl().href;
  const aliases = [scope, scope.replace(/\/$/, ''), absoluteUrl(SHELL_FILE)];
  for (const alias of aliases) {
    if (alias === shellHref) continue;
    if (!(await cache.match(alias))) await cache.put(alias, shell.clone());
  }
}

async function writeManifestAndMeta(cache, version, manifest) {
  const raw = {
    version: manifest.version,
    entries: manifest.entries.map((entry) => ({
      url: entry.url,
      size: entry.size,
      hash: entry.hash,
    })),
    shell: manifest.shell ? new URL(manifest.shell).pathname : undefined,
  };
  await cache.put(
    manifestCacheKey(),
    new Response(JSON.stringify(raw), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    }),
  );
  await cache.put(
    metaCacheKey(),
    new Response(
      JSON.stringify({ version, installedAt: Date.now(), entries: manifest.entries.length }),
      { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } },
    ),
  );
}

async function readMeta(cache) {
  try {
    const response = await cache.match(metaCacheKey());
    if (!response) return null;
    const data = await response.json();
    return data && typeof data.version === 'string' ? data : null;
  } catch (error) {
    return null;
  }
}

/* ------------------------------------------------------------------------- */
/* Verification                                                              */
/* ------------------------------------------------------------------------- */

function getSubtleCrypto() {
  const candidate = self.crypto || (typeof crypto !== 'undefined' ? crypto : null);
  if (!candidate || !candidate.subtle || typeof candidate.subtle.digest !== 'function') return null;
  return candidate.subtle;
}

async function sha256Hex(buffer) {
  const subtle = getSubtleCrypto();
  if (!subtle) return null;
  const digest = await subtle.digest('SHA-256', buffer);
  const bytes = new Uint8Array(digest);
  let out = '';
  for (let index = 0; index < bytes.length; index += 1) {
    out += bytes[index].toString(16).padStart(2, '0');
  }
  return out;
}

async function verifyEntries(cache, entries, checkHashes) {
  const missing = [];
  const canHash = checkHashes && getSubtleCrypto() !== null;
  for (const entry of entries) {
    let response = null;
    try {
      response = await cache.match(entry.href);
    } catch (error) {
      response = null;
    }
    if (!response) {
      missing.push(entry.url);
      continue;
    }
    if (entry.size !== null) {
      let buffer = null;
      try {
        buffer = await response.clone().arrayBuffer();
      } catch (error) {
        missing.push(entry.url);
        continue;
      }
      if (buffer.byteLength !== entry.size) {
        missing.push(entry.url);
        continue;
      }
      if (canHash && entry.hash) {
        const actual = await sha256Hex(buffer);
        if (actual && actual !== entry.hash) missing.push(entry.url);
      }
    }
  }
  return missing;
}

async function verifyActiveCache(manifest, checkHashes) {
  const version = expectedVersion(manifest);
  const cacheName = CACHE_PREFIX + version;
  let hasCache = false;
  try {
    hasCache = await caches.has(cacheName);
  } catch (error) {
    return { ready: false, missing: manifest.entries.map((entry) => entry.url), reason: 'cache-storage-unavailable' };
  }
  if (!hasCache) {
    return { ready: false, missing: manifest.entries.map((entry) => entry.url), reason: 'cache-missing' };
  }
  const cache = await caches.open(cacheName);
  const missing = await verifyEntries(cache, manifest.entries, checkHashes);
  return {
    ready: missing.length === 0,
    missing,
    reason: missing.length === 0 ? null : 'precache-incomplete',
  };
}

/* ------------------------------------------------------------------------- */
/* Active cache lookup and navigation                                        */
/* ------------------------------------------------------------------------- */

async function findCurrentCacheName() {
  let names = [];
  try {
    names = (await caches.keys()).filter((name) => name.indexOf(CACHE_PREFIX) === 0);
  } catch (error) {
    return null;
  }
  if (IS_STAMPED) {
    const exact = CACHE_PREFIX + BUILD_VERSION;
    if (names.indexOf(exact) !== -1) return exact;
  }
  let best = null;
  for (const name of names) {
    let meta = null;
    try {
      const cache = await caches.open(name);
      meta = await readMeta(cache);
    } catch (error) {
      meta = null;
    }
    if (!meta) continue;
    if (!best || (meta.installedAt || 0) > best.installedAt) {
      best = { name, installedAt: meta.installedAt || 0 };
    }
  }
  if (best) return best.name;
  return names.length === 1 ? names[0] : null;
}

function activeCache() {
  if (!activeCachePromise) {
    activeCachePromise = (async () => {
      const name = await findCurrentCacheName();
      return name ? caches.open(name) : null;
    })().catch(() => null);
  }
  return activeCachePromise;
}

async function matchShell(cache) {
  if (!cache) return null;
  const scope = scopeUrl().href;
  const candidates = [absoluteUrl(SHELL_FILE), scope, scope.replace(/\/$/, '')];
  for (const candidate of candidates) {
    try {
      const response = await cache.match(candidate);
      if (response) return response;
    } catch (error) {
      /* try the next alias */
    }
  }
  return null;
}

function offlineFallbackResponse() {
  const body =
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Coloring — sem conexão</title></head>' +
    '<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#101828;color:#f4f1ea;' +
    'font-family:system-ui,-apple-system,sans-serif;padding:24px;text-align:center">' +
    '<main style="max-width:32rem"><h1 style="font-size:1.35rem">Não foi possível abrir o jogo offline</h1>' +
    '<p style="line-height:1.55;opacity:.85">O pacote offline ainda não está completo neste dispositivo. ' +
    'Conecte-se à internet e recarregue a página para concluir o download.</p></main>' +
    '</body></html>';
  return new Response(body, {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function handleNavigation(request) {
  const cache = await activeCache();
  const shell = await matchShell(cache);
  if (shell) return shell;
  try {
    return await fetch(request);
  } catch (error) {
    return offlineFallbackResponse();
  }
}

async function handleAsset(request) {
  const cache = await activeCache();
  if (cache) {
    try {
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
    } catch (error) {
      /* fall through to the network */
    }
  }
  try {
    return await fetch(request);
  } catch (error) {
    if (cache) {
      try {
        const fallback = await cache.match(request);
        if (fallback) return fallback;
      } catch (matchError) {
        /* no cached fallback */
      }
    }
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!request || request.method !== 'GET') return;
  let url;
  try {
    url = new URL(request.url);
  } catch (error) {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/' + MANIFEST_FILE) || url.pathname.endsWith('/' + OFFLINE_META_FILE)) return;
  if (request.headers && typeof request.headers.has === 'function' && request.headers.has('range')) return;

  const isNavigation = request.mode === 'navigate' || request.destination === 'document';
  event.respondWith(isNavigation ? handleNavigation(request) : handleAsset(request));
});

/* ------------------------------------------------------------------------- */
/* Lifecycle                                                                 */
/* ------------------------------------------------------------------------- */

self.addEventListener('install', (event) => {
  event.waitUntil(installOffline());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const current = await findCurrentCacheName();
      if (current) {
        const names = await caches.keys();
        await Promise.all(
          names.map((name) => {
            if (name.indexOf(CACHE_PREFIX) === 0 && name !== current) {
              return caches.delete(name).catch(() => false);
            }
            return Promise.resolve(false);
          }),
        );
      }
      activeCachePromise = null;
      try {
        await self.clients.claim();
      } catch (error) {
        /* claim is an optimisation, not a readiness requirement */
      }
      await broadcast({ type: 'OFFLINE_CHANGED', version: current ? current.slice(CACHE_PREFIX.length) : null });
    })(),
  );
});

/* ------------------------------------------------------------------------- */
/* Messaging                                                                 */
/* ------------------------------------------------------------------------- */

async function probeOnline() {
  try {
    const url = manifestUrl();
    url.searchParams.set('probe', String(Date.now()));
    const response = await withTimeout(
      fetch(new Request(url.href, { cache: 'no-store', credentials: 'same-origin' })),
      ONLINE_PROBE_TIMEOUT_MS,
      'probe-timeout',
    );
    return Boolean(response && response.ok);
  } catch (error) {
    return false;
  }
}

async function respondState(event, data) {
  const requestId = typeof data.requestId === 'string' ? data.requestId : null;
  let reply;
  try {
    const manifest = await readManifest('cache-first');
    if (data.type === 'PREPARE_OFFLINE') {
      await ensurePrepared(manifest);
    }
    const check = await verifyActiveCache(manifest, true);
    const online = await probeOnline();
    reply = {
      ready: check.ready,
      online,
      version: expectedVersion(manifest),
      checked: manifest.entries.length,
      missing: check.missing.slice(0, 25),
      verified: getSubtleCrypto() ? 'hash+size' : 'size',
      error: check.ready ? undefined : check.reason || 'precache-incomplete',
    };
  } catch (error) {
    let online = false;
    try {
      online = await probeOnline();
    } catch (probeError) {
      online = false;
    }
    reply = {
      ready: false,
      online,
      error: errorCode(error),
      checked: 0,
      missing: [],
    };
  }
  await postReply(event, Object.assign({ type: 'OFFLINE_STATE', requestId }, reply));
}

function errorCode(error) {
  const message = error && error.message ? String(error.message) : 'verification-failed';
  if (message.indexOf('manifest-') === 0) return message;
  if (message.indexOf('precache-') === 0) {
    const parts = message.split(':');
    return parts.length > 1 ? parts[0] : message;
  }
  return message.slice(0, 160) || 'verification-failed';
}

async function postReply(event, message) {
  if (event.source && typeof event.source.postMessage === 'function') {
    event.source.postMessage(message);
    return;
  }
  await broadcast(message);
}

async function broadcast(message) {
  try {
    if (!self.clients || typeof self.clients.matchAll !== 'function') return;
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    for (const client of clients) {
      if (client && typeof client.postMessage === 'function') client.postMessage(message);
    }
  } catch (error) {
    /* broadcasting is best effort */
  }
}

self.addEventListener('message', (event) => {
  const data = event.data && typeof event.data === 'object' ? event.data : {};
  if (data.type === 'SKIP_WAITING') {
    event.waitUntil(Promise.resolve(self.skipWaiting()));
    return;
  }
  if (data.type === 'VERIFY_OFFLINE' || data.type === 'PREPARE_OFFLINE') {
    const task = respondState(event, data);
    if (typeof event.waitUntil === 'function') event.waitUntil(task);
    else task.catch(() => undefined);
  }
});

/* ------------------------------------------------------------------------- */
/* Utilities                                                                 */
/* ------------------------------------------------------------------------- */

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, code) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(code)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

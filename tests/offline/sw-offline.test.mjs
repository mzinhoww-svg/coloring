import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import vm from 'node:vm';

const SW_PATH = path.resolve(import.meta.dirname, '../../public/sw.js');
const SW_SOURCE = await readFile(SW_PATH, 'utf8');
const CACHE_PREFIX = 'coloring-offline-v1-';

/* ------------------------------------------------------------------------- */
/* Browser primitives                                                        */
/* ------------------------------------------------------------------------- */

const keyOf = (input) => {
  if (typeof input === 'string') return new URL(input, 'https://app.test/').href;
  if (input && typeof input.url === 'string') return new URL(input.url, 'https://app.test/').href;
  throw new TypeError('unsupported cache key');
};

const withoutQuery = (href) => {
  const url = new URL(href);
  url.search = '';
  return url.href;
};

async function snapshot(response) {
  const body = await response.clone().arrayBuffer();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

class FakeCache {
  constructor() {
    this.store = new Map();
  }

  async put(input, response) {
    this.store.set(keyOf(input), await snapshot(response));
  }

  async match(input, options = {}) {
    const key = keyOf(input);
    if (this.store.has(key)) return snapshot(this.store.get(key));
    if (options.ignoreSearch) {
      const wanted = withoutQuery(key);
      for (const [stored, response] of this.store) {
        if (withoutQuery(stored) === wanted) return snapshot(response);
      }
    }
    return undefined;
  }

  async keys() {
    return [...this.store.keys()].map((key) => new Request(key));
  }

  async delete(input) {
    return this.store.delete(keyOf(input));
  }

  has(input) {
    return this.store.has(keyOf(input));
  }

  remove(input) {
    return this.store.delete(keyOf(input));
  }
}

class FakeCacheStorage {
  constructor() {
    this.stores = new Map();
  }

  async open(name) {
    if (!this.stores.has(name)) this.stores.set(name, new FakeCache());
    return this.stores.get(name);
  }

  async has(name) {
    return this.stores.has(name);
  }

  async delete(name) {
    return this.stores.delete(name);
  }

  async keys() {
    return [...this.stores.keys()];
  }

  async match(input) {
    for (const cache of this.stores.values()) {
      const response = await cache.match(input);
      if (response) return response;
    }
    return undefined;
  }
}

/* ------------------------------------------------------------------------- */
/* Service worker harness                                                    */
/* ------------------------------------------------------------------------- */

function manifestFor(assets, version = 'abc123abc123abc1') {
  const entries = [...assets.entries()]
    .map(([url, body]) => ({
      url,
      size: Buffer.byteLength(body),
      hash: createHash('sha256').update(body).digest('hex'),
      type: 'text/plain',
    }))
    .sort((a, b) => (a.url < b.url ? -1 : 1));
  return { schemaVersion: 1, version, base: '/', shell: '/index.html', entries };
}

async function loadWorker(options = {}) {
  const assets = new Map(
    options.assets ?? [
      ['/index.html', options.indexHtml ?? '<!doctype html><html><body><div id="app">coloring-shell</div></body></html>'],
      ['/assets/index-abc123.js', 'console.log("app shell");'],
      ['/assets/chunk-def456.js', 'export const drawings = ["original-a"];'],
      ['/assets/index-abc123.css', 'body{background:#101828}'],
      ['/manifest.webmanifest', '{"name":"Coloring"}'],
      ['/icons/icon-192.png', 'png-192'],
    ],
  );
  const version = options.version ?? 'abc123abc123abc1';
  const manifest = options.manifest ?? manifestFor(assets, version);
  const caches = new FakeCacheStorage();
  const requests = [];
  const clientMessages = [];
  const client = {
    postMessage(message) {
      clientMessages.push(message);
    },
  };
  const listeners = new Map();
  const state = {
    offline: false,
    statuses: new Map(),
    stalledPaths: new Set(),
  };

  const fetch = async (input) => {
    const request = typeof input === 'string' ? new Request(input) : input;
    const url = new URL(request.url);
    requests.push(url.pathname + url.search);
    if (state.offline) throw new TypeError('Failed to fetch (offline)');
    if (state.stalledPaths.has(url.pathname)) throw new TypeError('Failed to fetch (stalled)');
    if (url.pathname.endsWith('/offline-manifest.json')) {
      return new Response(JSON.stringify(manifest), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (state.statuses.has(url.pathname)) {
      return new Response('forced error', { status: state.statuses.get(url.pathname) });
    }
    if (!assets.has(url.pathname)) return new Response('not found', { status: 404 });
    return new Response(assets.get(url.pathname), {
      status: 200,
      headers: { 'content-type': url.pathname.endsWith('.js') ? 'text/javascript' : 'text/html' },
    });
  };

  const self = {
    location: new URL('https://app.test/sw.js'),
    registration: { scope: 'https://app.test/' },
    crypto: webcrypto,
    clients: {
      async claim() {},
      async matchAll() {
        return [client];
      },
    },
    async skipWaiting() {
      state.skipped = true;
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
  };

  const sandbox = {
    self,
    caches,
    fetch,
    Request,
    Response,
    Headers,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    crypto: webcrypto,
    console,
    Promise,
  };
  vm.runInNewContext(options.source ?? SW_SOURCE, sandbox, { filename: 'sw.js' });

  const dispatch = async (type, event) => {
    const handler = listeners.get(type);
    assert.ok(handler, `service worker did not register a ${type} listener`);
    const waits = [];
    handler({
      ...event,
      waitUntil(promise) {
        waits.push(promise);
      },
    });
    await Promise.all(waits);
  };

  return {
    caches,
    clientMessages,
    requests,
    state,
    manifest,
    version,
    cacheName: CACHE_PREFIX + version,
    async install() {
      await dispatch('install', {});
    },
    async activate() {
      await dispatch('activate', {});
    },
    async sendMessage(data, source = client) {
      clientMessages.length = 0;
      await dispatch('message', { data, source });
      return clientMessages[clientMessages.length - 1];
    },
    async request(input) {
      let responded = null;
      const event = {
        request: input,
        respondWith(promise) {
          responded = promise;
        },
      };
      const handler = listeners.get('fetch');
      assert.ok(handler, 'service worker did not register a fetch listener');
      handler(event);
      return responded ? await responded : null;
    },
  };
}

function navigationRequest(url = 'https://app.test/') {
  return {
    url,
    method: 'GET',
    mode: 'navigate',
    destination: 'document',
    headers: new Headers(),
  };
}

/* ------------------------------------------------------------------------- */
/* Tests                                                                     */
/* ------------------------------------------------------------------------- */

describe('service worker install and readiness', () => {
  it('installs an atomically complete cache and verifies every entry', async () => {
    const worker = await loadWorker();
    await worker.install();

    const cache = await worker.caches.open(worker.cacheName);
    for (const entry of worker.manifest.entries) {
      assert.ok(cache.has(entry.url), `missing precached ${entry.url}`);
    }
    assert.ok(cache.has('https://app.test/'), 'scope alias for the shell');
    assert.ok(cache.has('https://app.test/index.html'), 'index alias for the shell');
    assert.ok(await cache.match('https://app.test/'), 'shell must be readable offline');

    const reply = await worker.sendMessage({ type: 'VERIFY_OFFLINE', requestId: 'verify-1' });
    assert.equal(reply.type, 'OFFLINE_STATE');
    assert.equal(reply.requestId, 'verify-1');
    assert.equal(reply.ready, true);
    assert.equal(reply.online, true);
    assert.equal(reply.checked, worker.manifest.entries.length);
    assert.equal(reply.verified, 'hash+size');
    assert.equal(reply.version, worker.version);
    assert.deepEqual([...reply.missing], []);
  });

  it('reports not ready when a precached entry is missing', async () => {
    const worker = await loadWorker();
    await worker.install();
    const cache = await worker.caches.open(worker.cacheName);
    cache.remove('/assets/chunk-def456.js');

    const reply = await worker.sendMessage({ type: 'VERIFY_OFFLINE', requestId: 'verify-2' });
    assert.equal(reply.ready, false);
    assert.equal(reply.error, 'precache-incomplete');
    assert.deepEqual([...reply.missing], ['/assets/chunk-def456.js']);
  });

  it('reports not ready when bytes were truncated', async () => {
    const worker = await loadWorker();
    await worker.install();
    const cache = await worker.caches.open(worker.cacheName);
    cache.remove('/assets/index-abc123.js');
    await cache.put('/assets/index-abc123.js', new Response('short'));

    const reply = await worker.sendMessage({ type: 'VERIFY_OFFLINE', requestId: 'verify-3' });
    assert.equal(reply.ready, false);
    assert.ok(reply.missing.includes('/assets/index-abc123.js'));
  });

  it('reports not ready when bytes are corrupted without changing size', async () => {
    const worker = await loadWorker();
    await worker.install();
    const expected = worker.manifest.entries.find((entry) => entry.url === '/assets/chunk-def456.js');
    const cache = await worker.caches.open(worker.cacheName);
    cache.remove('/assets/chunk-def456.js');
    await cache.put('/assets/chunk-def456.js', new Response('x'.repeat(expected.size)));

    const reply = await worker.sendMessage({ type: 'VERIFY_OFFLINE', requestId: 'verify-4' });
    assert.equal(reply.ready, false);
    assert.deepEqual([...reply.missing], ['/assets/chunk-def456.js']);
  });

  it('verifies readiness offline without trusting the network', async () => {
    const worker = await loadWorker();
    await worker.install();
    worker.state.offline = true;

    const reply = await worker.sendMessage({ type: 'VERIFY_OFFLINE', requestId: 'verify-5' });
    assert.equal(reply.ready, true, 'a complete cache is ready even without a network');
    assert.equal(reply.online, false, 'online must reflect real reachability');
  });

  it('does not leave a partial cache behind when install fails', async () => {
    const worker = await loadWorker();
    worker.state.statuses.set('/assets/chunk-def456.js', 500);
    await assert.rejects(worker.install(), /precache-http-500/);
    assert.equal(await worker.caches.has(worker.cacheName), false, 'failed install must delete its cache');
  });

  it('rejects a manifest from a different build than the stamped worker', async () => {
    const stamped = SW_SOURCE.replace("const BUILD_VERSION = '__OFFLINE_BUILD_VERSION__';", "const BUILD_VERSION = 'deadbeefdeadbeef';");
    const worker = await loadWorker({ source: stamped, version: 'cafebabecafebabe' });
    await assert.rejects(worker.install(), /manifest-version-mismatch/);
  });
});

describe('service worker offline navigation', () => {
  it('serves the cached app shell for deep links and unknown routes while offline', async () => {
    const worker = await loadWorker();
    await worker.install();
    worker.state.offline = true;

    for (const url of ['https://app.test/', 'https://app.test/drawing/42', 'https://app.test/gallery/']) {
      const response = await worker.request(navigationRequest(url));
      assert.ok(response, `navigation ${url} must be handled`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /coloring-shell/);
    }
  });

  it('injects an app-scope base tag so relative Vite URLs survive deep links', async () => {
    const worker = await loadWorker({
      indexHtml:
        '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
        '<script type="module" src="./assets/index-abc123.js"></script></head>' +
        '<body><div id="app">coloring-shell</div></body></html>',
    });
    await worker.install();
    worker.state.offline = true;

    const response = await worker.request(navigationRequest('https://app.test/drawing/42'));
    const html = await response.text();
    assert.match(html, /<head><base href="https:\/\/app\.test\/">/);
    assert.match(html, /src="\.\/assets\/index-abc123\.js"/);

    const indexOnly = await (await worker.caches.open(worker.cacheName)).match('/index.html');
    assert.doesNotMatch(await indexOnly.text(), /<base href=/, 'the verified index entry must stay byte-identical');
  });

  it('serves precached assets offline and ignores query strings used for cache busting', async () => {
    const worker = await loadWorker();
    await worker.install();
    worker.state.offline = true;

    const response = await worker.request(new Request('https://app.test/assets/chunk-def456.js'));
    assert.equal(response.status, 200);
    assert.match(await response.text(), /original-a/);

    const busted = await worker.request(new Request('https://app.test/assets/index-abc123.css?retry=1'));
    assert.equal(busted.status, 200);
  });

  it('returns a truthful offline page when no shell was ever cached', async () => {
    const worker = await loadWorker();
    worker.state.offline = true;
    const response = await worker.request(navigationRequest('https://app.test/'));
    assert.equal(response.status, 503);
    assert.match(await response.text(), /Não foi possível abrir o jogo offline/);
  });

  it('does not intercept cross-origin requests or non-GET methods', async () => {
    const worker = await loadWorker();
    const external = await worker.request(new Request('https://cdn.example.com/thing.js'));
    assert.equal(external, null, 'cross-origin requests must go straight to the browser');

    const post = await worker.request(new Request('https://app.test/api', { method: 'POST', body: 'x' }));
    assert.equal(post, null, 'non-GET requests must not be cached');
  });
});

describe('service worker lifecycle and repair', () => {
  it('keeps the current cache and unrelated storage, deleting only older versions', async () => {
    const worker = await loadWorker();
    await worker.install();
    const oldCache = await worker.caches.open(`${CACHE_PREFIX}oldoldoldoldold`);
    await oldCache.put('https://app.test/legacy', new Response('legacy'));
    const otherApp = await worker.caches.open('other-app-cache');
    await otherApp.put('https://app.test/other', new Response('other'));

    await worker.activate();

    assert.equal(await worker.caches.has(worker.cacheName), true, 'current cache must survive');
    assert.equal(await worker.caches.has(`${CACHE_PREFIX}oldoldoldoldold`), false, 'older version cache must be removed');
    assert.equal(await worker.caches.has('other-app-cache'), true, 'unrelated caches must not be touched');
  });

  it('repairs an incomplete cache on PREPARE_OFFLINE and then reports ready', async () => {
    const worker = await loadWorker();
    await worker.install();
    const cache = await worker.caches.open(worker.cacheName);
    cache.remove('/assets/chunk-def456.js');

    const before = await worker.sendMessage({ type: 'VERIFY_OFFLINE', requestId: 'repair-1' });
    assert.equal(before.ready, false);

    worker.state.offline = false;
    const reply = await worker.sendMessage({ type: 'PREPARE_OFFLINE', requestId: 'repair-2' });
    assert.equal(reply.requestId, 'repair-2');
    assert.equal(reply.ready, true);
    assert.ok(worker.requests.some((request) => request.startsWith('/assets/chunk-def456.js')), 'asset must be re-fetched');
    const repaired = await worker.caches.open(worker.cacheName);
    assert.ok(repaired.has('/assets/chunk-def456.js'));
  });

  it('reports not ready when the navigation shell alias is missing and repairs it', async () => {
    const worker = await loadWorker();
    await worker.install();
    const cache = await worker.caches.open(worker.cacheName);
    cache.remove('https://app.test/');
    cache.remove('https://app.test');

    const broken = await worker.sendMessage({ type: 'VERIFY_OFFLINE', requestId: 'alias-1' });
    assert.equal(broken.ready, false);
    assert.equal(broken.error, 'shell-alias-missing');

    const repaired = await worker.sendMessage({ type: 'PREPARE_OFFLINE', requestId: 'alias-2' });
    assert.equal(repaired.ready, true);
    const restored = await worker.caches.open(worker.cacheName);
    assert.ok(await restored.match('https://app.test/'));
  });

  it('rebuilds a hash-corrupted cache on PREPARE_OFFLINE', async () => {
    const worker = await loadWorker();
    await worker.install();
    const entry = worker.manifest.entries.find((candidate) => candidate.url === '/assets/chunk-def456.js');
    const cache = await worker.caches.open(worker.cacheName);
    cache.remove('/assets/chunk-def456.js');
    await cache.put('/assets/chunk-def456.js', new Response('x'.repeat(entry.size)));

    const corrupted = await worker.sendMessage({ type: 'VERIFY_OFFLINE', requestId: 'hash-1' });
    assert.equal(corrupted.ready, false);

    const repaired = await worker.sendMessage({ type: 'PREPARE_OFFLINE', requestId: 'hash-2' });
    assert.equal(repaired.ready, true);
    const restored = await worker.caches.open(worker.cacheName);
    const body = await (await restored.match('/assets/chunk-def456.js')).text();
    assert.match(body, /original-a/);
  });

  it('reports a truthful failure instead of a false ready when no cache exists', async () => {
    const worker = await loadWorker();
    worker.state.offline = true;
    const reply = await worker.sendMessage({ type: 'VERIFY_OFFLINE', requestId: 'no-cache' });
    assert.equal(reply.ready, false);
    assert.equal(reply.online, false);
    assert.match(reply.error, /Failed to fetch|manifest-timeout/);
  });

  it('correlates replies with the request id and never uses navigator.onLine', async () => {
    const swCode = SW_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!swCode.includes('navigator.onLine'), 'readiness must not depend on navigator.onLine');
    assert.ok(!SW_SOURCE.includes('indexedDB'), 'the service worker must not touch IndexedDB');
    const worker = await loadWorker();
    await worker.install();
    const reply = await worker.sendMessage({ type: 'VERIFY_OFFLINE', requestId: 'correlated-id' });
    assert.equal(reply.requestId, 'correlated-id');
  });
});

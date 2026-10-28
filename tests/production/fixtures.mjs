/**
 * Fixtures for the production smoke check (`scripts/production-smoke.mjs`).
 *
 * `buildSite()` writes a tiny but realistic deployment tree to a temp directory;
 * `serve()` exposes it over real HTTP in one of two modes:
 * - `headers: true`  — mimics the Vercel rules in vercel.json (immutable hashed
 *   assets, no-store worker, 404 for missing files under /assets and /icons);
 * - `headers: false` — mimics `vite preview` (no cache headers, SPA fallback for
 *   unknown paths), which is how the check is exercised locally.
 *
 * Node standard library only; nothing here writes inside the repository.
 */
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

export const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

/* ------------------------------------------------------------------------- */
/* Minimal PNG encoder (solid-colour RGBA, no dependencies)                  */
/* ------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

export function makePng(width, height, rgba = [251, 244, 231, 255]) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  const row = Buffer.alloc(width * 4 + 1);
  for (let x = 0; x < width; x += 1) {
    row[1 + x * 4] = rgba[0];
    row[2 + x * 4] = rgba[1];
    row[3 + x * 4] = rgba[2];
    row[4 + x * 4] = rgba[3];
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------------- */
/* Site builder                                                              */
/* ------------------------------------------------------------------------- */

export const SHELL_HTML = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#fbf4e7" />
    <link rel="manifest" href="./manifest.webmanifest" />
    <link rel="icon" href="./icons/icon.svg" type="image/svg+xml" />
    <title>Rabisco — smoke</title>
    <script type="module" crossorigin src="./assets/index-Smoke01.js"></script>
    <link rel="stylesheet" crossorigin href="./assets/index-Smoke02.css">
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>
`;

export const WEB_MANIFEST = {
  id: './',
  name: 'Rabisco — smoke',
  short_name: 'Rabisco',
  lang: 'pt-BR',
  start_url: './',
  scope: './',
  display: 'standalone',
  background_color: '#fbf4e7',
  theme_color: '#fbf4e7',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
  ],
};

/**
 * @param {{ stampServiceWorker?: boolean, version?: string, entriesOverride?: (entries: object[]) => object[] }} [options]
 * @returns {Promise<{ dir: string, version: string, files: Map<string, Buffer> }>}
 */
export async function buildSite(options = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'coloring-smoke-'));
  const version = options.version ?? createHash('sha256').update(dir).digest('hex').slice(0, 16);

  const files = new Map([
    ['assets/index-Smoke01.js', Buffer.from("console.log('rabisco smoke');\n")],
    ['assets/index-Smoke02.css', Buffer.from('body{background:#fbf4e7}\n')],
    ['icons/icon-192.png', makePng(192, 192)],
    ['icons/icon-512.png', makePng(512, 512)],
    ['icons/icon-maskable-192.png', makePng(192, 192, [255, 190, 120, 255])],
    ['icons/icon-maskable-512.png', makePng(512, 512, [255, 190, 120, 255])],
    [
      'icons/icon.svg',
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#fbf4e7"/></svg>\n',
      ),
    ],
    ['index.html', Buffer.from(SHELL_HTML)],
    ['manifest.webmanifest', Buffer.from(`${JSON.stringify(WEB_MANIFEST, null, 2)}\n`)],
  ]);

  const entries = [...files.entries()]
    .map(([relative, buffer]) => ({
      url: `/${relative}`,
      size: buffer.byteLength,
      hash: sha256(buffer),
      type: CONTENT_TYPES[path.extname(relative)] ?? 'application/octet-stream',
    }))
    .sort((a, b) => (a.url < b.url ? -1 : 1));

  const offlineManifest = {
    schemaVersion: 1,
    version,
    generatedAt: new Date().toISOString(),
    base: '/',
    shell: '/index.html',
    entries: options.entriesOverride ? options.entriesOverride(entries) : entries,
  };
  files.set('offline-manifest.json', Buffer.from(`${JSON.stringify(offlineManifest, null, 2)}\n`));

  const buildVersion = options.stampServiceWorker === false ? '__OFFLINE_BUILD_VERSION__' : version;
  files.set(
    'sw.js',
    Buffer.from(`'use strict';
const BUILD_VERSION = '${buildVersion}';
const CACHE_PREFIX = 'coloring-offline-v1-';
const IS_STAMPED = BUILD_VERSION !== '__OFFLINE_BUILD_VERSION__' && BUILD_VERSION.length > 0;
self.addEventListener('install', () => {});
`),
  );

  await Promise.all(
    [...files.entries()].map(async ([relative, buffer]) => {
      const absolute = path.join(dir, relative);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, buffer);
    }),
  );

  return { dir, version, files, offlineManifest };
}

/* ------------------------------------------------------------------------- */
/* Static server                                                             */
/* ------------------------------------------------------------------------- */

const CACHE_HEADERS = {
  'sw.js': { 'cache-control': 'no-cache, no-store, must-revalidate', 'service-worker-allowed': '/' },
  'offline-manifest.json': { 'cache-control': 'no-cache, no-store, must-revalidate' },
  'manifest.webmanifest': { 'cache-control': 'no-cache, must-revalidate' },
  'index.html': { 'cache-control': 'no-cache, must-revalidate' },
};

/**
 * @param {string} root directory produced by `buildSite()`
 * @param {{ headers?: boolean }} [options]
 */
export async function serve(root, options = {}) {
  const withHeaders = options.headers !== false;
  const requests = [];

  const server = createServer(async (request, response) => {
    const send = (status, body, type, extra = {}) => {
      response.writeHead(status, { 'content-type': type, ...extra });
      response.end(body);
    };

    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
      requests.push(pathname);
      const relative = pathname.replace(/^\/+/, '');
      const absolute = path.resolve(root, relative || 'index.html');
      if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
        send(403, 'forbidden', 'text/plain; charset=utf-8');
        return;
      }

      const ext = path.extname(absolute);
      const headers = withHeaders ? (CACHE_HEADERS[relative] ?? assetHeaders(relative)) : {};

      let body = null;
      try {
        body = await readFile(absolute);
      } catch {
        body = null;
      }

      if (!body) {
        const isStaticPath =
          /^\/(assets|icons)\//.test(pathname) ||
          ['/sw.js', '/offline-manifest.json', '/manifest.webmanifest'].includes(pathname);
        if (withHeaders && isStaticPath) {
          send(404, 'Not Found', 'text/plain; charset=utf-8');
          return;
        }
        // vite preview style: unknown paths fall back to the SPA shell.
        const shell = await readFile(path.resolve(root, 'index.html'));
        send(200, shell, CONTENT_TYPES['.html']);
        return;
      }

      const type = CONTENT_TYPES[ext] ?? 'application/octet-stream';
      send(200, body, type, headers);
    } catch (error) {
      send(500, `fixture server error: ${error.message}`, 'text/plain; charset=utf-8');
    }
  });

  const origin = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });

  return {
    origin,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

function assetHeaders(relative) {
  if (relative.startsWith('assets/')) return { 'cache-control': 'public, max-age=31536000, immutable' };
  if (relative.startsWith('icons/')) return { 'cache-control': 'public, max-age=3600' };
  return {};
}

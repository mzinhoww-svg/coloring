import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { deflateSync } from 'node:zlib';

import { buildOffline, readPngSize } from '../../tools/build-offline.mjs';

const run = promisify(execFile);
const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const SCRIPT = path.join(REPO_ROOT, 'tools/build-offline.mjs');
const PUBLIC_SW = path.join(REPO_ROOT, 'public/sw.js');

let fixtures = [];

after(async () => {
  await Promise.all(fixtures.map((dir) => rm(dir, { recursive: true, force: true })));
});

/* ------------------------------------------------------------------------- */
/* Fixture helpers                                                           */
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

/** Minimal but valid RGBA PNG; build-offline only inspects the IHDR. */
function makePng(width, height, rgba = [255, 244, 223, 255]) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
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
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function webManifest(overrides = {}) {
  return {
    id: './',
    name: 'Coloring — pintar e relaxar',
    short_name: 'Coloring',
    lang: 'pt-BR',
    start_url: './',
    scope: './',
    display: 'standalone',
    theme_color: '#123A46',
    background_color: '#101828',
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    ...overrides,
  };
}

async function makeDist({ manifest = webManifest(), sw = PUBLIC_SW } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'coloring-offline-'));
  fixtures.push(root);
  const dist = path.join(root, 'dist');
  await mkdir(path.join(dist, 'assets'), { recursive: true });
  await mkdir(path.join(dist, 'icons'), { recursive: true });

  const files = {
    'index.html':
      '<!doctype html><html lang="pt-BR"><head><link rel="manifest" href="/manifest.webmanifest">' +
      '<meta name="theme-color" content="#123A46"><script type="module" src="/assets/index-abc123.js"></script>' +
      '</head><body><div id="app"></div></body></html>',
    'assets/index-abc123.js': 'console.log("coloring-app-shell");\n',
    'assets/index-abc123.css': 'body{margin:0;background:#101828;color:#f4f1ea}\n',
    'assets/chunk-def456.js': 'export const drawings = ["original-a", "original-b"];\n',
    'assets/icon-data.json': '{"drawings":135}\n',
    'manifest.webmanifest': `${JSON.stringify(manifest, null, 2)}\n`,
  };
  for (const [relative, contents] of Object.entries(files)) {
    await writeFile(path.join(dist, relative), contents);
  }

  await writeFile(path.join(dist, 'icons/icon-192.png'), makePng(192, 192));
  await writeFile(path.join(dist, 'icons/icon-512.png'), makePng(512, 512));
  await writeFile(path.join(dist, 'icons/icon-maskable-192.png'), makePng(192, 192));
  await writeFile(path.join(dist, 'icons/icon-maskable-512.png'), makePng(512, 512));
  await writeFile(path.join(dist, 'icons/icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
  await copyFile(sw, path.join(dist, 'sw.js'));

  return dist;
}

async function readOfflineManifest(dist) {
  return JSON.parse(await readFile(path.join(dist, 'offline-manifest.json'), 'utf8'));
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

/* ------------------------------------------------------------------------- */
/* Tests                                                                     */
/* ------------------------------------------------------------------------- */

describe('build-offline manifest generation', () => {
  let dist;

  before(async () => {
    dist = await makeDist();
    await buildOffline({ distDir: dist, quiet: true });
  });

  it('lists every bundled chunk, dependency, icon and the shell', async () => {
    const manifest = await readOfflineManifest(dist);
    const urls = manifest.entries.map((entry) => entry.url);

    assert.deepEqual(urls, [...urls].sort(), 'entries must be deterministic and sorted');
    for (const expected of [
      '/index.html',
      '/assets/index-abc123.js',
      '/assets/index-abc123.css',
      '/assets/chunk-def456.js',
      '/assets/icon-data.json',
      '/manifest.webmanifest',
      '/icons/icon-192.png',
      '/icons/icon-512.png',
      '/icons/icon-maskable-512.png',
      '/icons/icon.svg',
    ]) {
      assert.ok(urls.includes(expected), `expected ${expected} in precache manifest`);
    }
    assert.ok(!urls.includes('/sw.js'), 'the service worker must not precache itself');
    assert.ok(!urls.includes('/offline-manifest.json'), 'the manifest must not include itself');
    assert.equal(manifest.shell, '/index.html');
    assert.equal(manifest.base, '/');
  });

  it('records real sizes and hashes for every entry', async () => {
    const manifest = await readOfflineManifest(dist);
    for (const entry of manifest.entries) {
      const file = path.join(dist, entry.url.replace(/^\//, ''));
      const contents = await readFile(file);
      assert.equal(entry.size, contents.byteLength, `size mismatch for ${entry.url}`);
      assert.equal(entry.hash, sha256(contents), `hash mismatch for ${entry.url}`);
      assert.match(entry.hash, /^[a-f0-9]{64}$/);
    }
  });

  it('stamps the service worker with the same version as the manifest', async () => {
    const manifest = await readOfflineManifest(dist);
    const sw = await readFile(path.join(dist, 'sw.js'), 'utf8');
    assert.match(sw, /const BUILD_VERSION = '[a-f0-9]{16}';/);
    assert.ok(sw.includes(`const BUILD_VERSION = '${manifest.version}';`));
    assert.ok(!/const BUILD_VERSION = '__OFFLINE_BUILD_VERSION__'/.test(sw), 'placeholder assignment must be replaced');
  });

  it('is idempotent and content-addressed', async () => {
    const first = await readOfflineManifest(dist);
    const swFirst = await readFile(path.join(dist, 'sw.js'), 'utf8');

    await buildOffline({ distDir: dist, quiet: true });
    const second = await readOfflineManifest(dist);
    const swSecond = await readFile(path.join(dist, 'sw.js'), 'utf8');

    assert.equal(second.version, first.version, 'unchanged input must keep the version');
    assert.deepEqual(second.entries, first.entries);
    assert.equal(swSecond, swFirst, 're-running must not corrupt the stamped worker');
  });

  it('changes the version when a bundled chunk changes', async () => {
    const before = await readOfflineManifest(dist);
    await writeFile(path.join(dist, 'assets/chunk-def456.js'), 'export const drawings = ["original-a", "original-c"];\n');
    const result = await buildOffline({ distDir: dist, quiet: true });
    assert.notEqual(result.version, before.version);
    const sw = await readFile(path.join(dist, 'sw.js'), 'utf8');
    assert.ok(sw.includes(`const BUILD_VERSION = '${result.version}';`));
  });
});

describe('build-offline deployment paths', () => {
  it('prefixes every URL with a non-root base path', async () => {
    const dist = await makeDist();
    const result = await buildOffline({ distDir: dist, base: '/coloring/', quiet: true });
    const manifest = await readOfflineManifest(dist);
    assert.equal(manifest.base, '/coloring/');
    assert.equal(manifest.shell, '/coloring/index.html');
    for (const entry of manifest.entries) assert.ok(entry.url.startsWith('/coloring/'), entry.url);
    assert.ok(manifest.entries.some((entry) => entry.url === '/coloring/assets/chunk-def456.js'));
    assert.equal(result.entries, manifest.entries.length);
  });

  it('excludes sourcemaps and dot directories from the precache', async () => {
    const dist = await makeDist();
    await writeFile(path.join(dist, 'assets/chunk-def456.js.map'), '{}');
    await mkdir(path.join(dist, '.vite'), { recursive: true });
    await writeFile(path.join(dist, '.vite/manifest.json'), '{"internal":true}');
    await buildOffline({ distDir: dist, quiet: true });
    const urls = (await readOfflineManifest(dist)).entries.map((entry) => entry.url);
    assert.ok(!urls.some((url) => url.endsWith('.map')));
    assert.ok(!urls.some((url) => url.includes('/.vite/')));
  });
});

describe('build-offline installability guards', () => {
  it('fails when the web manifest is not standalone', async () => {
    const dist = await makeDist({ manifest: webManifest({ display: 'minimal-ui' }) });
    await assert.rejects(buildOffline({ distDir: dist, quiet: true }), /display must be "standalone"/);
  });

  it('fails when the 512px icon is missing', async () => {
    const icons = webManifest().icons.filter((icon) => icon.sizes !== '512x512');
    const dist = await makeDist({ manifest: webManifest({ icons }) });
    await assert.rejects(buildOffline({ distDir: dist, quiet: true }), /needs a 512x512 PNG icon/);
  });

  it('fails when an icon declares the wrong dimensions', async () => {
    const dist = await makeDist();
    await writeFile(path.join(dist, 'icons/icon-512.png'), makePng(256, 256));
    await assert.rejects(buildOffline({ distDir: dist, quiet: true }), /declares 512x512 but is 256x256/);
  });

  it('fails when the service worker has no version marker', async () => {
    const dist = await makeDist();
    await writeFile(path.join(dist, 'sw.js'), "'use strict';\n");
    await assert.rejects(buildOffline({ distDir: dist, quiet: true }), /BUILD_VERSION marker/);
  });
});

describe('build-offline CLI', () => {
  it('builds a dist directory through the documented command', async () => {
    const dist = await makeDist();
    const { stdout } = await run(process.execPath, [SCRIPT, '--dist', dist, '--base', '/']);
    assert.match(stdout, /offline: version [a-f0-9]{16}/);
    assert.match(stdout, /offline: wrote /);
    const manifest = await readOfflineManifest(dist);
    assert.match(manifest.version, /^[a-f0-9]{16}$/);
  });

  it('exits non-zero with an actionable message when dist is missing index.html', async () => {
    const dist = await makeDist();
    await rm(path.join(dist, 'index.html'));
    await assert.rejects(run(process.execPath, [SCRIPT, '--dist', dist]), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /missing .*index\.html/);
      return true;
    });
  });

  it('exits non-zero when the service worker was not copied into dist', async () => {
    const dist = await makeDist();
    await rm(path.join(dist, 'sw.js'));
    await assert.rejects(run(process.execPath, [SCRIPT, '--dist', dist]), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /public\/sw\.js must be copied by Vite/);
      return true;
    });
  });
});

describe('readPngSize', () => {
  it('reads icon dimensions and rejects non-PNG files', async () => {
    const dist = await makeDist();
    assert.deepEqual(await readPngSize(path.join(dist, 'icons/icon-192.png')), { width: 192, height: 192 });
    assert.deepEqual(await readPngSize(path.join(dist, 'icons/icon-512.png')), { width: 512, height: 512 });
    assert.equal(await readPngSize(path.join(dist, 'index.html')), null);
  });
});

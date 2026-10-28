#!/usr/bin/env node
/**
 * Generates the offline precache manifest for the Coloring PWA build.
 *
 * Run after `vite build`:
 *
 *   node tools/build-offline.mjs
 *
 * What it does:
 * 1. scans the Vite output (default `dist/`) and hashes every deployable file;
 * 2. stamps `dist/sw.js` with a content-derived build version so the browser
 *    always detects a changed service worker and never serves a stale cache;
 * 3. writes `dist/offline-manifest.json`, which the service worker uses for an
 *    atomic, completeness-verified precache;
 * 4. validates the web app manifest and its PNG icons so an installability
 *    regression fails the build instead of shipping silently.
 *
 * Options:
 *   --dist <dir>       build output directory (default: dist)
 *   --base <path>      deployment base path (default: /)
 *   --sw <file>        service worker inside dist (default: <dist>/sw.js)
 *   --manifest <file>  output manifest (default: <dist>/offline-manifest.json)
 *   --quiet            only print errors and warnings
 *
 * The script has no dependencies outside Node's standard library.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const VERSION_TOKEN = '__OFFLINE_BUILD_VERSION__';
const MANIFEST_NAME = 'offline-manifest.json';
const SW_NAME = 'sw.js';
const WEB_MANIFEST_NAME = 'manifest.webmanifest';
const VERSION_LENGTH = 16;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const SKIP_FILES = new Set([SW_NAME, MANIFEST_NAME]);

/* ------------------------------------------------------------------------- */
/* Public API                                                                */
/* ------------------------------------------------------------------------- */

/**
 * @param {{ distDir?: string, base?: string, swPath?: string, manifestPath?: string, quiet?: boolean, log?: (line: string) => void }} [options]
 * @returns {Promise<{ version: string, entries: number, bytes: number, manifestPath: string, swPath: string, warnings: string[] }>}
 */
export async function buildOffline(options = {}) {
  const distDir = path.resolve(options.distDir ?? 'dist');
  const base = normalizeBase(options.base ?? '/');
  const swPath = path.resolve(options.swPath ?? path.join(distDir, SW_NAME));
  const manifestPath = path.resolve(options.manifestPath ?? path.join(distDir, MANIFEST_NAME));
  const log = options.quiet ? () => {} : (options.log ?? ((line) => console.log(line)));

  const distStat = await stat(distDir).catch(() => null);
  if (!distStat || !distStat.isDirectory()) {
    throw new Error(`build output not found: ${distDir}. Run "vite build" before this script.`);
  }

  const indexFile = path.join(distDir, 'index.html');
  if (!(await fileExists(indexFile))) {
    throw new Error(`missing ${indexFile}. The Vite build output is incomplete.`);
  }

  const webManifest = await validateWebManifest(distDir);
  const warnings = webManifest.warnings;

  const files = await collectFiles(distDir);
  const entries = [];
  let bytes = 0;
  for (const relativePath of files) {
    const absolutePath = path.join(distDir, relativePath);
    const contents = await readFile(absolutePath);
    const url = toUrl(base, relativePath);
    const entry = {
      url,
      size: contents.byteLength,
      hash: createHash('sha256').update(contents).digest('hex'),
      type: contentType(relativePath),
    };
    entries.push(entry);
    bytes += contents.byteLength;
  }

  if (entries.length === 0) throw new Error('no deployable files found in the build output');
  if (!entries.some((entry) => entry.url === toUrl(base, 'index.html'))) {
    throw new Error('index.html is missing from the precache entry list');
  }
  if (!entries.some((entry) => entry.url.endsWith('.js'))) {
    throw new Error('no JavaScript chunk found in the build output; refusing to certify an offline app that cannot boot');
  }

  entries.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
  const version = computeVersion(entries);

  const swSource = await readFile(swPath, 'utf8').catch(() => null);
  if (swSource === null) {
    throw new Error(`missing service worker at ${swPath}. public/sw.js must be copied by Vite (default publicDir).`);
  }
  const stampedSw = stampServiceWorker(swSource, version);
  await writeFile(swPath, stampedSw);

  const payload = {
    schemaVersion: 1,
    version,
    generatedAt: new Date().toISOString(),
    base,
    shell: toUrl(base, 'index.html'),
    entries,
  };
  await writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}\n`);

  for (const warning of warnings) log(`offline: warning: ${warning}`);
  log(`offline: version ${version} · ${entries.length} files · ${formatBytes(bytes)}`);
  log(`offline: stamped ${path.relative(process.cwd(), swPath)}`);
  log(`offline: wrote ${path.relative(process.cwd(), manifestPath)}`);

  return { version, entries: entries.length, bytes, manifestPath, swPath, warnings };
}

/* ------------------------------------------------------------------------- */
/* Manifest generation                                                       */
/* ------------------------------------------------------------------------- */

export function computeVersion(entries) {
  const fingerprint = entries
    .map((entry) => `${entry.url}\u0000${entry.size}\u0000${entry.hash}`)
    .sort()
    .join('\n');
  return createHash('sha256').update(fingerprint).digest('hex').slice(0, VERSION_LENGTH);
}

export function stampServiceWorker(source, version) {
  const pattern = /(const\s+BUILD_VERSION\s*=\s*)(['"])[^'"]*\2/;
  if (!pattern.test(source)) {
    throw new Error(
      `service worker is missing the BUILD_VERSION marker (${VERSION_TOKEN}); stale workers could not be invalidated`,
    );
  }
  const stamped = source.replace(pattern, (_match, prefix) => `${prefix}'${version}'`);
  const assigned = stamped.match(/const\s+BUILD_VERSION\s*=\s*['"]([^'"]*)['"]/);
  if (!assigned || assigned[1] === VERSION_TOKEN) {
    throw new Error('service worker version placeholder was not replaced');
  }
  return stamped;
}

async function collectFiles(distDir) {
  const found = [];
  async function walk(directory, prefix) {
    const items = await readdir(directory, { withFileTypes: true });
    items.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const item of items) {
      const relativePath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.name.startsWith('.')) continue;
      if (item.name.endsWith('.map')) continue;
      if (!prefix && SKIP_FILES.has(item.name)) continue;
      const absolutePath = path.join(directory, item.name);
      if (item.isDirectory()) {
        await walk(absolutePath, relativePath);
        continue;
      }
      if (!item.isFile()) continue;
      found.push(relativePath.replaceAll(path.sep, '/'));
    }
  }
  await walk(distDir, '');
  return found;
}

function normalizeBase(value) {
  let base = String(value ?? '/').trim();
  if (base.length === 0) base = '/';
  if (!base.startsWith('/')) base = `/${base}`;
  if (!base.endsWith('/')) base = `${base}/`;
  return base.replace(/\/{2,}/g, '/');
}

function toUrl(base, relativePath) {
  const encoded = relativePath
    .split('/')
    .filter((part) => part.length > 0)
    .map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`))
    .join('/');
  return `${base}${encoded}`;
}

function contentType(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.wasm': 'application/wasm',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.txt': 'text/plain; charset=utf-8',
  };
  return types[extension] ?? 'application/octet-stream';
}

/* ------------------------------------------------------------------------- */
/* PWA / web manifest validation                                             */
/* ------------------------------------------------------------------------- */

async function validateWebManifest(distDir) {
  const manifestPath = path.join(distDir, WEB_MANIFEST_NAME);
  const source = await readFile(manifestPath, 'utf8').catch(() => null);
  if (source === null) {
    throw new Error(
      `missing ${WEB_MANIFEST_NAME} in ${distDir}. public/manifest.webmanifest must exist for the app to be installable.`,
    );
  }

  let manifest;
  try {
    manifest = JSON.parse(source);
  } catch (error) {
    throw new Error(`${WEB_MANIFEST_NAME} is not valid JSON: ${error.message}`);
  }

  const problems = [];
  if (typeof manifest.name !== 'string' || manifest.name.trim().length === 0) problems.push('name is required');
  if (typeof manifest.short_name !== 'string' || manifest.short_name.trim().length === 0) problems.push('short_name is required');
  if (manifest.display !== 'standalone') problems.push('display must be "standalone"');
  if (typeof manifest.start_url !== 'string' || manifest.start_url.length === 0) problems.push('start_url is required');
  if (typeof manifest.lang !== 'string' || !manifest.lang.toLowerCase().startsWith('pt')) problems.push('lang must be pt-BR');
  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) problems.push('icons are required');

  const warnings = [];
  if (problems.length > 0) {
    throw new Error(`${WEB_MANIFEST_NAME} is not a valid installable manifest: ${problems.join('; ')}`);
  }

  const seen = new Map();
  for (const icon of manifest.icons) {
    if (!icon || typeof icon.src !== 'string') {
      throw new Error(`${WEB_MANIFEST_NAME} contains an icon without src`);
    }
    const relative = icon.src.replace(/^\/+/, '');
    const iconPath = path.join(distDir, relative);
    if (!(await fileExists(iconPath))) {
      throw new Error(`icon ${icon.src} referenced by ${WEB_MANIFEST_NAME} does not exist in the build output`);
    }
    const purpose = typeof icon.purpose === 'string' ? icon.purpose : 'any';
    const declared = typeof icon.sizes === 'string' ? icon.sizes : '';
    if (icon.type === 'image/png') {
      const size = await readPngSize(iconPath);
      if (!size) throw new Error(`icon ${icon.src} is not a valid PNG`);
      const expected = declared.match(/^(\d+)x(\d+)$/);
      if (expected && (Number(expected[1]) !== size.width || Number(expected[2]) !== size.height)) {
        throw new Error(
          `icon ${icon.src} declares ${declared} but is ${size.width}x${size.height}`,
        );
      }
      if (/^(\d+)x(\d+)$/.test(declared)) seen.set(declared, { purpose, src: icon.src });
    }
    for (const token of purpose.split(/\s+/)) {
      if (token !== 'any' && token !== 'maskable' && token !== 'monochrome') {
        warnings.push(`icon ${icon.src} has unknown purpose "${token}"`);
      }
    }
  }

  for (const required of ['192x192', '512x512']) {
    const match = seen.get(required);
    if (!match) throw new Error(`${WEB_MANIFEST_NAME} needs a ${required} PNG icon`);
    if (!match.purpose.includes('any') && !match.purpose.includes('maskable')) {
      throw new Error(`${WEB_MANIFEST_NAME} ${required} icon must declare purpose any or maskable`);
    }
  }
  const maskable = [...seen.values()].some((icon) => icon.purpose.includes('maskable'));
  if (!maskable) throw new Error(`${WEB_MANIFEST_NAME} needs at least one maskable PNG icon`);

  const indexSource = await readFile(path.join(distDir, 'index.html'), 'utf8').catch(() => '');
  if (!/<link[^>]+rel=["']manifest["']/i.test(indexSource)) {
    warnings.push('index.html does not link rel="manifest"; the app will not be installable until it does');
  }
  if (!/name=["']theme-color["']/i.test(indexSource)) {
    warnings.push('index.html does not declare <meta name="theme-color">');
  }

  return { manifest, warnings };
}

export async function readPngSize(file) {
  const buffer = await readFile(file);
  if (buffer.byteLength < 24) return null;
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/* ------------------------------------------------------------------------- */
/* CLI                                                                       */
/* ------------------------------------------------------------------------- */

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (argument === '--quiet') {
      options.quiet = true;
      continue;
    }
    const value = argv[index + 1];
    if (argument === '--dist') {
      if (!value) throw new Error('--dist requires a directory');
      options.distDir = value;
      index += 1;
      continue;
    }
    if (argument === '--base') {
      if (!value) throw new Error('--base requires a path');
      options.base = value;
      index += 1;
      continue;
    }
    if (argument === '--sw') {
      if (!value) throw new Error('--sw requires a file path');
      options.swPath = value;
      index += 1;
      continue;
    }
    if (argument === '--manifest') {
      if (!value) throw new Error('--manifest requires a file path');
      options.manifestPath = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${argument}`);
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node tools/build-offline.mjs [options]

Options:
  --dist <dir>       build output directory (default: dist)
  --base <path>      deployment base path (default: /)
  --sw <file>        service worker inside dist (default: <dist>/sw.js)
  --manifest <file>  output manifest (default: <dist>/offline-manifest.json)
  --quiet            only print errors and warnings`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  await buildOffline(options);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

async function fileExists(file) {
  try {
    const info = await stat(file);
    return info.isFile();
  } catch {
    return false;
  }
}

const invokedDirectly = process.argv[1] ? path.resolve(process.argv[1]) === SCRIPT_PATH : false;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(`offline: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

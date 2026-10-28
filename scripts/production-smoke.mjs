#!/usr/bin/env node
/**
 * Production smoke check for the Coloring (Rabisco) PWA deployment.
 *
 * What it does — real HTTP only, no build, no deploy, no browser:
 * 1. app shell: `/` is HTML, mounts the app, links the manifest and the hashed
 *    Vite chunks, and those chunks really load;
 * 2. web manifest: valid JSON, installable fields, every icon reachable with
 *    the declared PNG dimensions;
 * 3. service worker: served as JS, version-stamped, version matches the
 *    offline manifest, and (strict) never cached as immutable;
 * 4. offline manifest: schema, shell/JS coverage, and every precache entry
 *    fetched for real with matching size and SHA-256;
 * 5. static assets: hashed asset caching, icon endpoints, and a missing asset
 *    that must not be answered with the SPA shell;
 * 6. SPA fallback: a deep link still boots the app shell.
 *
 * Usage:
 *   node scripts/production-smoke.mjs https://coloring.vercel.app
 *   node scripts/production-smoke.mjs --url https://preview-abc.vercel.app --strict
 *   node scripts/production-smoke.mjs --url https://preview-abc.vercel.app --vercel-curl
 *   PRODUCTION_SMOKE_URL=https://coloring.vercel.app node scripts/production-smoke.mjs
 *
 * Transport:
 *   - default: anonymous `fetch`, for public production URLs;
 *   - --vercel-curl: every request runs through
 *     `vercel curl <path> --deployment <url>`, so a Vercel-protected preview is
 *     reached with the CLI's existing session. The script never reads, prints or
 *     forwards tokens, cookies or bypass secrets, and it does not disable
 *     Deployment Protection.
 *
 * Options:
 *   --url <url>        deployment URL (or pass it as the first positional argument)
 *   --deployment <url> alias for --url
 *   --vercel-curl      route requests through the authenticated `vercel curl` CLI
 *   --strict           promote warnings (cache headers, content-type drift) to failures
 *   --timeout <ms>     per-request timeout (default 15000)
 *   --retries <n>      retries for network errors and 5xx (default 2)
 *   --no-hash          skip SHA-256 verification of precache entries
 *   --no-spa           skip the deep-link fallback check
 *   --json             print the machine-readable report instead of lines
 *   --quiet            print only failures, warnings and the summary
 *   -h, --help         show this help
 *
 * Exit codes: 0 = deployment healthy, 1 = at least one check failed,
 *             2 = usage error (missing/invalid URL).
 *
 * Secret hygiene: query strings, userinfo, cookies and arbitrary response
 * headers/body snippets are never printed. Only a whitelist of cache/content
 * headers is reported, and URLs are reduced to origin + path.
 */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

const USER_AGENT = 'coloring-production-smoke/1.0';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 2;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const CONCURRENCY = 5;
const SW_VERSION_TOKEN = '__OFFLINE_BUILD_VERSION__';
const PRINTABLE_HEADERS = ['content-type', 'cache-control', 'service-worker-allowed'];
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/* ------------------------------------------------------------------------- */
/* CLI                                                                       */
/* ------------------------------------------------------------------------- */

function usage() {
  return `Coloring production smoke

  node scripts/production-smoke.mjs <deployment-url> [options]

Options
  --url <url>        deployment URL (or first positional argument)
  --deployment <url> alias for --url
  --vercel-curl      use the authenticated "vercel curl" CLI (protected previews)
  --strict           treat warnings as failures (use against production)
  --timeout <ms>     per-request timeout (default ${DEFAULT_TIMEOUT_MS})
  --retries <n>      retries on network error / 5xx (default ${DEFAULT_RETRIES})
  --no-hash          skip SHA-256 verification of precache entries
  --no-spa           skip the deep-link fallback check
  --json             print a JSON report
  --quiet            print only failures, warnings and the summary
  -h, --help         show this help

Examples
  node scripts/production-smoke.mjs https://coloring.vercel.app --strict
  node scripts/production-smoke.mjs --url http://localhost:4173
  node scripts/production-smoke.mjs --deployment https://<preview>.vercel.app --vercel-curl
  PRODUCTION_SMOKE_URL=https://coloring.vercel.app node scripts/production-smoke.mjs
`;
}

function parseArgs(argv) {
  const options = {
    url: process.env.PRODUCTION_SMOKE_URL ?? '',
    strict: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retries: DEFAULT_RETRIES,
    verifyHash: true,
    checkSpa: true,
    via: 'http',
    json: false,
    quiet: false,
    help: false,
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '--vercel-curl') {
      options.via = 'vercel-curl';
      continue;
    }
    if (arg === '--no-hash') {
      options.verifyHash = false;
      continue;
    }
    if (arg === '--no-spa') {
      options.checkSpa = false;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--quiet') {
      options.quiet = true;
      continue;
    }
    if (arg === '--url' || arg === '--deployment' || arg === '--timeout' || arg === '--retries') {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`missing value for ${arg}`);
      index += 1;
      if (arg === '--url' || arg === '--deployment') options.url = value;
      if (arg === '--timeout') options.timeoutMs = toPositiveInt(value, '--timeout');
      if (arg === '--retries') options.retries = toNonNegativeInt(value, '--retries');
      continue;
    }
    if (arg.startsWith('--url=')) {
      options.url = arg.slice('--url='.length);
      continue;
    }
    if (arg.startsWith('--deployment=')) {
      options.url = arg.slice('--deployment='.length);
      continue;
    }
    if (arg.startsWith('--timeout=')) {
      options.timeoutMs = toPositiveInt(arg.slice('--timeout='.length), '--timeout');
      continue;
    }
    if (arg.startsWith('--retries=')) {
      options.retries = toNonNegativeInt(arg.slice('--retries='.length), '--retries');
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`unknown option: ${arg}`);
    positional.push(arg);
  }

  if (!options.url && positional.length > 0) options.url = positional[0];
  if (positional.length > 1) throw new Error('only one deployment URL is accepted');
  return options;
}

function toPositiveInt(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive integer`);
  return parsed;
}

function toNonNegativeInt(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${flag} must be a non-negative integer`);
  return parsed;
}

/**
 * Reduces a URL to origin + path so tokens in the query string or userinfo never
 * reach the terminal, logs or CI output.
 */
export function redactUrl(value) {
  try {
    const url = new URL(value);
    const path = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '') || '/';
    return `${url.origin}${path}`;
  } catch {
    return '<invalid-url>';
  }
}

/** Accepts `https://host`, `host/preview`, or a URL with a trailing path/base. */
export function normalizeBaseUrl(raw) {
  if (!raw || typeof raw !== 'string') throw new Error('a deployment URL is required');
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('a deployment URL is required');
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('the deployment URL must use http or https');
  }
  url.search = '';
  url.hash = '';
  url.username = '';
  url.password = '';
  if (!url.pathname.endsWith('/')) url.pathname = `${url.pathname}/`;
  return url;
}

/* ------------------------------------------------------------------------- */
/* HTTP                                                                      */
/* ------------------------------------------------------------------------- */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Anonymous HTTP transport — the default, for public production deployments. */
async function httpRequest(url, options) {
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout(options.timeoutMs),
    headers: { 'user-agent': USER_AGENT, accept: '*/*', 'cache-control': 'no-cache' },
  });
  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength > MAX_BODY_BYTES) throw new Error('response body too large');
  return { status: response.status, headers: response.headers, body, finalUrl: response.url || url };
}

function headerMap(raw) {
  const map = new Map();
  for (const line of raw.split(/\r?\n/)) {
    const index = line.indexOf(':');
    if (index <= 0) continue;
    const name = line.slice(0, index).trim().toLowerCase();
    if (!name) continue;
    const value = line.slice(index + 1).trim();
    map.set(name, map.has(name) ? `${map.get(name)}, ${value}` : value);
  }
  return map;
}

function parseCurlResponse(headerDump, body) {
  // Redirects append several header blocks; the last one is the final response.
  const blocks = headerDump.split(/\r?\n\r?\n/).filter((block) => /^HTTP\//m.test(block));
  const last = blocks.at(-1) ?? '';
  const status = Number(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/m.exec(last)?.[1] ?? 0);
  const map = headerMap(last.split(/\r?\n/).slice(1).join('\n'));
  return {
    status,
    body,
    headers: {
      get: (name) => map.get(String(name).toLowerCase()) ?? null,
    },
  };
}

/**
 * Authenticated transport for Vercel-protected deployments.
 *
 * Each request is delegated to `vercel curl <path> --deployment <url>`, which
 * reuses the CLI's own session. No token is read from the environment, printed
 * or passed on the command line, and Deployment Protection stays untouched.
 */
async function vercelCurlRequest(url, deployment, options) {
  const target = new URL(url);
  const base = new URL(deployment);
  if (target.origin !== base.origin) {
    throw new Error(`refusing a cross-origin request through vercel curl: ${redactUrl(target.href)}`);
  }
  const relative = `${target.pathname}${target.search}`;
  const workdir = await mkdtemp(path.join(tmpdir(), 'coloring-smoke-'));
  const bodyPath = path.join(workdir, 'body');
  const headerPath = path.join(workdir, 'headers');

  try {
    await execFileAsync(
      process.env.VERCEL_BIN || 'vercel',
      [
        'curl',
        relative,
        '--deployment',
        base.origin,
        '--yes',
        '--',
        '--header',
        'x-vercel-skip-toolbar: 1',
        '--silent',
        '--show-error',
        '--max-time',
        String(Math.max(1, Math.ceil(options.timeoutMs / 1000))),
        '--output',
        bodyPath,
        '--dump-header',
        headerPath,
      ],
      {
        timeout: options.timeoutMs + 20_000,
        maxBuffer: MAX_BODY_BYTES,
        env: { ...process.env, NO_COLOR: '1', VERCEL_TELEMETRY_DISABLED: '1' },
      },
    );
    const [body, headers] = await Promise.all([readFile(bodyPath), readFile(headerPath, 'utf8')]);
    if (body.byteLength > MAX_BODY_BYTES) throw new Error('response body too large');
    return parseCurlResponse(headers, body);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error('the vercel CLI was not found on PATH (needed for --vercel-curl)');
    }
    const detail = String(error?.stderr || error?.message || 'vercel curl failed')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-2)
      .join(' · ')
      .slice(0, 200);
    throw new Error(`vercel curl failed for ${redactUrl(target.href)}: ${detail}`);
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

const header = (response, name) => (response.headers.get(name) ?? '').trim();
const majorType = (value) => (value.split(';')[0] ?? '').trim().toLowerCase();
const isJsonType = (value) => /(application|text)\/([\w.+-]*\+)?json/.test(majorType(value));
const isHtmlType = (value) => majorType(value) === 'text/html';
const isScriptType = (value) => /(javascript|ecmascript)/.test(majorType(value));
const isImageType = (value) => majorType(value).startsWith('image/');
const isCssType = (value) => majorType(value) === 'text/css';
const isScriptFamily = (value) => /(javascript|ecmascript)/.test(majorType(value));

/**
 * Hosts legitimately normalize a few MIME types (`text/javascript` →
 * `application/javascript`), which the service worker does not care about: it
 * verifies size and SHA-256. Treat equivalent families as compatible.
 */
function typesCompatible(declared, served) {
  if (!declared || !served) return true;
  if (declared === served) return true;
  if (isScriptFamily(declared) && isScriptFamily(served)) return true;
  if (isJsonType(declared) && isJsonType(served)) return true;
  return false;
}

/** Runs `worker` over `items` with a small concurrency pool, preserving order. */
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

/* ------------------------------------------------------------------------- */
/* Minimal HTML helpers (no DOM dependency)                                  */
/* ------------------------------------------------------------------------- */

function attributes(source) {
  const map = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+))/g;
  for (const match of source.matchAll(pattern)) {
    map[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return map;
}

function tags(html, name) {
  const pattern = new RegExp(`<${name}\\b([^>]*)>`, 'gi');
  return Array.from(html.matchAll(pattern), (match) => attributes(match[1]));
}

function firstTag(html, name, predicate) {
  return tags(html, name).find((tag) => predicate(tag)) ?? null;
}

function textOf(html, name) {
  const pattern = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i');
  return (pattern.exec(html)?.[1] ?? '').replace(/<[^>]+>/g, '').trim();
}

function pngSize(buffer) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/* ------------------------------------------------------------------------- */
/* Report                                                                    */
/* ------------------------------------------------------------------------- */

function createReport(baseUrl, options) {
  const checks = [];
  const record = (id, status, detail) => {
    checks.push({ id, status, detail: String(detail ?? '').slice(0, 300) });
    return status === 'pass';
  };
  return {
    target: redactUrl(baseUrl.href),
    strict: options.strict,
    checks,
    pass: (id, detail) => record(id, 'pass', detail),
    fail: (id, detail) => record(id, 'fail', detail),
    /** Fails under --strict, warns otherwise. */
    soft: (id, detail) => record(id, options.strict ? 'fail' : 'warn', detail),
    totals() {
      return checks.reduce(
        (acc, check) => ({ ...acc, [check.status]: acc[check.status] + 1 }),
        { pass: 0, warn: 0, fail: 0 },
      );
    },
  };
}

/** True when the response is a Vercel Deployment Protection challenge. */
function isProtectionPage(response, base) {
  if (response.status === 401 || response.status === 403) return true;
  try {
    if (response.finalUrl && new URL(response.finalUrl).origin !== base.origin) return true;
  } catch {
    /* ignore malformed final URLs */
  }
  const body = response.body.toString('utf8', 0, 4096);
  return /protected by vercel authentication/i.test(body);
}

class Smoke {
  constructor(baseUrl, options, report) {
    this.base = baseUrl;
    this.options = options;
    this.report = report;
    this.shell = null;
    this.manifest = null;
    this.blocked = false;
    this.cache = new Map();
    // Spawning the CLI per request is slow and noisy: keep it sequential-ish.
    this.concurrency = options.via === 'vercel-curl' ? 2 : CONCURRENCY;
  }

  resolve(pathOrUrl) {
    return new URL(pathOrUrl, this.base);
  }

  /** Memoised GET: the same URL is checked once per run. */
  async get(url) {
    const href = new URL(url).href;
    if (!this.cache.has(href)) {
      const pending = this.dispatch(href);
      this.cache.set(href, pending);
      pending.catch(() => this.cache.delete(href));
    }
    return this.cache.get(href);
  }

  async dispatch(href) {
    let lastError = null;
    for (let attempt = 0; attempt <= this.options.retries; attempt += 1) {
      try {
        const response =
          this.options.via === 'vercel-curl'
            ? await vercelCurlRequest(href, this.base, this.options)
            : await httpRequest(href, this.options);
        if (response.status >= 500 && attempt < this.options.retries) {
          await sleep(300 * (attempt + 1));
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < this.options.retries) await sleep(300 * (attempt + 1));
      }
    }
    throw lastError ?? new Error('request failed');
  }
}

/* ------------------------------------------------------------------------- */
/* Checks                                                                    */
/* ------------------------------------------------------------------------- */

async function checkShell(smoke) {
  const { report, base } = smoke;
  let response;
  try {
    response = await smoke.get(base);
  } catch (error) {
    report.fail('shell.root', `request failed: ${error.message}`);
    return;
  }
  if (response.status !== 200) {
    report.fail('shell.root', `GET / returned HTTP ${response.status}`);
    return;
  }

  if (isProtectionPage(response, base)) {
    report.fail(
      'shell.protected',
      'deployment is behind Vercel Authentication; rerun with --vercel-curl (no token needed)',
    );
    smoke.blocked = true;
    return;
  }

  report.pass('shell.root', `200 ${majorType(header(response, 'content-type')) || 'no content-type'}`);

  const contentType = header(response, 'content-type');
  if (!isHtmlType(contentType)) {
    report.fail('shell.content-type', `expected text/html, received "${majorType(contentType) || 'none'}"`);
    return;
  }
  report.pass('shell.content-type', contentType);

  const html = response.body.toString('utf8');
  smoke.shell = html;

  const htmlTag = firstTag(html, 'html', () => true);
  if (!htmlTag?.lang) report.soft('shell.lang', 'html element is missing a lang attribute');
  else report.pass('shell.lang', htmlTag.lang);

  const title = textOf(html, 'title');
  if (!title) report.fail('shell.title', 'empty or missing <title>');
  else report.pass('shell.title', title);

  if (!/\bid\s*=\s*["']app["']/.test(html)) {
    report.fail('shell.app-mount', 'missing the #app mount point');
  } else {
    report.pass('shell.app-mount', '#app present');
  }

  const themeColor = firstTag(html, 'meta', (tag) => tag.name === 'theme-color');
  if (!themeColor?.content) report.soft('shell.theme-color', 'missing <meta name="theme-color">');
  else report.pass('shell.theme-color', themeColor.content);

  const manifestLink = firstTag(html, 'link', (tag) => (tag.rel ?? '').split(/\s+/).includes('manifest'));
  if (!manifestLink?.href) {
    report.fail('shell.manifest-link', 'index.html does not link a web app manifest');
  } else {
    smoke.manifestHref = manifestLink.href;
    report.pass('shell.manifest-link', manifestLink.href);
  }

  const scripts = tags(html, 'script')
    .filter((tag) => tag.src)
    .map((tag) => ({ src: tag.src, module: tag.type === 'module' }));
  const moduleScripts = scripts.filter((script) => script.module);
  if (moduleScripts.length === 0) {
    report.fail('shell.module-script', 'no <script type="module"> found in the shell');
  }
  const stylesheets = tags(html, 'link')
    .filter((tag) => (tag.rel ?? '').toLowerCase() === 'stylesheet' && tag.href)
    .map((tag) => tag.href);
  if (stylesheets.length === 0) report.soft('shell.stylesheet', 'no stylesheet link found in the shell');

  const referenced = [...moduleScripts, ...stylesheets.map((href) => ({ src: href, module: false }))];
  const results = await mapLimit(referenced, smoke.concurrency, async (asset) => {
    try {
      const assetResponse = await smoke.get(smoke.resolve(asset.src));
      return {
        ...asset,
        status: assetResponse.status,
        type: header(assetResponse, 'content-type'),
        size: assetResponse.body.byteLength,
      };
    } catch (error) {
      return { ...asset, status: 0, type: '', size: 0, error: error.message };
    }
  });

  for (const asset of results) {
    const label = asset.src.replace(/^\.?\//, '/');
    if (asset.status !== 200 || asset.size === 0) {
      report.fail('shell.assets', `${label} → HTTP ${asset.status || asset.error || 'error'}`);
      continue;
    }
    if (asset.module && !isScriptType(asset.type)) {
      report.fail('shell.assets', `${label} served as "${majorType(asset.type) || 'none'}" instead of JavaScript`);
      continue;
    }
    if (!asset.module && !isCssType(asset.type)) {
      report.fail('shell.assets', `${label} served as "${majorType(asset.type) || 'none'}" instead of CSS`);
      continue;
    }
    report.pass('shell.assets', `${label} 200 ${majorType(asset.type)} ${asset.size}B`);
  }
}

async function checkManifest(smoke) {
  const { report } = smoke;
  const target = smoke.resolve(smoke.manifestHref ?? 'manifest.webmanifest');
  let response;
  try {
    response = await smoke.get(target);
  } catch (error) {
    report.fail('manifest.fetch', `request failed: ${error.message}`);
    return;
  }
  if (response.status !== 200) {
    report.fail('manifest.fetch', `GET ${target.pathname} returned HTTP ${response.status}`);
    return;
  }
  report.pass('manifest.fetch', `200 ${majorType(header(response, 'content-type'))}`);

  const contentType = header(response, 'content-type');
  if (!isJsonType(contentType)) {
    report.soft('manifest.content-type', `expected JSON, received "${majorType(contentType) || 'none'}"`);
  }

  let manifest;
  try {
    manifest = JSON.parse(response.body.toString('utf8'));
  } catch {
    report.fail('manifest.json', 'body is not valid JSON');
    return;
  }
  smoke.webManifest = manifest;
  report.pass('manifest.json', 'valid JSON');

  for (const field of ['name', 'short_name', 'start_url', 'scope', 'display']) {
    if (!manifest[field] || typeof manifest[field] !== 'string') {
      report.fail(`manifest.${field}`, `missing or non-string "${field}"`);
    } else {
      report.pass(`manifest.${field}`, manifest[field]);
    }
  }

  if (manifest.display && !['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display)) {
    report.soft('manifest.display-mode', `"${manifest.display}" is not installable-friendly`);
  }
  for (const field of ['start_url', 'scope']) {
    if (typeof manifest[field] !== 'string') continue;
    try {
      const resolved = new URL(manifest[field], target);
      if (resolved.origin !== target.origin) {
        report.fail(`manifest.${field}-origin`, `${field} points outside the deployment origin`);
      }
    } catch {
      report.fail(`manifest.${field}-url`, `${field} is not a resolvable URL`);
    }
  }

  const icons = Array.isArray(manifest.icons) ? manifest.icons.filter((icon) => icon?.src) : [];
  if (icons.length === 0) {
    report.fail('manifest.icons', 'no icons declared');
    return;
  }
  report.pass('manifest.icons', `${icons.length} declared`);

  const results = await mapLimit(icons, smoke.concurrency, async (icon) => {
    const url = new URL(icon.src, target);
    try {
      const iconResponse = await smoke.get(url);
      return {
        icon,
        status: iconResponse.status,
        type: header(iconResponse, 'content-type'),
        body: iconResponse.body,
      };
    } catch (error) {
      return { icon, status: 0, type: '', body: Buffer.alloc(0), error: error.message };
    }
  });

  for (const { icon, status, type, body, error } of results) {
    const label = String(icon.src).replace(/^\.?\//, '/');
    if (status !== 200) {
      report.fail('manifest.icon', `${label} → HTTP ${status || error || 'error'}`);
      continue;
    }
    if (!isImageType(type)) {
      report.fail('manifest.icon', `${label} served as "${majorType(type) || 'none'}" instead of an image`);
      continue;
    }
    const size = pngSize(body);
    if (size && typeof icon.sizes === 'string') {
      const declared = icon.sizes.match(/^(\d+)x(\d+)$/);
      if (declared && (Number(declared[1]) !== size.width || Number(declared[2]) !== size.height)) {
        report.fail(
          'manifest.icon',
          `${label} declares ${icon.sizes} but the file is ${size.width}x${size.height}`,
        );
        continue;
      }
    }
    if (body.byteLength === 0) {
      report.fail('manifest.icon', `${label} returned an empty body`);
      continue;
    }
    report.pass('manifest.icon', `${label} 200 ${majorType(type)} ${body.byteLength}B`);
  }

  const maskable = icons.filter((icon) => String(icon.purpose ?? '').includes('maskable'));
  if (maskable.length === 0) report.soft('manifest.maskable', 'no maskable icon declared');
}

async function checkServiceWorker(smoke) {
  const { report } = smoke;
  const target = smoke.resolve('sw.js');
  let response;
  try {
    response = await smoke.get(target);
  } catch (error) {
    report.fail('sw.fetch', `request failed: ${error.message}`);
    return;
  }
  if (response.status !== 200) {
    report.fail('sw.fetch', `GET /sw.js returned HTTP ${response.status}`);
    return;
  }
  report.pass('sw.fetch', `200 ${response.body.byteLength}B`);

  const contentType = header(response, 'content-type');
  if (!isScriptType(contentType)) {
    report.fail('sw.content-type', `expected JavaScript, received "${majorType(contentType) || 'none'}"`);
  } else {
    report.pass('sw.content-type', contentType);
  }

  const source = response.body.toString('utf8');
  const version = /const\s+BUILD_VERSION\s*=\s*['"]([^'"]*)['"]/.exec(source)?.[1] ?? '';
  if (!version) {
    report.fail('sw.version', 'BUILD_VERSION declaration not found');
  } else if (version === SW_VERSION_TOKEN) {
    report.fail('sw.stamped', 'service worker was served unstamped (build-offline step did not run)');
  } else {
    report.pass('sw.stamped', 'no build placeholder');
    report.pass('sw.version', version);
  }
  smoke.swVersion = version === SW_VERSION_TOKEN ? '' : version;

  const cacheControl = header(response, 'cache-control');
  if (/no-store|no-cache|max-age=0/i.test(cacheControl)) {
    report.pass('sw.cache-control', cacheControl);
  } else {
    report.soft('sw.cache-control', `service worker is cacheable: "${cacheControl || 'no cache-control header'}"`);
  }

  const scope = header(response, 'service-worker-allowed');
  if (scope) report.pass('sw.scope-header', scope);
  else report.soft('sw.scope-header', 'Service-Worker-Allowed header is missing (defaults to /sw.js directory)');
}

async function checkOfflineManifest(smoke) {
  const { report } = smoke;
  const target = smoke.resolve('offline-manifest.json');
  let response;
  try {
    response = await smoke.get(target);
  } catch (error) {
    report.fail('offline.fetch', `request failed: ${error.message}`);
    return;
  }
  if (response.status !== 200) {
    report.fail('offline.fetch', `GET /offline-manifest.json returned HTTP ${response.status}`);
    return;
  }
  report.pass('offline.fetch', `200 ${response.body.byteLength}B`);

  const contentType = header(response, 'content-type');
  if (!isJsonType(contentType)) {
    report.soft('offline.content-type', `expected JSON, received "${majorType(contentType) || 'none'}"`);
  }

  let manifest;
  try {
    manifest = JSON.parse(response.body.toString('utf8'));
  } catch {
    report.fail('offline.json', 'body is not valid JSON');
    return;
  }
  report.pass('offline.json', 'valid JSON');

  if (manifest.schemaVersion !== 1) {
    report.soft('offline.schema', `unexpected schemaVersion "${manifest.schemaVersion}"`);
  } else {
    report.pass('offline.schema', 'schemaVersion 1');
  }

  if (!manifest.version || !/^[0-9a-f]{8,}$/i.test(String(manifest.version))) {
    report.fail('offline.version', `invalid version "${manifest.version ?? ''}"`);
  } else {
    report.pass('offline.version', manifest.version);
  }
  if (smoke.swVersion && manifest.version && manifest.version !== smoke.swVersion) {
    report.fail(
      'offline.version-match',
      `offline manifest ${manifest.version} != service worker ${smoke.swVersion}`,
    );
  } else if (smoke.swVersion) {
    report.pass('offline.version-match', 'service worker and offline manifest agree');
  }

  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  if (entries.length === 0) {
    report.fail('offline.entries', 'no precache entries');
    return;
  }
  report.pass('offline.entries', `${entries.length} precache entries`);

  const malformed = entries.filter(
    (entry) =>
      !entry ||
      typeof entry.url !== 'string' ||
      typeof entry.size !== 'number' ||
      entry.size <= 0 ||
      !/^[0-9a-f]{64}$/i.test(String(entry.hash ?? '')),
  );
  if (malformed.length > 0) {
    report.fail('offline.entries-shape', `${malformed.length} entr${malformed.length === 1 ? 'y' : 'ies'} missing url/size/hash`);
  } else {
    report.pass('offline.entries-shape', 'every entry has url, size and sha256');
  }

  const urls = entries.map((entry) => String(entry?.url ?? ''));
  if (!urls.some((url) => url.endsWith('index.html'))) {
    report.fail('offline.shell', 'index.html is not precached');
  } else {
    report.pass('offline.shell', 'index.html precached');
  }
  if (!urls.some((url) => url.endsWith('.js'))) {
    report.fail('offline.js', 'no JavaScript chunk is precached; the app cannot boot offline');
  } else {
    report.pass('offline.js', 'JavaScript chunks precached');
  }

  const results = await mapLimit(entries.filter((entry) => entry?.url), smoke.concurrency, async (entry) => {
    const url = smoke.resolve(entry.url);
    try {
      const entryResponse = await smoke.get(url);
      return {
        entry,
        status: entryResponse.status,
        type: header(entryResponse, 'content-type'),
        body: entryResponse.body,
      };
    } catch (error) {
      return { entry, status: 0, type: '', body: Buffer.alloc(0), error: error.message };
    }
  });

  for (const { entry, status, type, body, error } of results) {
    const label = String(entry.url);
    if (status !== 200) {
      report.fail('offline.entry', `${label} → HTTP ${status || error || 'error'}`);
      continue;
    }
    if (body.byteLength !== entry.size) {
      const injected = /<script[^>]+src="https?:\/\/vercel\.live\//.test(body.toString('utf8', 0, 4096));
      report.fail(
        'offline.entry',
        `${label} size ${body.byteLength}B != manifest ${entry.size}B${
          injected ? ' (host injected a script, e.g. the Vercel preview toolbar)' : ''
        }`,
      );
      continue;
    }
    if (smoke.options.verifyHash) {
      const digest = createHash('sha256').update(body).digest('hex');
      if (digest !== String(entry.hash).toLowerCase()) {
        report.fail('offline.entry', `${label} sha256 mismatch (deployment is stale or dirty)`);
        continue;
      }
    }
    const declared = majorType(entry.type ?? '');
    const served = majorType(type);
    if (!typesCompatible(declared, served)) {
      report.soft('offline.entry-type', `${label} declared "${declared}" but served "${served}"`);
    }
    report.pass('offline.entry', `${label} 200 ${body.byteLength}B`);
  }
}

async function checkStaticAssets(smoke) {
  const { report } = smoke;
  const html = smoke.shell ?? '';

  const assetHrefs = [
    ...tags(html, 'script').map((tag) => tag.src),
    ...tags(html, 'link').map((tag) => tag.href),
  ].filter((href) => typeof href === 'string' && /\/assets\/[^/]+\.(js|css|mjs)$/.test(href));

  const unique = [...new Set(assetHrefs)];
  for (const href of unique) {
    const url = smoke.resolve(href);
    let response;
    try {
      response = await smoke.get(url);
    } catch (error) {
      report.fail('assets.hash', `${url.pathname} request failed: ${error.message}`);
      continue;
    }
    if (response.status !== 200) {
      report.fail('assets.hash', `${url.pathname} → HTTP ${response.status}`);
      continue;
    }
    const cacheControl = header(response, 'cache-control');
    if (/immutable/.test(cacheControl) && /max-age=\d+/.test(cacheControl)) {
      report.pass('assets.cache', `${url.pathname} → ${cacheControl}`);
    } else {
      report.soft(
        'assets.cache',
        `${url.pathname} is not immutable: "${cacheControl || 'no cache-control header'}"`,
      );
    }
  }

  const iconTarget = smoke.resolve('icons/icon-192.png');
  try {
    const iconResponse = await smoke.get(iconTarget);
    if (iconResponse.status !== 200) {
      report.fail('assets.icon', `/icons/icon-192.png → HTTP ${iconResponse.status}`);
    } else if (!pngSize(iconResponse.body)) {
      report.fail('assets.icon', '/icons/icon-192.png is not a valid PNG');
    } else {
      report.pass('assets.icon', `/icons/icon-192.png 200 ${iconResponse.body.byteLength}B`);
    }
    const iconCache = header(iconResponse, 'cache-control');
    if (iconResponse.status === 200) {
      if (/max-age=\d+/.test(iconCache) && !/no-store/.test(iconCache)) {
        report.pass('assets.icon-cache', iconCache);
      } else {
        report.soft('assets.icon-cache', `icon caching not set: "${iconCache || 'no cache-control header'}"`);
      }
    }
  } catch (error) {
    report.fail('assets.icon', `request failed: ${error.message}`);
  }

  const missing = smoke.resolve(`assets/__smoke_missing_${Date.now().toString(36)}.js`);
  try {
    const missingResponse = await smoke.get(missing);
    const servedHtml = isHtmlType(header(missingResponse, 'content-type'));
    if (missingResponse.status === 200 && servedHtml) {
      // `vite preview` answers unknown files with the SPA shell; a real host must not.
      report.soft('assets.404', 'missing /assets/* file was answered with the HTML shell');
    } else if (missingResponse.status === 404) {
      report.pass('assets.404', '404 for a missing asset');
    } else {
      report.soft('assets.404', `missing asset returned HTTP ${missingResponse.status} (expected 404)`);
    }
  } catch (error) {
    report.soft('assets.404', `missing asset check failed: ${error.message}`);
  }
}

async function checkSpaFallback(smoke) {
  const { report } = smoke;
  const deepLink = smoke.resolve('drawing/42');
  try {
    const response = await smoke.get(deepLink);
    if (response.status !== 200) {
      report.fail('spa.deep-link', `/drawing/42 returned HTTP ${response.status}`);
      return;
    }
    if (!isHtmlType(header(response, 'content-type')) || !/\bid\s*=\s*["']app["']/.test(response.body.toString('utf8'))) {
      report.fail('spa.deep-link', '/drawing/42 did not return the app shell');
      return;
    }
    report.pass('spa.deep-link', '/drawing/42 returns the app shell');
  } catch (error) {
    report.fail('spa.deep-link', `request failed: ${error.message}`);
  }
}

/* ------------------------------------------------------------------------- */
/* Runner                                                                    */
/* ------------------------------------------------------------------------- */

export async function runSmokeCheck(rawUrl, overrides = {}) {
  const options = {
    strict: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retries: DEFAULT_RETRIES,
    verifyHash: true,
    checkSpa: true,
    ...overrides,
  };
  const base = normalizeBaseUrl(rawUrl);
  const report = createReport(base, options);
  const smoke = new Smoke(base, options, report);

  await checkShell(smoke);
  if (smoke.blocked) {
    const totals = report.totals();
    return {
      ok: false,
      target: report.target,
      strict: options.strict,
      ...totals,
      checks: report.checks,
    };
  }
  await checkManifest(smoke);
  await checkServiceWorker(smoke);
  await checkOfflineManifest(smoke);
  await checkStaticAssets(smoke);
  if (options.checkSpa) await checkSpaFallback(smoke);

  const totals = report.totals();
  return {
    ok: totals.fail === 0,
    target: report.target,
    strict: options.strict,
    ...totals,
    checks: report.checks,
  };
}

function printHuman(result, options) {
  const lines = [];
  lines.push(`coloring production smoke · ${result.target}${result.strict ? ' · strict' : ''}`);
  for (const check of result.checks) {
    if (options.quiet && check.status === 'pass') continue;
    const label = check.status === 'pass' ? 'PASS' : check.status === 'warn' ? 'WARN' : 'FAIL';
    lines.push(`  ${label.padEnd(4)} ${check.id.padEnd(24)} ${check.detail}`);
  }
  lines.push('');
  lines.push(`summary: ${result.pass} pass · ${result.warn} warn · ${result.fail} fail`);
  lines.push(result.ok ? 'RESULT: healthy' : 'RESULT: FAILED');
  return lines.join('\n');
}

async function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`production-smoke: ${error.message}`);
    console.error(usage());
    return 2;
  }

  if (options.help) {
    console.log(usage());
    return 0;
  }

  let result;
  try {
    result = await runSmokeCheck(options.url, options);
  } catch (error) {
    console.error(`production-smoke: ${error.message}`);
    if (!options.url) console.error(usage());
    return 2;
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(printHuman(result, options));
  }
  return result.ok ? 0 : 1;
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  process.exitCode = await main(process.argv.slice(2));
}

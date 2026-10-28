import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import { promisify } from 'node:util';

import { buildSite, serve } from './fixtures.mjs';

const run = promisify(execFile);
const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const SCRIPT = path.join(REPO_ROOT, 'scripts/production-smoke.mjs');
const DIST = path.join(REPO_ROOT, 'dist');
const SECRET = 'smoke-secret-token-2f7c1a';

/** Runs the smoke script and never throws on a non-zero exit code. */
async function smoke(args, extraEnv = {}) {
  const env = { ...process.env };
  delete env.PRODUCTION_SMOKE_URL;
  Object.assign(env, extraEnv);
  try {
    const { stdout, stderr } = await run(process.execPath, [SCRIPT, ...args], { env, timeout: 60_000 });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

/** Runs with `--json` and returns the parsed report. */
async function smokeJson(args) {
  const result = await smoke([...args, '--json']);
  return { ...result, report: JSON.parse(result.stdout) };
}

const statuses = (report, id) => report.checks.filter((check) => check.id === id).map((check) => check.status);

describe('production smoke against a healthy simulated deployment', () => {
  let site;
  let server;

  beforeEach(async () => {
    site = await buildSite();
    server = await serve(site.dir, { headers: true });
  });

  afterEach(async () => {
    await server.close();
    await rm(site.dir, { recursive: true, force: true });
  });

  it('passes every check under --strict and exits with 0', async () => {
    const { code, report } = await smokeJson([server.origin, '--strict']);

    assert.equal(code, 0);
    assert.equal(report.ok, true);
    assert.equal(report.fail, 0);
    assert.equal(report.warn, 0);
    assert.equal(report.strict, true);

    const ids = new Set(report.checks.map((check) => check.id));
    for (const id of [
      'shell.root',
      'shell.app-mount',
      'manifest.icons',
      'sw.version',
      'sw.cache-control',
      'offline.version-match',
      'offline.entry',
      'assets.cache',
      'assets.404',
      'spa.deep-link',
    ]) {
      assert.ok(ids.has(id), `report is missing the "${id}" check`);
    }

    // Every precache entry (9 files in the fixture) is fetched and verified.
    assert.equal(statuses(report, 'offline.entry').length, site.offlineManifest.entries.length);
    assert.ok(statuses(report, 'offline.entry').every((status) => status === 'pass'));
  });

  it('prints a human-readable summary with the target and totals', async () => {
    const { code, stdout } = await smoke([server.origin]);

    assert.equal(code, 0);
    assert.match(stdout, /coloring production smoke · http:\/\/127\.0\.0\.1:\d+\//);
    assert.match(stdout, /summary: \d+ pass · 0 warn · 0 fail/);
    assert.match(stdout, /RESULT: healthy/);
  });

  it('fails when a precached asset no longer matches the manifest hash', async () => {
    const asset = path.join(site.dir, 'assets/index-Smoke01.js');
    const original = await readFile(asset);
    // Same byte length, different content: only the SHA-256 check can catch it.
    await writeFile(asset, Buffer.from(original.toString('utf8').replace('rabisco', 'RABISCO')));

    const { code, report } = await smokeJson([server.origin]);

    assert.equal(code, 1);
    assert.equal(report.ok, false);
    assert.match(
      report.checks.find((check) => check.id === 'offline.entry' && check.status === 'fail').detail,
      /sha256 mismatch/,
    );
  });

  it('fails when an icon declared in the manifest is missing', async () => {
    await rm(path.join(site.dir, 'icons/icon-512.png'));

    const { code, report } = await smokeJson([server.origin]);

    assert.equal(code, 1);
    assert.ok(
      report.checks.some(
        (check) => check.id === 'manifest.icon' && check.status === 'fail' && /icon-512\.png/.test(check.detail),
      ),
    );
  });

  it('fails when the offline manifest is missing', async () => {
    await rm(path.join(site.dir, 'offline-manifest.json'));

    const { code, report } = await smokeJson([server.origin]);

    assert.equal(code, 1);
    assert.ok(
      report.checks.some((check) => check.id === 'offline.fetch' && check.status === 'fail' && /404/.test(check.detail)),
    );
  });

  it('fails when the service worker was shipped unstamped', async () => {
    const unstamped = await buildSite({ stampServiceWorker: false });
    const unstampedServer = await serve(unstamped.dir, { headers: true });
    try {
      const { code, report } = await smokeJson([unstampedServer.origin]);

      assert.equal(code, 1);
      assert.ok(
        report.checks.some((check) => check.id === 'sw.stamped' && /unstamped/.test(check.detail)),
      );
    } finally {
      await unstampedServer.close();
      await rm(unstamped.dir, { recursive: true, force: true });
    }
  });

  it('fails when the service worker and offline manifest disagree on the version', async () => {
    const manifestPath = path.join(site.dir, 'offline-manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.version = 'deadbeefdeadbeef';
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const { code, report } = await smokeJson([server.origin]);

    assert.equal(code, 1);
    assert.ok(report.checks.some((check) => check.id === 'offline.version-match' && check.status === 'fail'));
  });

  it('never echoes a token from the deployment URL', async () => {
    const { code, stdout, stderr, report } = await smokeJson([`${server.origin}/?token=${SECRET}&sig=abc`]);

    assert.equal(code, 0);
    assert.ok(!stdout.includes(SECRET), 'stdout leaked the URL token');
    assert.ok(!stderr.includes(SECRET), 'stderr leaked the URL token');
    assert.ok(!JSON.stringify(report).includes(SECRET), 'JSON report leaked the URL token');
    assert.equal(report.target, `${server.origin}/`);
  });

  it('counts every precache entry request against the deployment', async () => {
    await smoke([server.origin]);

    for (const url of ['/sw.js', '/offline-manifest.json', '/manifest.webmanifest', '/assets/index-Smoke01.js']) {
      assert.ok(server.requests.includes(url), `expected a request for ${url}`);
    }
  });
});

describe('production smoke without production cache headers (vite preview shape)', () => {
  let site;
  let server;

  beforeEach(async () => {
    site = await buildSite();
    server = await serve(site.dir, { headers: false });
  });

  afterEach(async () => {
    await server.close();
    await rm(site.dir, { recursive: true, force: true });
  });

  it('warns but exits 0, and renders those warnings as failures under --strict', async () => {
    const lenient = await smokeJson([server.origin]);
    assert.equal(lenient.code, 0);
    assert.equal(lenient.report.ok, true);
    assert.equal(lenient.report.fail, 0);
    assert.ok(lenient.report.warn > 0);
    const warned = new Set(lenient.report.checks.filter((c) => c.status === 'warn').map((c) => c.id));
    assert.ok(warned.has('assets.cache'));
    assert.ok(warned.has('sw.scope-header'));

    const strict = await smokeJson([server.origin, '--strict']);
    assert.equal(strict.code, 1);
    assert.equal(strict.report.warn, 0);
    assert.ok(strict.report.fail > 0);
  });
});

const DIST_INDEX = path.join(DIST, 'index.html');
const hasDist = await stat(DIST_INDEX).then(
  () => true,
  () => false,
);

describe('production smoke on the real build output', () => {
  it(
    'verifies dist/ hashes, worker stamp and assets end to end',
    { skip: hasDist ? false : 'dist/ is not built (run: npm run build)' },
    async () => {
      const server = await serve(DIST, { headers: true });
      try {
        const { code, report } = await smokeJson([server.origin, '--strict']);

        assert.equal(report.fail, 0, JSON.stringify(report.checks.filter((c) => c.status === 'fail'), null, 2));
        assert.equal(code, 0);
        assert.ok(report.pass >= 40, `expected a broad check run, got ${report.pass}`);
      } finally {
        await server.close();
      }
    },
  );
});

describe('production smoke CLI contract', () => {
  it('exits with 2 and prints usage when no URL is given', async () => {
    const { code, stderr } = await smoke([]);

    assert.equal(code, 2);
    assert.match(stderr, /deployment URL is required/);
    assert.match(stderr, /Options/);
  });

  it('exits with 2 for an invalid URL', async () => {
    const { code, stderr } = await smoke(['ftp://example.com']);

    assert.equal(code, 2);
    assert.match(stderr, /must use http or https/);
  });

  it('reads the deployment URL from PRODUCTION_SMOKE_URL', async () => {
    const { code, stderr } = await smoke(['--json'], {
      PRODUCTION_SMOKE_URL: 'http://127.0.0.1:1',
    });

    // Port 1 refuses connections: the run reaches the checks and fails, proving
    // the environment variable was honoured instead of the usage error.
    assert.equal(code, 1);
    assert.match(stderr, /^$/);
  });
});

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);
const SCENARIO = path.resolve(import.meta.dirname, 'client-scenario.mjs');
const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

async function scenario(name) {
  const { stdout } = await run(process.execPath, [SCENARIO, name], { cwd: REPO_ROOT, timeout: 10000 });
  const result = JSON.parse(stdout.trim());
  assert.ok(result.state, `${name} did not publish an offline state`);
  return result;
}

describe('registerOffline client contract', () => {
  it('reports ready only after a correlated verify reply confirms the cache', async () => {
    const result = await scenario('ready');
    assert.deepEqual(result.state, { ready: true, online: true });
    assert.deepEqual(result.messages.map((message) => message.type), ['VERIFY_OFFLINE']);
    assert.ok(result.messages[0].requestId, 'every request must carry a correlation id');
    assert.equal(result.registerCalls, 1);
  });

  it('keeps ready false when the worker reports an incomplete precache', async () => {
    const result = await scenario('not-ready');
    assert.deepEqual(result.state, { ready: false, online: true, error: 'precache-incomplete' });
  });

  it('ignores replies with a stale correlation id and times out truthfully', async () => {
    const result = await scenario('timeout');
    assert.equal(result.state.ready, false);
    assert.equal(result.state.error, 'verify-timeout');
    assert.ok(result.messages.some((message) => message.type === 'VERIFY_OFFLINE'));
  });

  it('prepares the cache through PREPARE_OFFLINE and then verifies readiness', async () => {
    const result = await scenario('prepare');
    assert.deepEqual(
      result.messages.map((message) => message.type),
      ['VERIFY_OFFLINE', 'PREPARE_OFFLINE'],
    );
    assert.equal(result.prepareCalls, 1);
    assert.deepEqual(result.state, { ready: true, online: true });
  });

  it('degrades truthfully when service workers are unsupported', async () => {
    const result = await scenario('unsupported');
    assert.deepEqual(result.state, { ready: false, online: true, error: 'service-worker-unsupported' });
    assert.equal(result.registerCalls, 0);
  });

  it('degrades truthfully in an insecure context without registering', async () => {
    const result = await scenario('insecure');
    assert.deepEqual(result.state, { ready: false, online: true, error: 'insecure-context' });
    assert.equal(result.registerCalls, 0);
  });

  it('never reports ready when the worker never activates', async () => {
    const result = await scenario('activation-timeout');
    assert.equal(result.state.ready, false);
    assert.equal(result.state.error, 'activation-timeout');
    assert.equal(result.messages.length, 0, 'no verify request should be sent before activation');
  });

  it('uses the active worker when the page is not yet controlled', async () => {
    const result = await scenario('no-controller');
    assert.deepEqual(result.state, { ready: true, online: true });
    assert.equal(result.registerCalls, 1);
  });

  it('registers at the configured non-root base path', async () => {
    const result = await scenario('base');
    assert.equal(result.registeredWith.scope, '/coloring/');
    assert.match(result.registeredWith.url, /\/coloring\/sw\.js$/);
    assert.deepEqual(result.state, { ready: true, online: true });
  });
});

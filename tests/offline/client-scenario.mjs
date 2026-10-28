/**
 * Runs one offline client scenario in a fresh process so module-level state in
 * src/offline.ts cannot leak between cases. Prints a JSON result on stdout.
 */
const scenario = process.argv[2];
const states = [];
const messages = [];
let registerCalls = 0;
let registeredWith = null;
let updateCalls = 0;
let prepareCalls = 0;
const listeners = new Set();

function dispatch(payload) {
  for (const listener of [...listeners]) listener({ data: payload });
}

function send(payload) {
  setTimeout(() => dispatch(payload), 0);
}

let controller = null;
let registration = null;

const worker = {
  postMessage(message) {
    messages.push({ type: message.type, requestId: message.requestId });
    if (scenario === 'ready' || scenario === 'no-controller' || scenario === 'base') {
      send({ type: 'OFFLINE_STATE', requestId: message.requestId, ready: true, online: true, version: 'test' });
      return;
    }
    if (scenario === 'not-ready') {
      send({
        type: 'OFFLINE_STATE',
        requestId: message.requestId,
        ready: false,
        online: true,
        error: 'precache-incomplete',
        missing: ['/assets/chunk.js'],
      });
      return;
    }
    if (scenario === 'timeout') {
      send({ type: 'OFFLINE_STATE', requestId: 'some-other-request', ready: true, online: true });
      return;
    }
    if (scenario === 'prepare') {
      if (message.type === 'PREPARE_OFFLINE') {
        prepareCalls += 1;
        send({ type: 'OFFLINE_STATE', requestId: message.requestId, ready: true, online: true });
      } else {
        send({
          type: 'OFFLINE_STATE',
          requestId: message.requestId,
          ready: false,
          online: true,
          error: 'precache-incomplete',
        });
      }
      return;
    }
  },
};

registration = {
  active: worker,
  waiting: null,
  installing: null,
  addEventListener() {},
  async update() {
    updateCalls += 1;
  },
};

const serviceWorker = {
  controller: null,
  ready: scenario === 'activation-timeout' ? new Promise(() => {}) : Promise.resolve(registration),
  async register(url, options) {
    registerCalls += 1;
    registeredWith = { url, scope: options?.scope };
    return registration;
  },
  addEventListener(type, listener) {
    if (type === 'message') listeners.add(listener);
  },
  removeEventListener(type, listener) {
    if (type === 'message') listeners.delete(listener);
  },
};

if (scenario !== 'unsupported') {
  controller = worker;
  if (scenario !== 'no-controller') serviceWorker.controller = controller;
}

const navigatorValue = scenario === 'unsupported' ? { onLine: true } : { onLine: true, serviceWorker };
Object.defineProperty(globalThis, 'navigator', { value: navigatorValue, configurable: true });
Object.defineProperty(globalThis, 'isSecureContext', {
  value: scenario !== 'insecure',
  configurable: true,
});

const { registerOffline, prepareOffline, resolveAppBase } = await import('../../src/offline.ts');

const startedAt = Date.now();
await registerOffline((state) => states.push(state), {
  baseUrl: scenario === 'base' ? '/coloring' : '/',
  verifyTimeoutMs: 40,
  activationTimeoutMs: 40,
  prepareTimeoutMs: 40,
  updateCheckMs: 0,
});
if (scenario === 'prepare') await prepareOffline();
await new Promise((resolve) => setTimeout(resolve, 20));

process.stdout.write(
  `${JSON.stringify({
    state: states[states.length - 1] ?? null,
    states,
    messages,
    registerCalls,
    registeredWith,
    updateCalls,
    prepareCalls,
    base: resolveAppBase(),
    elapsedMs: Date.now() - startedAt,
  })}\n`,
);
process.exit(0);

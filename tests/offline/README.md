# Offline / PWA layer

Owned by the offline engineer. Files:

| File | Purpose |
|---|---|
| `src/offline.ts` | `registerOffline()` / `prepareOffline()` client contract |
| `public/sw.js` | versioned, atomic, self-verifying service worker |
| `public/manifest.webmanifest` | installable manifest, `pt-BR`, `standalone` |
| `public/icons/*` | original palette + brush icons (any and maskable, 192/512) |
| `tools/build-offline.mjs` | post-`vite build` manifest, hashes, SW stamping, PWA validation |
| `tests/offline/*` | dependency-free `node:test` unit/integration tests |

No original APK asset, remote CDN, secret or third-party icon is used here.

## Client contract

```ts
import { registerOffline, prepareOffline } from './offline';

void registerOffline((state) => {
  // state: { ready: boolean; online: boolean; error?: string }
  document.documentElement.dataset.offlineReady = String(state.ready);
  document.documentElement.dataset.online = String(state.online);
  if (state.error) console.warn('[offline]', state.error);
});

window.addEventListener('load', () => void prepareOffline(), { once: true });
```

- `ready` becomes `true` only after the worker confirms that every entry in
  `offline-manifest.json` is present in the versioned cache with the expected
  size (and SHA-256 when WebCrypto is available). `navigator.onLine` is not used
  for readiness.
- `online` comes from an actual reachability probe in the worker.
- When service workers cannot run (insecure context, unsupported browser) the
  functions resolve and report `service-worker-unsupported` or `insecure-context`
  in `error`; they never throw or fake readiness.
- `prepareOffline()` asks the active worker to repair/complete its precache and
  re-verify. It is safe to call after first paint and on reconnect.

## Build integration (Tinta / Codex)

1. `package.json` — run the offline step after Vite and add the offline tests:

   ```json
   "scripts": {
     "build": "tsc --noEmit && vite build && node tools/build-offline.mjs",
     "test:offline": "node --test \"tests/offline/**/*.test.mjs\""
   }
   ```

2. `vite.config.ts` — deploy at the root and keep Vite's default public dir so
   `public/sw.js`, `public/manifest.webmanifest` and `public/icons/` are copied:

   ```ts
   export default defineConfig({ base: '/', /* ... */ });
   ```

   If the app is ever mounted below the root, build with
   `node tools/build-offline.mjs --base /sub/` and keep `base` consistent.

3. `index.html` — required tags (all same-origin):

   ```html
   <link rel="manifest" href="/manifest.webmanifest" />
   <meta name="theme-color" content="#123A46" />
   <link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />
   <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
   <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-192.png" />
   <meta name="mobile-web-app-capable" content="yes" />
   <meta name="apple-mobile-web-app-capable" content="yes" />
   <meta name="apple-mobile-web-app-title" content="Coloring" />
   <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
   ```

   `tools/build-offline.mjs` fails the build if the manifest/icons are missing
   or invalid, and warns if `index.html` is not linked to the manifest.

4. `vercel.json` — the worker and its manifest must never be cached as immutable;
   hashed assets can be:

   ```json
   {
     "headers": [
       {
         "source": "/sw.js",
         "headers": [
           { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" },
           { "key": "Service-Worker-Allowed", "value": "/" }
         ]
       },
       {
         "source": "/offline-manifest.json",
         "headers": [
           { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }
         ]
       },
       {
         "source": "/assets/(.*)",
         "headers": [
           { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
         ]
       }
     ]
   }
   ```

   Do not let a catch-all SPA rewrite shadow `/sw.js`,
   `/offline-manifest.json`, `/manifest.webmanifest` or `/icons/*`.

## Commands

```sh
npm run build                 # vite build + node tools/build-offline.mjs
node tools/build-offline.mjs  # same step manually, reads dist/
npm run test:offline          # node --test "tests/offline/**/*.test.mjs"
```

The build step writes `dist/offline-manifest.json`, stamps
`dist/sw.js` with a content hash, and verifies:

- every deployable file is hashed (including all Vite chunks and dependencies);
- `index.html` exists and at least one JS chunk is present;
- the web manifest is valid `pt-BR`/`standalone` with real 192/512 and maskable
  PNG icons whose declared sizes match their bytes;
- the service worker still contains the `BUILD_VERSION` marker.

Sourcemaps, dot directories (`.vite`) and the worker/manifest themselves are
excluded from the precache list.

## Acceptance evidence

1. `npm run build`; `dist/offline-manifest.json` lists every asset and
   `dist/sw.js` contains `const BUILD_VERSION = '<same version>';`.
2. `npm run preview`; Application → Service Workers shows the worker activated.
3. Application → Cache Storage → `coloring-offline-v1-<version>` contains every
   manifest entry plus the `/` and `/index.html` shell aliases.
4. With the page ready, enable Network → Offline and reload a deep link. The app
   must boot from the cache, and IndexedDB paintings must still load.
5. Change and rebuild while online; reload. The worker updates without touching
   IndexedDB, deletes the old version cache, and readiness must be re-verified.
6. Remove one entry from Cache Storage and reload: the UI must not show
   "offline ready"; `prepareOffline()` must repair the cache and only then set
   `ready: true`.

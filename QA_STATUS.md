# QA — estado local verificado em 2026-10-28

| Checagem | Comando/evidência | Resultado |
|---|---|---|
| Unit tests | `npm test` | 61/61 em 9 arquivos |
| Build | `npm run build` | Passou; TypeScript + Vite + offline postprocessor; JS 111.45 kB, CSS 31.07 kB; 9 arquivos offline, 240.4 KiB |
| Offline/PWA | `npm run test:offline` | 43/43 |
| E2E produção local | `E2E_MODE=preview ./node_modules/.bin/playwright test` | 35/35; desktop, tablet landscape, phone portrait, ferramentas, pintura, persistência, rotação, tela cheia e service worker com reload offline real |
| Smoke production checker | `node --test "tests/production/**/*.test.mjs"` | 14/14 |
| Smoke HTTP URL pública existente | `node scripts/production-smoke.mjs --strict --url https://coloring-woad.vercel.app` | 52 pass, 0 warn, 0 fail; bundle é anterior a esta integração |
| Layout web | Capturas nos 4 viewports | Canvas 789/665/323/352 px; overflowX 0 reportado |
| Glitter | Chrome desktop | Máscara sem brilho fora da tinta; undo igual ao snapshot; pincel e balde testados |

## Pendências de homologação

- Repetir teste real de pintura/reabertura offline na URL candidata e na URL de produção nova.
- Capturar a paleta de 40 cores em uso; capturas atuais de layout mostram a paleta anterior.
- Não há screenshot do APK em emulador para comparação visual.
- Após publicação: smoke estrito, E2E da URL, reload frio offline, pintura e retomada via IndexedDB.
- Padrões, spray e variantes de shine não estão implementados.

Resultados 35/35 foram executados no build de produção local, incluindo o teste de service worker. A primeira execução apontou um servidor dev antigo sendo reutilizado; `playwright.config.ts` agora não reutiliza servidores quando gerencia o próprio preview. O botão de tela cheia tem entrada/saída validada no Chromium.

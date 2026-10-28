# Bloqueios e divergências — 2026-10-28

## Bloqueios de release

- Esta integração ainda não foi commitada, enviada ao GitHub ou publicada na Vercel.
- Sem bloqueio técnico local conhecido; próximo gate é preview Vercel e CI após push.
- O smoke de `https://coloring-woad.vercel.app` está saudável, mas mostra bundle antigo. Deve ser repetido após deploy.

## Lacunas de fidelidade/aceite

- Sem screenshots do APK em emulador; layout web paisagem foi aproximado por geometria serializada.
- Padrões, spray e variantes shine do APK não foram reproduzidos; glitter procedural é alternativa original.
- O original não foi observado em portrait; UI portrait é comportamento web próprio.
- O APK/arte extraída não têm licença confirmada para redistribuição; nenhum payload do APK vai ao build.

## Resolvidos em 2026-10-28

- Acesso Maestri, OpenCode/DeepSeek, Git e CLI Vercel confirmados.
- Projeto Vercel correto `coloring` e vínculo GitHub com o repo confirmado.
- Build, 61 unit tests, 43 offline tests, 14 testes do checker e 35 E2E no preview local passaram; teste offline real de pintar e reabrir sem rede confirmado.
- Botão fullscreen passa E2E Chromium; workflow CI configurado para rodar E2E com o build preview.

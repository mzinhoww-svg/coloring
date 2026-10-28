# Publicação — estado em 2026-10-28

- **Repo:** `https://github.com/mzinhoww-svg/coloring`, remoto `origin`, branch ativa `feat/integration`.
- **Base local:** `84d0fb3 feat: deliver Rabisco coloring game web app`; alterações da rodada ainda não commitadas.
- **Vercel:** `coloring`, scope `mzinhoww-gmailcoms-projects`; `vercel project inspect --non-interactive` confirmou o projeto correto, root `.` e runtime Node 24.
- **Git Integration:** vínculo GitHub do projeto com `mzinhoww-svg/coloring`, produção acompanhando `main`, já confirmado anteriormente.
- **Configuração local:** `vercel.json` define Vite, build `npm run build`, saída `dist`, cabeçalhos do SW/manifest/assets e fallback SPA protegido.
- **URL pública existente:** `https://coloring-woad.vercel.app`; smoke estrito passou 52/52, mas o bundle servido é anterior à paleta de 40 cores e às mudanças de layout/glitter desta árvore.
- **Preview/commit desta integração:** nenhum ainda.
- **QA local atual:** 61 unit, 43 offline, build, 14 testes do smoke checker e 35 E2E em `preview` passaram; fullscreen e pintura/reabertura offline cobertos.
- **APK:** artefato debug local já existe; não faz parte deste release web.

## Próximo release

1. Revisão final da árvore e commit/push em `feat/integration`; usar preview criado pela Git Integration.
2. Executar `node scripts/production-smoke.mjs --strict --url <preview>` e E2E com `BASE_URL`.
3. Corrigir findings; só então fast-forward a `main` para produção.
4. Repetir smoke, E2E e reload offline real na URL pública nova; registrar commit e evidências.

Não declarar produção atualizada até que o smoke mostre o bundle desta integração e a aplicação seja exercitada no browser real.

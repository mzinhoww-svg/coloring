# Coloring — plano mestre

Estado: integração local validada; release desta árvore ainda não foi enviada à Vercel. Branch `feat/integration`, base `84d0fb3`, alterações não commitadas.

## Objetivo e restrições

Reconstruir o APK como jogo web mobile-first instalável, offline e com progresso persistente. Repositório: `github.com/mzinhoww-svg/coloring`; projeto Vercel existente: `coloring` em `mzinhoww-gmailcoms-projects`. Codex orquestra; OpenCode Go/DeepSeek executa tarefas técnicas; Lumen/Claude Opus foi autorizado nesta rodada para glitter/layout. Astra permanece preferência para decisões de design. APK e payload de arte/fontes/áudio continuam privados; só publicar código próprio e ativos originais.

## Fases e estado

1. **Descoberta** — concluída: repo, integração Vercel, APK, REA e modelo executor verificados.
2. **Engenharia reversa** — análise estática concluída; runtime limitado, sem screenshot de emulador utilizável.
3. **Especificação/paridade** — matriz atualizada em `FEATURE_PARITY.md`; fatos estáticos separados de inferências e lacunas.
4. **Arquitetura** — Canvas2D escolhido após ensaio de máscara, fill, histórico e snapshot; ver ADR-003.
5. **Jogo** — 9 galerias/141 vetores originais, 40 cores, pintura, fill, undo/redo web, IndexedDB, glitter procedural e layout responsivo implementados.
6. **QA local** — 61 unit, 43 offline, 14 testes do smoke checker, build e 35 E2E passaram no preview local; inclui tela cheia e fluxo real de pintar/reabrir offline em 4 viewports. Smoke HTTP da produção ainda aponta para o bundle antigo.
7. **Publicação** — pendente: commitar/push da branch, revisar preview e publicar no projeto já vinculado.
8. **Aceite** — pendente: E2E e smoke na URL nova, cold reopen offline, pintura/retomada offline e verificação de headers.

## Próxima sequência

1. Revisar diff final e documentos de continuidade; manter artefatos QA gerados fora do commit.
2. Commit e push em `feat/integration`, aguardar preview Git/Vercel.
3. Rodar smoke estrito e E2E no preview; corrigir falhas.
4. Fast-forward para `main` e validar produção com smoke, E2E e offline real.
5. Atualizar `DEPLOYMENT_STATUS.md`, `FEATURE_PARITY.md` e nota conectada Maestri.

A árvore final passou 35/35 E2E, 61/61 unit tests, 43/43 offline tests e 14/14 testes do smoke checker; build produz JS 111.45 kB, CSS 31.07 kB e 9 entradas offline (240.4 KiB). Tela cheia adicionada e testada no Chromium; fluxo offline real passou no preview local. Branch ainda sem commit/deploy.

## Lacunas conhecidas

Padrões, spray e variantes de shine não implementados; não há screenshot do APK em emulador; o layout web é baseado em geometria estática; nenhuma versão desta árvore foi publicada. Documentar essas divergências e não declarar equivalência visual não medida.

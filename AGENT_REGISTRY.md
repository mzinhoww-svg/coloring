# Agentes — Coloring (2026-10-28)

| Agente | Modelo | Escopo | Estado atual | Arquivos/resultado |
|---|---|---|---|---|
| Codex | GPT-6 | Orquestração, revisão, release | Ativo | Coordena `feat/integration` |
| Tinta | OpenCode Go / DeepSeek V4.1 Flash | Engine, UI, conteúdo, unit tests | Concluído nesta rodada | 141 desenhos; engine Canvas2D; paleta e storage |
| Âmbar | OpenCode Go / DeepSeek V4.1 Flash | PWA/offline | Concluído | SW, manifest, icons, build-offline, 43 tests |
| Prisma | OpenCode Go / DeepSeek V4.1 Flash | Reverse engineering e E2E QA | Concluído | E2E 35/35 em build preview após paleta; inclui tela cheia e offline real |
| Lumen | Claude Opus 5.5, effort max | Glitter/layout e integração da paleta | Concluído nesta rodada | 61 unit tests + build; sem commit/deploy |
| Astra | GPT-6 Astra | Design consultivo conforme preferência de Aurimar | Disponível | Nenhum novo desenho nesta rodada |
| Beacon | OpenCode Go / DeepSeek V4.1 Flash | Smoke de produção e teste offline E2E | Concluído | `scripts/production-smoke.mjs`; `tests/e2e/offline.spec.ts` passou em preview |
| Forge | OpenCode Go / DeepSeek V4.1 Flash | Release engineering | Disponível | Preview/deploy após revisão local |

DeepSeek segue como executor técnico principal; a participação de Claude/Opus nesta rodada foi autorizada por Aurimar para glitter/layout e paleta. Nenhuma credencial ou dado sensível deve ser repassado a agentes sem necessidade.

# Tarefas — checkpoint 2026-10-28

| ID | Responsável | Estado | Evidência | Próximo passo |
|---|---|---|---|---|
| T01 Descoberta | Codex | Concluído | Repo/Vercel/DeepSeek verificados | — |
| T02 RE estática | Prisma | Concluído | `evidence/reverse/REPORT.md`; fatos estáticos separados de desconhecidos | Runtime/screenshots seguem lacuna |
| T03 Conteúdo original | Tinta | Concluído | `art.ts`: 6 vetores novos, 141 total; `palette.ts`: 40 hex 40/40 | Criar novos conteúdos só na próxima rodada |
| T04 Engine/glitter | Lumen + Tinta | Concluído local | Glitter determinístico por máscara; 13 unit tests específicos; E2E de brush/bucket | Reavaliar densidade visual no dispositivo |
| T05 Layout paisagem | Lumen | Concluído local | Capturas 4 viewports; overflowX 0 reportado | Capturar paleta atual de 40 cores |
| T05b Tela cheia | Codex | Concluído local | Fullscreen API no cabeçalho; E2E de entrada/saída Chromium | Verificar no preview Vercel e navegadores móveis suportados |
| T06 PWA/offline | Âmbar + Codex | Integrado e validado | 43 testes offline; E2E real em preview confirma pintura/reabertura sem rede | Repetir na URL candidata/produção |
| T07 E2E integrado | Prisma + Codex | Concluído | 35/35 no build preview; persistência, gameplay, ferramentas, responsividade, fullscreen e offline real | Rodar no preview Vercel |
| T08 Build/CI | Codex | Concluído local | 61 unit, 43 offline, build e 14 testes do smoke; CI agora executa E2E no preview local | Confirmar CI no push |
| T09 Preview/produção | Codex + Forge | Pendente | Projeto correto confirmado; produção atual smoke 52/52 mas bundle antigo | Push, validar preview e atualizar main |
| T10 Aceite final | Codex | Pendente | E2E 35/35 no preview local, incluindo pintura e reabertura offline | Commit/push, validar preview Vercel e produção |

Árvore de integração: `feat/integration` sobre `84d0fb3`; alterações não commitadas. Nenhum deploy desta integração foi feito. Controle de tela cheia adicionado e validado por E2E Chromium.

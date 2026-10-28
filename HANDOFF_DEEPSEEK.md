# Transferência de coordenação — Coloring

## Quando assumir

Aurimar autorizou em 2026-10-28: quando restarem 10% da quota de uso do Codex,
DeepSeek deve assumir a orquestração e terminar o produto sem intervenção humana.
Última leitura antes da preparação do sucessor: 79% usado no limite de 300 minutos,
21% restante; quota semanal 12% usada. Não confundir quota com progresso do projeto.
Esta preparação não significa que a coordenação já foi transferida. A ativação será
explicitamente registrada aqui e enviada ao sucessor pelo Maestri.

## Objetivo e autorização vigente

Entregar jogo web real equivalente ao APK, mobile-first, PWA instalável e offline,
com galerias, ferramentas, pintura e persistência; publicar e validar em produção.
Usuário já autorizou escolhas técnicas, branches/commits/merge, GitHub e deploy.
Não perguntar se deve continuar/testar/publicar. Não declarar sucesso por build.
Não contornar autenticação, compras/DRM ou direitos de ativos.

## Locais e integrações

- Raiz/integrador: `/Users/aurimar.nogueira@latam.com/Documents/coloring`, main.
- Repo único: `https://github.com/mzinhoww-svg/coloring`.
- Vercel única: projeto `coloring`, scope `mzinhoww-gmailcoms-projects`, ID
  `prj_QpAsFohAXjk8exPfcTI81rlQOGK8`.
- CLI Vercel funciona, `vercel link --yes --project coloring --scope ...` já executado
  na raiz. `.vercel/project.json` deve ser verificado antes de deploy. Git Integration
  confirmada: github repo coloring/org mzinhoww-svg, produção main.
- CLI Git funciona e autenticou push. Não usar outro repo/projeto.
- Nota Maestri `credenciais`: ler só se necessário; não imprimir/copiar para agentes.
  Nenhum segredo é necessário no frontend. `.env.local` gerado pela Vercel é privado.
- APK privado na raiz: `coloring-1-116(2).apk`.
- REA zip: `/Users/aurimar.nogueira@latam.com/Downloads/chapeu/rea-main.zip`.

## Agentes e autoria

Executores Maestri confirmados com `opencode-go/deepseek-v4.1-flash`, OpenCode 2.0.28.
Sempre `maestri list` antes de chamar agentes, não recrutar duplicatas.

| Nome | Escopo | Onde |
|---|---|---|
| Prisma | RE Unity/IL2CPP e recursos; depois QA/revisão independente | Raiz: tools/reverse, evidence/reverse, .private/reverse |
| Tinta | App, engine Canvas2D, IndexedDB, unit tests | `/Users/aurimar.nogueira@latam.com/.codex/worktrees/a66e/coloring`, feat/web-game |
| Âmbar | Offline/PWA, SW, manifest, ícones próprios, testes offline | `/Users/aurimar.nogueira@latam.com/.codex/worktrees/b448/coloring`, feat/offline-qa |
| design_astra | Arte original e instruções visuais | Agente Codex Astra, entrega raiz docs/design/art.ts e docs/design/* |

Astra não é acessível por `maestri ask`; resultado deve ser materializado antes da
transferência. Não programar jogo com Codex/Claude. DeepSeek pode coordenar os demais
e implementar correções como autorizado. Isolamento por worktrees nativos: Floors
Maestri falharam por raiz de workspace ~; não perder tempo recriando isolamento.
Raiz integra; não alterar arquivos ativos dos outros. Pedir commit/hash ao dono e
cherry-pick/revisar; nunca `git add .` com .private/arte extraída/env.

## Contratos entre módulos

`src/content/art.ts` (Astra):

```ts
type Pack = { id:string; title:string; emoji:string; color:string }
type Drawing = { id:string; packId:string; title:string }
export const packs:Pack[]
export const drawings:Drawing[]
export function getDrawingSvg(id:string):string
```

9 temas, 15 desenhos próprios em cada; SVG 800×800, fundo branco e regiões fechadas,
linha escura. Chaves: animals,dinosaurs,transport,underwater,fairytale,robots,
princess,alien,christmas. UI pt-BR. Não trocar arte por placeholders nem redistribuir APK.
Se o arquivo ainda estiver só em docs/design/art.ts, copiá-lo para src/content/art.ts
no worktree Tinta, informar o implementer e verificar TypeScript/renderização.

`src/offline.ts` (Âmbar):

```ts
registerOffline(onState:(s:{ready:boolean;online:boolean;error?:string})=>void):Promise<void>
prepareOffline():Promise<void>
```

Build: executar gerador `node tools/build-offline.mjs` depois do Vite build;
Âmbar informa tags de manifest/ícones e integração exata. Cache precisa ter todos
chunks/assets e verificar bytes/hash antes de indicar pronto. SW nunca apaga IndexedDB.

Tinta é dono de package.json/lock/index.html/configs/src/main.ts/src/style.css,
src/engine e src/storage; Âmbar não deve editá-los em paralelo.

## Evidência do original

Leia docs/APK_FINDINGS.md, docs/RUNTIME_FINDINGS.md, docs/design/DESIGN_EVIDENCE.md,
FEATURE_PARITY.md e evidence/reverse/REPORT.md quando disponível.
APK com.bimiboo.coloring 1.116 (746), Unity 2021.3.33f1, IL2CPP29.
Hash `1bb17ff5d70eae1a4287d67832deccfc5f24ae23948db4667842756f418d9d95`.

ADB: `/Users/aurimar.nogueira@latam.com/Library/Android/sdk/platform-tools/adb`.
Emulador emulator-5554; portal `APK Original`; `--no-streaming` resolveu instalação.
ANR inicial System UI recuperado; app rodou em landscape2400×1080.
Capturas privadas em `.private/runtime` (não publicar):

- ready-menu.png: galeria animais5×3, 15 cards brancos com molduras amarelas onduladas,
  fundo turquesa e nuvens; back topo esquerdo.
- painting.png: quadro branco centro-esquerda, rail esquerdo check verde/trash/undo,
  paleta vertical e rail direito com sete ferramentas ilustradas.
- fill-body.png: balde preenche corpo isolado e mantém contorno/regiões vizinhas.
- finished.png: check retorna à galeria com thumbnail colorido persistido.
- home.png: seletor temático em carrossel, título Animals; modal sair com check/X.

Sete ferramentas: marcador,lápis,pincel,spray,balde,glitter,padrões. Cores/texturas
com bloqueios comerciais foram observadas mas não desbloqueadas. Web distribui
conteúdo próprio sem compras/promoções proprietárias: divergência explícita.

## Verificações já vistas pela coordenação

- Script inventário:197 membros, metadata29,212 símbolos candidatos.
- Tinta:33 testes unitários passaram (geometria,região,histórico,latest-writer).
- PoC Canvas800×800 em Chromium: máscara28,9ms; fill máximo4,7ms; restore3,4ms;
  PNG20,5ms/55.052B; heap22MB. Só ensaio desktop, não métrica mobile/produção.
- Âmbar:15 testes build-offline e15 testes SW passaram; suíte do client ainda em
  execução quando este handoff foi preparado. Não afirmar todos passaram sem retestar.
- Nenhum build integrado, E2E de gameplay/offline nem deploy de jogo homologado ainda.

## Sequência para terminar

1. `maestri list`, `git status`, ler nove documentos e status dos executores.
2. Concluir arte+Tinta+Âmbar; integrar arquivos/commits com autoria e revisar diffs.
3. Instalar deps, rodar unit/offline/build. Não mascarar testes falhos nem tipos inválidos.
4. Reutilizar Prisma para QA independente e testes Playwright: galeria→desenho→sete
   ferramentas→undo→salvar→reabrir; mouse/touch; mobile/tablet/desktop; console limpo.
5. Servir dist HTTPS/localhost, esperar SW controlled e ready real. Cortar rede no
   contexto Playwright; reload, pintar, salvar, fechar browser com perfil persistente,
   reabrir offline e comparar pixels/progresso. Testar cache corrompido/ausente e atualização.
6. Comparar screenshots originais/web em estado/viewport equivalentes, documentar
   diferenças intencionais da arte própria. Corrigir geometria/layout/fluxos importantes.
7. Commit/cherry-pick main, CI build/test sem secrets. Configurar output Vite/dist
   no projeto Vercel existente; `.vercelignore` deve excluir APK/.private/.venv/evidence
   privada/docs técnicos desnecessários do deployment. Não incluir diretório raiz como site.
8. `vercel --prod --scope mzinhoww-gmailcoms-projects` após checar vínculo existente,
   ou Git Integration correta. Verificar logs e URL resultante. Não inventar domínio.
9. Repetir E2E/offline na URL efetivamente publicada, corrigir até passar.
10. Atualizar os nove documentos, memória e relatório final com URL, commit, testes,
    evidências e divergências reais. URL pública jogável é a entrega; handoff não é DONE.

## Memória e continuidade

Cofre `/Users/aurimar.nogueira@latam.com/Downloads/obsidian/aurimar` está acessível.
Projeto PROJ-038 criado em `04 - Projetos/coloring/Índice - Coloring.md` e preferência
Astra escopada ao Coloring adicionada à PREF-001, mantendo histórico. Último validate:
1905 notas,110 IDs,7 índices, sem erro. Ao fechar, atualizar nota canônica sem duplicar.
Arquivo de convenções real é `99 - Sistema/SCHEMA.md` (título Convenções e Templates).
Nunca registrar segredos, env, dumps integrais ou transcrições.

## Estado mais recente da integração

- Arte Astra FINAL: docs/design/art.ts,305linhas,135SVGs/9packs validados estruturalmente.
  Já copiada a src/content/art.ts NA RAIZ e no worktree Tinta. SVGs são próprios,
  distintos e determinísticos; falta revisão visual completa na aplicação real.
- Offline final: branches/commits `19a818a`, `f061d56`, já cherry-picked na main.
 43 testes node:test reportados e reexecutados pela coordenação. Leia tests/offline/README.md.
- Snapshot antigo de offline foi copiado ao Tinta antes de f061d56; REPOR src/offline.ts,
 public/sw.js/public/manifest.webmanifest e tools/build-offline.mjs FINAIS da raiz no worktree
 dele antes de novo build. Não deixar shell-alias/integrity fix para trás.
- Coordenação reexecutou41unit tests com sucesso e buildVite real (100,71kB JS/26,30kB CSS).
  Gerador offline criou9arquivos/225,2KiB; precisa retestar depois da syncPWAfinal.
- Tinta tem engine/UI/storage e41unit tests no feat/web-game; ainda sem aceite final/commit
 comunicado. Arte e offline removem bloqueio de import; rode build integrado.
- Prisma foi REUTILIZADO como QA interativo; fonte RE concluída, agora revisa engine e prepara
 E2E. O comando inicial opencode run era one-shot e mensagens posteriores caíam no shell;
 corrigido para `opencode mini --standalone --model opencode-go/deepseek-v4.1-flash` no Prisma.
 Ao precisar reativar Tinta/Âmbar após tarefas terminarem, use mini persistente, não run.
 Nunca enviar prompt natural ao terminal que já voltou ao shell; conferir maestri check.
- Portas: Tinta5173dev/4273preview; Prisma4373sandboxQA; Âmbar4199fixtureoffline.
 NÃO confundir fixture offline com o jogo. Verificar título/conteúdo/build antes de testes.
- Branding própria criada no app e manifest: Rabisco; manter consistente, projeto/repo Coloring.
- Índice HTML precisa manifest.webmanifest, ícones e metatagmobile. build deve terminar
 `&& node tools/build-offline.mjs`; test:offline deve rodar node --test tests/offline/*.test.mjs.
- Vercel headers: sw.js no-cache,no-store,must-revalidate e Service-Worker-Allowed:/;
 offline-manifest.json no-store; assets hashed immutable; não reescrever esses endpoints.
- Main ainda NÃO contém engine/UI completos, não há deploy validado. Não declarar DONE.

## Ativação

Pendente: Codex ainda coordena. Substituir esta linha ao efetuar a transferência.

## Pendências críticas para o sucessor

Tinta informou que sua UI atual é design independente creme/coral, e continua perguntando
por screenshots: as respostas via maestri ask não parecem chegar como contexto ao `opencode run`.
NÃO ignorar essa lacuna. Existem screenshots REAIS na raiz .private/runtime e handoff Astra
em docs/design/RUNTIME_LAYOUT_HANDOFF.md com a composição original. Leia essas fontes e
corrija o layout (turquesa/nuvens/galeria5×3/rails) com DeepSeek antes de alegar fidelidade.
A branding própria Rabisco é aceitável, mas não substitui a exigência de semelhança visual.
Se pares one-shot retornarem ao shell, você pode reativá-los enviando comando CLI adequado
com `maestri ask --raw`, usando `opencode mini --standalone --model opencode-go/deepseek-v4.1-flash`
e prompt para ler briefs/estado já preservados. Não mandar texto natural para shell nem
interromper operações de escrita; aguardar término e preservar trabalho. Prisma já usa mini.
Nota conectada de entrega tem nome CLI exato `coloring-entrega-e-progresso`.

# Coloring — plano mestre

Estado: engenharia reversa dinâmica e implementação paralela em andamento; produção ainda não homologada.

## Objetivo e restrições

Reconstruir o APK como jogo web mobile-first instalável e offline, com pintura,
galerias e progresso persistente. Referência primária: `coloring-1-116(2).apk`.
Repositório exclusivo: https://github.com/mzinhoww-svg/coloring, main.
Projeto exclusivo Vercel: coloring, scope mzinhoww-gmailcoms-projects.
Codex orquestra; OpenCode Go/DeepSeek executa engenharia/software/QA.
Astra do Codex conduz design por autorização explícita de 2026-10-28.
Não substituir DeepSeek, inventar evidência ou publicar ativos sem direito de uso.
Decisões rotineiras e publicação já autorizadas; não pedir confirmação novamente.

## Fases e critérios

1. Descoberta: APK e REA localizados; verificar acesso, executor, repo e projeto.
2. Engenharia reversa: inventário estático; runtime Android; telas e fluxos equivalentes.
3. Especificação: matriz observação/inferência/desconhecido; direitos dos conteúdos.
4. Arquitetura: comparar Canvas, PixiJS e Phaser com experimento do motor de pintura.
5. Implementação: galerias, pintura, ferramentas, gestos, IndexedDB, PWA e offline.
6. QA: testes funcionais, visuais, touch, persistência, migração e recuperação.
7. Publicação: commit GitHub, vínculo Vercel verificado e deploy no projeto existente.
8. Aceite: E2E da URL publicada, cold reload offline e recuperação do desenho offline.

Nenhuma fase posterior pode ser declarada pronta apenas por build verde.
Escala de agentes acompanha trabalho independente e capacidade real, até 16 no Maestri.
Não criar 16 agentes sem executor disponível ou tarefas prontas para execução.

## Contratos propostos, ainda sujeitos ao experimento

- Conteúdo: `Drawing { id, packId, title, source, license, preview, layers }`.
- Engine: carregar desenho, ferramenta/cor, pointer input, undo/redo, snapshot e restore.
- Persistência: IndexedDB transacional por drawingId, versão de schema, snapshot e revisões.
- Offline: manifesto de recursos com hash; indicar pronto só após verificar cada recurso.
- UI: galeria/pintura separadas do renderer; design Astra entrega especificação evidenciada.
- QA: cada recurso da FEATURE_PARITY deve apontar evidência original e teste web.

Dividir worktrees só depois de recuperar/verificar o estado remoto; um dono por módulo.
Manter os nove documentos de continuidade atualizados a cada marco material.

Transferência autorizada ao DeepSeekNexo quando90%quotaCodex usada; estado em HANDOFF_DEEPSEEK.md.

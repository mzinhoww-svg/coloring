# Tarefas

| ID | Tarefa | Responsável | Estado | Dependência | Evidência/teste | Próximo passo |
|---|---|---|---|---|---|---|
| T01 | Localizar APK e REA | Codex | Concluído | Nenhuma | APK local e zip REA em Downloads/chapeu | Inventário |
| T02 | Verificar repo existente | Codex | Concluído | Integração GitHub | get_repo: push/admin; contents: repository empty | Publicar documentação válida |
| T03 | Confirmar executor e presets | Codex | Bloqueado | Sockets Maestri/OpenCode | Maestri EPERM; OpenCode 2.0.28 não inicia servidor | Reexecutar após acesso permitido |
| T04 | Localizar nota autorizada | Codex | Bloqueado | T03 | maestri list falhou; nome/conteúdo desconhecido | Ler somente nota conectada pertinente |
| T05 | Inventário estático | Codex | Parcial | APK | tools/inspect_apk.py e evidence/static | Análise de tipos, recursos e métodos |
| T06 | Referência de design estática | Astra | Concluído, runtime pendente | APK | docs/design/DESIGN_EVIDENCE.md, DESIGN_HANDOFF.md | Capturar telas reais após B05 |
| T07 | Runtime original | DeepSeek | Bloqueado | Executor e ADB | ADB existe, listener EPERM | Rodar ARM64 e capturar fluxos |
| T08 | Arquitetura e PoC | DeepSeek/Codex | Pendente | T03 e T05–T07 | DECISIONS.md | Comparar três opções e medir |
| T09 | Implementar motor/galeria | DeepSeek | Pendente | T08 | Nenhum código de jogo | Worktrees e contratos |
| T10 | PWA e persistência | DeepSeek | Pendente | T09 | Nenhum teste web executado | Testar salvar/reabrir offline |
| T11 | QA completo | DeepSeek + Astra visual | Pendente | T09/T10 | QA_STATUS.md | Validar runtime equivalente |
| T12 | Projeto Vercel e Git Integration | Codex | Bloqueado | Acesso ao time | API 403 requer consentimento de conta | Retentar projeto após autorização |
| T13 | Produção e homologação | Codex/DeepSeek | Pendente | T11/T12 | Sem URL/commit publicado do jogo | Deploy e E2E produção |

# QA

Estado: produto ainda não implementado. Nenhum teste funcional, visual ou de produção passou.

Executado: inventário ZIP, cabeçalho de metadados IL2CPP e probes de capacidades.
Evidência estática: `python3 tools/inspect_apk.py`.
Resultado: 197 membros, IL2CPP v29, 212 símbolos candidatos; SHA-256 confere com o Astra.
`aapt dump badging` e `dump xmltree` executados com sucesso; identidade em docs/APK_FINDINGS.md.
Ref main remota lida após publicação do checkpoint documental.

## Suite de aceite a implementar pelo DeepSeek

- Abrir pack e desenho; pintar com mouse e pointer touch; trocar ferramenta/cor.
- Strokes atravessando região e borda; limites, zoom/transformações, multitouch e cancel.
- Desfazer/refazer conforme comportamento observado; limpeza com recuperação adequada.
- Autosave e reabertura; navegar durante gravação; falha/quota de IndexedDB; schema migration.
- Offline readiness: verificar recursos, bloquear rede real, reload e nova sessão offline.
- Criar/modificar pintura offline, fechar/reabrir offline e comparar pixels/estado persistido.
- SW atualização sem perder progresso; recurso ausente não recebe indicador offline pronto.
- Desktop, tablet e celular; orientação; Safari/Chromium; acessibilidade dos controles.
- Comparar screenshots runtime original/web em estados equivalentes.
- Repetir fluxos na URL Vercel efetivamente publicada; checar console, assets e SW.

Não existem screenshots runtime nem resultado comparativo. Build não executado: sem código do jogo.

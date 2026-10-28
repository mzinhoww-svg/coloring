# Matriz de paridade

Código do jogo está no worktree Tinta e ainda passa por integração/QA; nenhum aceite final.
Runtime original observado em docs/RUNTIME_FINDINGS.md. Matriz abaixo é baseline inicial
e deve ser atualizada pelo sucessor com testesE2E reais antes do aceite.

| Recurso | Original/evidência | Classificação | Web/teste | Divergência/status |
|---|---|---|---|---|
| Galerias temáticas | Addressables, Prefabs das nove categorias; relatório Astra | Recurso estático | Não implementado; testar abrir cada pack | Runtime desconhecido |
| Pintura | ColoringPage, Paintable, PaintIn3D | Código estático | Não implementado; teste strokes/limites | Regras desconhecidas |
| Pincel/lápis/preenchimento | BrushTypes, Pencil, Bucket, secondaryFillBrush | Símbolos candidatos APK-STATIC-002 | Engine/UI implementados; E2E touch/mouse e comparação visual pendentes | Aparência/alcance desconhecidos |
| Glitter | shineBrushTextures, palette | Glitter disponível como acabamento da paleta; pincéis e balde aplicam a textura | Teste unitário do preenchimento texturizado; E2E UI e visual pendentes | Aparência original e texturas proprietárias não redistribuídas |
| Padrões | patternBrushTextures | Símbolos candidatos | Não implementado; comparar resultado visual | Uso real desconhecido |
| Paleta | PaletteController, PaletteItem, PaletteTypes | Símbolos candidatos | Paleta de cores e acabamento glitter; teste de fluxo UI pendente | Cores/ordem originais desconhecidas |
| Desfazer | ColoringPage.OnButtonUndo, btnUndoTablet | Símbolos candidatos | Não implementado; teste stroke→undo | Profundidade desconhecida |
| Refazer | Biblioteca PaintIn3D tem Redo/CanRedo | Capacidade da biblioteca, exposição no jogo desconhecida | Não implementado | Não afirmar que botão existe |
| Restauração | LoadStrokes, ColoringPageDataManager | Símbolos candidatos | Não implementado; comparar reload | Formato/semântica desconhecidos |
| Layout tablet | allBrushesForTablet, btnUndoTablet | Símbolos candidatos | Não implementado; testes viewports | Geometria desconhecida |
| Zoom, áudio, animações | Símbolos genéricos/bibliotecas | Não observado | Não implementado | Investigar no runtime |
| Offline e PWA | Requisito da reconstrução web | Exigência do usuário | Não implementado; cold reopen offline | Sem aceite |

Futuros testes devem apontar arquivos/test IDs, screenshots equivalentes e resultado real.
Nunca converter existência de método em funcionalidade concluída.

# Matriz de paridade — checkpoint 2026-10-28

Classificações distinguem fatos estáticos, comportamento testado no web e lacunas sem evidência runtime. O APK permanece referência privada; desenhos novos são vetores originais e não reutilizam sprites do APK.

| Recurso | Evidência APK | Implementação web | Teste/evidência atual | Lacuna |
|---|---|---|---|---|
| Galerias | 9 categorias; 135 referências de páginas | 9 galerias; 141 desenhos web originais | Walkthrough E2E cobre as 9; contrato de conteúdo | Nenhum screenshot de runtime do APK para comparação visual |
| Pincel, lápis, marcador e giz | Candidatos estáticos Unity/PaintIn3D | Canvas2D; mouse/touch | E2E de ferramentas, mobile e responsividade | Spray ainda não implementado |
| Balde/fill | PaintIn3D e regiões com colliders | Flood fill 4-conectado limitado por máscara | E2E de fill, undo e glitter | Regras do APK não confirmadas em runtime |
| Glitter/shine | 15 sprites shine identificados; payload privado | Glitter procedural determinístico como acabamento da paleta; pincel e balde | Unit tests; E2E de brush/bucket; 0 px fora da máscara, undo igual ao snapshot em medição Chrome reportada | 15 variantes originais do APK não copiadas; cobertura visual não é pixel equivalente |
| Padrões | 20 sprites de padrão identificados; payload privado | Não implementado | Sem teste | Criar padrões procedurais originais ou marcar como lacuna |
| Paleta | 40 valores RGB recuperados na ordem serializada | 40 cores integradas, com rótulos pt-BR | Conferência 40/40 e E2E 33/33 após troca | Triângulo/scroll visual original não reproduzido exatamente |
| Desfazer/refazer | Undo confirmado; redo sem UI observada no APK | Undo/redo web | E2E de undo/redo | Redo é extra da web; profundidade original desconhecida |
| Salvar/restaurar | Símbolos LoadStrokes/SaveImage; formato runtime desconhecido | Autosave IndexedDB por gesto, export PNG, retomada | E2E de persistência; cenário completo 33/33 | Sem comparação runtime do formato original |
| Layout paisagem | Geometria serializada ColoringPage | Colunas ações/quadro/paleta/ferramentas por proporções | Capturas desktop, tablet e celular; overflowX 0 em 4 viewports | Sem screenshot Android do APK; barra superior e controles web diferem |
| Retrato | Não observado no APK | Layout mobile web original mantido | Captura phone portrait; E2E mobile | Comportamento original desconhecido |
| Tela cheia | Recurso web adicional | Botão no cabeçalho ativa/sai da Fullscreen API no estúdio | E2E Chromium testa entrada/saída; controles sincronizam por `fullscreenchange` | Navegadores sem Fullscreen API mostram controle desativado, com título explicativo |
| PWA/offline | Requisito da reconstrução web | Manifesto, SW versionado com hash, precache e IndexedDB | 43 testes offline; reload frio offline já validado em Chromium no build integrado anteriormente | Repetir cenário de pintura/reabertura offline na versão candidata e na URL de produção |

## Evidência visual

Geometria da tela ColoringPage vem de cenas Unity serializadas; não foram capturadas telas do APK em emulador. Capturas web não provam paridade de pixels. As medidas de canvas reportadas na rodada: desktop 789 px, tablet 665 px, phone landscape 323 px, phone portrait 352 px.

## Resultado da rodada

61/61 testes unitários, 43/43 offline, build web/offline, 14/14 testes do validador de produção e 35/35 E2E no build de preview passaram. O teste E2E offline confirmou pintura e retomada após reload sem rede. O botão de tela cheia também passou E2E. Ainda não há commit, preview/produção desta árvore nem smoke pós-deploy.

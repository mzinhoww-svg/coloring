# Decisões

## ADR-001 — divisão de responsabilidades (aceita, 2026-10-28)

Codex orquestra e Astra conduz design, conforme a correção explícita do usuário.
OpenCode Go/DeepSeek continua obrigatório para implementação técnica.
Não substituir esse executor por Codex/Claude por causa de falha do ambiente.

## ADR-002 — evidências antes da fidelidade (aceita)

APK, catálogo e metadados são referência estática; existência de símbolos não
prova comportamento, geometria, alcance de tela ou regra de jogo.
Nenhum screenshot de referência foi capturado. Não afirmar equivalência visual.

## ADR-003 — alternativas do renderer (decisão final pendente de experimento)

| Alternativa | Fidelidade/complexidade | Mobile e offline | Riscos |
|---|---|---|---|
| Canvas 2D + UI DOM/TS | Flexível para máscaras e strokes; baixa infraestrutura | Ótimo controle de cache; medir fill e memória | CPU em fill/texturas grandes, histórico caro |
| PixiJS/WebGL + UI DOM/TS | Bom para máscaras, efeitos e batching | Bom throughput; conteúdo e salvamento separados | Readback, perda de contexto, compatibilidade GPU |
| Phaser 2D | Gestão pronta de cenas, input e áudio | Ecossistema de jogos e escala | Maior estrutura, encaixe das operações de pintura por provar |

Hipótese inicial: renderer Canvas 2D se desenho estático/máscaras simples bastar;
PixiJS se efeitos/texturas e medidas justificarem GPU. Phaser se runtime revelar
fluxos de jogo que se beneficiem de cenas físicas/temporizadas. Não escolhidos ainda.
Experimento discriminante: stroke contínuo com touch, fill em região, máscara,
undo/redo e snapshot/restore em desenho de tamanho observado, medindo latência e memória.

Experimento executado por Tinta em Chromium headless, canvas 800×800: construção
da máscara 28,9 ms; cinco fills com máximo 4,7 ms; restauração de snapshot 3,4 ms;
codificação PNG 20,5 ms, PNG 55.052 bytes; heap observado 22 MB. Esses números são
do ensaio desktop, não garantia mobile. Escolha: Canvas2D com line-art separada,
fill baseado na máscara original e histórico de patches limitado. Medir no browser
integrado e revisar se o uso real demonstrar necessidade de WebGL.

## ADR-004 — ativos e publicação (aceita)

APK e arte extraída são referência privada. Presença no APK não concede licença.
Publicar somente código próprio, conteúdos autorizados ou substitutos próprios.
Não publicar APK, credenciais, transcrições, logs brutos ou catálogos proprietários integrais.
GitHub integração permitiu leitura/escrita; usar esse caminho autorizado quando shell não tem rede.
Não contornar consentimento Vercel nem restrições do sistema operacional.

## ADR-005 — glitter é acabamento da paleta (aceita, 2026-10-28)

Glitter é uma opção de pintura selecionada na paleta, separada das ferramentas.
O acabamento aplica-se ao pincel ativo e ao balde; o balde texturiza a região
delimitada pela arte original. A textura fica na camada de pintura comum para
que undo/redo, exportação e salvamento continuem funcionando.

## ADR-006 — Layout paisagem guiado por geometria serializada (aceita, 2026-10-28)

Usar CanvasScaler 800×1080 e as larguras serializadas das faixas para aproximar a tela web em landscape; limitar as colunas pela largura disponível e manter o layout portrait existente porque o APK não foi observado em retrato. Capturas web verificam clipping/overflow e usabilidade, não paridade de pixels. A ausência de screenshot do APK permanece uma lacuna explícita.

## ADR-007 — Assets próprios e paleta recuperada como dados (aceita, 2026-10-28)

Os 40 hexes serializados podem ser reutilizados como dados de cor; não redistribuir sprites, texturas, fontes ou áudio do APK. Novos desenhos são vetores originais. Glitter é procedural e compartilhado pelo pincel e pelo balde; variantes originais de padrões/shine ficam como trabalho futuro.

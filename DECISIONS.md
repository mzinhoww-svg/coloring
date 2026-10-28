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

## ADR-004 — ativos e publicação (aceita)

APK e arte extraída são referência privada. Presença no APK não concede licença.
Publicar somente código próprio, conteúdos autorizados ou substitutos próprios.
Não publicar APK, credenciais, transcrições, logs brutos ou catálogos proprietários integrais.
GitHub integração permitiu leitura/escrita; usar esse caminho autorizado quando shell não tem rede.
Não contornar consentimento Vercel nem restrições do sistema operacional.

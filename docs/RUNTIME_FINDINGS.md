# Evidência dinâmica do original

APK: `com.bimiboo.coloring` 1.116 (746), SHA-256
`1bb17ff5d70eae1a4287d67832deccfc5f24ae23948db4667842756f418d9d95`.
Android ARM64, emulador Medium Phone API 37, display 2400×1080 em landscape.
Instalado com `adb install --no-streaming -r`. ANR inicial do System UI foi recuperado;
o processo Unity iniciou e exibiu interface real. Capturas são referências privadas,
excluídas da distribuição e guardadas em `.private/runtime/`.

| Evidência | Arquivo privado | Ação e resultado observado |
|---|---|---|
| R01 | ready-menu.png | Galeria Animais: 15 páginas em 5 colunas ×3 linhas. Cards brancos, molduras amarelas onduladas, fundo turquesa com nuvens; voltar no topo esquerdo. |
| R02 | painting.png | Abrir primeira página: quadro branco quadrado, ferramenta/cor na direita e concluir no topo esquerdo; lixeira e undo abaixo à esquerda. |
| R03 | fill-body.png | Selecionar balde, tocar corpo: preenche exclusivamente a região corporal, mantém linhas pretas e regiões vizinhas brancas. Paleta muda para tons azul/verde. |
| R04 | finished.png | Tocar check verde: retorna à galeria; primeiro thumbnail mantém o preenchimento azul do corpo. |
| R05 | home.png | Voltar à seleção temática e Android Back: confirmação de saída com check verde e X vermelho; fundo mostra título Animals e seletores temáticos adjacentes. |

## Controles visíveis de pintura

Sete ferramentas em rail vertical no extremo direito, com ilustrações grandes:
marcador, lápis, pincel, spray, balde, glitter e padrões. À esquerda desse rail,
paleta vertical estreita. Determinadas cores/texturas exibem cadeado comercial.
O check verde conclui; undo permanece desabilitado até existir uma alteração.
O comportamento de todos os pincéis ainda precisa de testes equivalentes.

## Separação de produto e referência

Os desenhos e ícones proprietários não serão redistribuídos. A versão web usa arte
SVG própria nos mesmos nove temas e ferramentas implementadas localmente.
Não são reproduzidas compras, desbloqueios de conteúdo proprietário nem publicidade
de outros aplicativos. Essa diferença deve constar no aceite, sem alegação de cópia exata.
Os recursos offline/PWA são requisitos web adicionais, e não foram atribuídos ao Android.

Não confundir demonstração manual do APK com teste automatizado do jogo web.

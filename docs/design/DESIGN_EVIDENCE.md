# Design — evidência estática do APK

Data: 2026-10-28. Responsável: agente Astra. Estado: investigação estática; nenhuma tela do jogo executada ou capturada. Nenhuma implementação de jogo foi produzida.

## Proveniência

Artefato: `coloring-1-116(2).apk`; SHA-256 `1bb17ff5d70eae1a4287d67832deccfc5f24ae23948db4667842756f418d9d95`.

Inventário reproduzível: `evidence/design/catalog-findings.json`, derivado de `assets/aa/catalog.json`, campo `m_InternalIds` (578 entradas). A existência de um nome é evidência do recurso catalogado, não de sua presença numa tela acessível, nem da posição, aparência ou comportamento em execução. O catálogo usa LegacyResourcesProvider. O cabeçalho de `assets/bin/Data/data.unity3d` identifica UnityFS e `2021.3.33f1`.

## O que foi encontrado

| ID | Evidência direta | Conclusão permitida | O que continua desconhecido |
|---|---|---|---|
| D01 | `Scenes/MainMenu`, `Scenes/GalleryMenu`, `Scenes/ColoringPage`, `Scenes/IntroScene`, `Scenes/PreloadScene`, `Scenes/EmptyScene` | Seis identificadores de cenas catalogados | Ordem, transições e conteúdo visível |
| D02 | `Prefabs/{categoria}/{0..14}` para alien, animals, christmas, dinosaurs, fairytale, princess, robots, transport, underwater | Nove grupos, 15 referências numéricas cada: 135 referências | Arte de cada página, disponibilidade, ordem visual e bloqueios |
| D03 | `Prefabs/{categoria}/Gallery`, `Prefabs/{categoria}/LoadStrokes`; `Prefabs/IAP/{categoria}` | Recursos associados a galeria, traços e compras | Autosave, recuperação, confirmação, preços e fluxo comercial |
| D04 | `font/Inter-*` (Regular, Medium, SemiBold, Bold, ExtraBold, Black e variantes itálicas listadas no inventário), `Fonts & Materials/LiberationSans SDF` | Fontes candidatas incorporadas | Fonte usada por controle, tamanho, tracking e cores |
| D05 | `images/arrow-back`, `arrow-next`, `check`, `save`, `trash`, `menu_button`, `switcher-on/off`, `settings/difficulty_back/front` | Nomes de recursos de interface | Estilo real, localização e condições de exibição |
| D06 | `prefab/text/Body-big`, `Body-medium`, `Body-small`, `Header-big`, `Header-medium` | Nomes de cinco estilos/prefabs de texto | Valores tipográficos e hierarquia efetiva |
| D07 | `sounds/color`, `fill`, `gallery-scroll-short`, `game-particle`, `menu-melody`, `menu-to-gallery`, `menu-to-menu` | Recursos de áudio com esses nomes | Gatilhos, duração e volume |
| D08 | `localization/pt/title-1..5`, `localization/pt-BR/title-1..5`, recursos `parental_gate_title` | Referências de localização em português e gate parental | Textos efetivos, idioma inicial e funcionamento do gate |
| D09 | Ícone Android `res/mipmap-xxxhdpi-v4/app_icon.png`, inspecionado visualmente | Ícone quadrado de 192×192: personagem animal amarelo/ocre com contorno preto, lápis roxo erguido, fileira de lápis coloridos na base, fundo turquesa com raios | Não demonstra a paleta das telas ou a aparência da área de desenho |

D09 é referência privada em `evidence/design/private-reference/app_icon.png`. Não incluir essa imagem nem outros assets originais em site, build, pacote de distribuição ou galeria pública. O ícone não é screenshot do aplicativo.

## Limitações verificadas

Nesta sessão não há UnityPy nem módulo Python lz4 disponíveis. Os recursos principais de Unity estão no bundle `data.unity3d`; não foram decodificados seus objetos, texturas, hierarquias ou RectTransforms. Não houve execução de Android. As restrições de Maestri/ADB/rede informadas pela coordenação não foram contornadas. A inspeção não permite determinar orientação, dimensões de canvas, safe area, número ou posição de ferramentas, cores de paleta, espessura de traço, tela inicial, estados selecionados ou gestos.

Strings brutas de metadata IL2CPP misturam bibliotecas, traduções e aplicativo. Elas não foram usadas para afirmar controles de desenho ou capacidades como desfazer, stickers e zoom. Nomes de shader Paint in 3D também não provam interação visível.

## Avaliação de fidelidade atual

Fidelidade visual ao APK: **ainda não demonstrada**. Não há base suficiente para especificar telas pixel a pixel. Um protótipo baseado somente em convenções de apps infantis deve ser rotulado como proposta independente, nunca como reconstrução observada. Não inferir barra inferior, sidebar, grade, modal, paleta arco-íris ou botão de desfazer a partir do gênero do app.

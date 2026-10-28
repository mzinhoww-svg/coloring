# Arte original — entrega para DeepSeek/Tinta

Data: 2026-10-28. Autor: agente Astra. Arquivo entregue no workspace original: `docs/design/art.ts`. Destino de integração autorizado: `src/content/art.ts` no worktree `feat/web-game`. A escrita direta nesse worktree foi negada ao processo Astra; a coordenação copia o arquivo. Nenhum commit realizado.

## Contrato implementado

- `Pack = {id:string,title:string,emoji:string,color:string}` e `Drawing = {id:string,packId:string,title:string}`.
- `packs`: nove chaves exigidas; `drawings`: 15 por chave, 135 IDs únicos.
- IDs estáveis: `animals-1` até `animals-15`, e mesmo padrão para as outras chaves. Não são IDs extraídos do APK.
- `getDrawingSvg(id)` retorna string SVG standalone 800×800; ID inválido lança erro para impedir troca silenciosa de desenho.
- Sem dependências, rede, aleatoriedade, fontes externas, imagens incorporadas ou lógica de jogo.
- SVGs com fundo branco opaco, contornos `#26313d`, junções/pontas arredondadas. Linha principal 7,5 px após a escala do grupo central; elementos de cenário têm 6 px. Formas de área possuem fechamento geométrico e preenchimento branco; linhas abertas são detalhes expressivos, não limites prometidos de área.
- Pupilas e detalhes pequenos pretos são parte do traço, destinados à máscara de linework. O motor deve preservar contornos/pretos, conforme seu próprio contrato de máscara.

## Conteúdo e limites

São composições autorais com temas distintos: animais; espécies/cenas de dinossauros; veículos; vida marinha; fantasia; robôs com corpos/acessórios e ocupações diferentes; objetos/personagens de reino; espaço; Natal. Não são recolorações de um mesmo SVG. Há linguagem de formas e auxiliares compartilhados (folhas, flores, nuvens, rodas), além de personagens reutilizados quando um tema pede uma nova composição, como pinguim com cachecol.

Esta é **arte substituta original**. Não reproduz a seleção exata dos animais, os traços, proporções ou composições proprietárias do APK. Nomes exibidos, emojis e cores dos packs são metadados autorais para integração; não foram observados no APK e não devem ser usados para afirmar equivalência de UI. Em especial, a galeria observada não possui títulos textuais por card.

## Verificações realizadas

1. Node v24.14.0 importou TypeScript diretamente: nove packs, 135 desenhos, 15 por pack, IDs únicos, saídas distintas, determinismo e erro de ID inválido passaram.
2. Python `xml.etree.ElementTree` interpretou os 135 SVGs sem erro e confirmou `viewBox="0 0 800 800"`.
3. `tsc --noEmit --target ES2020 --module ESNext --strict --skipLibCheck docs/design/art.ts` passou com exit code 0.
4. Prancha autoral gerada em `docs/design/qa/gallery.html`; catálogo de SVGs em `docs/design/qa/svg-catalog.json`.

A tentativa de abrir a prancha `file://` no navegador de revisão foi bloqueada pela política do navegador. Não foi contornada. Portanto, **não há aprovação visual renderizada dos 135 desenhos nesta entrega**, nem prova de flood fill em todas as regiões. A integração deve revisar a prancha no ambiente de QA autorizado e testar preenchimento em amostras variadas antes de afirmar qualidade visual final.

## Próxima ação do integrador

Copiar `docs/design/art.ts` para `src/content/art.ts`; usar exports sem renomear IDs; executar build/testes do app. Conferir detalhes pequenos em thumbnail, áreas separadas de rosto/corpo/roupa, preenchimento na borda, máscara de traço, saída/retorno e persistência por ID. Se qualquer ilustração tiver problema de legibilidade, corrigir seu renderer mantendo ID estável. Não importar nenhum arquivo de `.private/` ou `evidence/design/private-reference/` para a aplicação.

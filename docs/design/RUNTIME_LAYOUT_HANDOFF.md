# Layout observado no APK — orientação de implementação

Data: 2026-10-28. Evidência: `.private/runtime/ready-menu.png` e `.private/runtime/painting.png`, ambas 2400×1080, fornecidas pela coordenação e efetivamente vistas por Astra. São referências privadas; não distribuir screenshots, crops, texturas ou ícones originais. Este documento supera a limitação anterior de ausência completa de runtime **somente para os dois estados descritos**. O estado inicial/home e as demais categorias não foram inspecionados por Astra.

## Galeria de animais

Composição landscape. Fundo em gradiente turquesa com nuvens claras decorativas. Grade central de cinco colunas por três linhas, 15 cards. Cards brancos quadrados, cantos arredondados, moldura amarela ondulada. Um grande botão voltar no canto superior esquerdo. Sem header textual, rótulos sob cards ou navegação textual observável nessa captura.

Na imagem, o conjunto da grade ocupa aproximadamente x=430..1965 e y=60..1015. Cada card externo tem cerca de 295×295 px; intervalos horizontais são estreitos, verticais cerca de 35 px. Esses números são aproximação visual, não bounding boxes instrumentadas. Manter proporções da composição primeiro, em vez de criar um dashboard com cards textuais. Não afirmar que a ausência de controles nessa captura prova sua ausência em outros estados.

Os 15 temas animais visíveis no original são guaxinim, tigre, abelha, caracol, sapo, rato, leão, urso, girafa, ovelha, coruja, tucano, raposa, coelho e macaco. A arte própria entregue tem seleção diferente; documentar diferença, não chamar paridade de conteúdo.

## Pintura

Composição horizontal. Quadro branco quadrado central deslocado à esquerda, estendendo-se por toda altura capturada. Varredura de pixels na linha y=10 encontrou branco de x=481 até x=1559 inclusive: dimensão visual compatível com quadro de 1080×1080 a partir de x≈480. É observação da captura específica, não uma regra responsiva universal.

À esquerda: botão concluir/check verde perto do topo; lixeira e desfazer próximos da base. Na captura inicial os dois últimos parecem esmaecidos, mas o estado funcional não pode ser provado só pelo visual.

À direita do quadro há área de fundo turquesa antes dos controles. Uma faixa estreita vertical de cores fica junto da coluna extrema direita de sete ferramentas ilustradas horizontalmente. Há indicador triangular apontando para a cor selecionada. Ferramentas visíveis, de cima para baixo: marcador, lápis, pincel, spray, balde, glitter e padrões. O aspecto visual não prova o algoritmo de cada ferramenta. A coordenação relatou teste de preenchimento; essa evidência funcional deve ser ligada no relatório de QA próprio.

A coluna de ferramentas possui fundo claro texturizado; ilustrar ferramentas originais próprias, sem extrair a textura/ícones do APK. Preservar posição, orientação e número de ferramentas observados. Não substituir por uma barra horizontal inferior se a meta é aproximação do layout capturado.

## Cores amostradas diretamente

Pixels idênticos nas duas capturas: (10,10) = RGB(50,175,219), (10,500) = RGB(64,191,214), (10,1000) = RGB(103,216,217). Servem como pontos de referência da aparência do fundo, não como prova de stops CSS originais. A presença de nuvens torna interpolação linear apenas aproximação.

## Responsividade e aprovação

Priorizar a reprodução proporcional em 2400×1080 ou viewport de razão equivalente (20:9), incluindo um quadro de desenho quadrado. O APK não foi inspecionado em portrait, tablet ou outra razão; qualquer rearranjo nesses casos é decisão nova da versão web e deve ser declarado como adaptação. A versão web pode ter elementos de acessibilidade sem afirmar que são parte observada do original.

Validar lado a lado mesmos viewport/estado; não usar apenas nota global de semelhança. Comparar fundo, grade, quadro, alinhamentos e três zonas de controle. Separar resultado da aproximação estrutural do resultado da arte substituta, que intencionalmente não copia os assets.

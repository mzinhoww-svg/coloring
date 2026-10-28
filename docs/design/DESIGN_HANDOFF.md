# Instruções de design para implementação

Base obrigatória: `DESIGN_EVIDENCE.md`; inventário: `../../evidence/design/catalog-findings.json`.

## Decisões fundamentadas agora

1. Usar as nove chaves de categoria e os índices de página apenas como modelo de inventário. A ordem alfabética do catálogo não é ordem de navegação. Nomes traduzidos para exibição exigem confirmação; as chaves inglesas não provam rótulos visíveis.
2. Tratar MainMenu, GalleryMenu e ColoringPage como candidatos à separação de estados. A ligação entre eles é hipótese até observação em execução ou leitura de referências serializadas.
3. Preparar tokens de tipografia, cores, espaçamentos, bordas, escala e posicionamento para receber medições futuras. Não preencher valores supostamente originais. Inter é candidata existente, não escolha visual confirmada.
4. Separar conteúdo original criado para a web de referência privada do APK. Nenhum PNG, áudio, fonte extraída, textura, personagem ou bundle do APK entra nos assets distribuídos.
5. Não recriar fluxos comerciais nem estados bloqueados com regras inventadas a partir de nomes IAP. Registrar esses comportamentos como pendentes.

## Captura necessária para fechar a especificação

Quando houver runtime autorizado e disponível, observar o mesmo APK identificado pelo hash: inicialização limpa; menu; seleção de cada categoria; galeria; uma página antes/depois de desenhar; mudança de cor/ferramenta; saída e retorno; abertura de configurações; gate parental e conteúdo bloqueado somente até a observação do estado. Não realizar compra.

Para cada evidência registrar imagem, viewport físico/lógico, orientação, densidade, idioma, estado anterior, ação e estado resultante. Nomear estados por identificador estável. Medir composição, margens, posições, proporções, tipografia, cores, área de toque e estados de interação. Gravar transições para medir duração. Verificar se cortes e reposicionamento decorrem de viewport ou de layout diferente.

## Critério de revisão

Uma alegação visual precisa apontar screenshot ou propriedade serializada decodificada, além do nome do recurso. Uma alegação comportamental precisa de sequência observada ou referência de código identificada. Comparação lado a lado deve usar mesmo viewport e mesmo estado; divergências devem ser registradas por componente. Até essas provas existirem, não declarar fidelidade, equivalência funcional ou reprodução completa.

## Matriz de pendências

| Elemento | Evidência atual | Próxima prova |
|---|---|---|
| Menu e categorias | Nomes de cenas e prefabs | Screenshot e sequência de seleção |
| Galeria | Cena, prefabs Gallery e som de scroll | Layout, paginação, gestos e estado bloqueado |
| Área de desenho | Cena ColoringPage e LoadStrokes | Ferramentas, clipping, traço e persistência |
| Tipografia | Fontes e prefabs nomeados | Texto renderizado e propriedades |
| Navegação | Ícones nomeados | Posição, hitbox e destino |
| Configurações | Recursos de difficulty e switches | Valores, estados e persistência |
| Idioma | Entradas de localização | Copy efetiva pt-BR e fallback |

Esta entrega contém especificação de evidência e direção de verificação, não uma UI inventada. Implementação do jogo permanece com OpenCode/DeepSeek conforme divisão de trabalho.

# Descobertas do APK

Evidência: `coloring-1-116(2).apk`, SHA-256
`1bb17ff5d70eae1a4287d67832deccfc5f24ae23948db4667842756f418d9d95`.
Análise estática em 2026-10-28; não é observação do aplicativo em execução.

## Identidade confirmada

`aapt dump badging` do SDK Android 36.0.0 identificou:

- Pacote `com.bimiboo.coloring`.
- Versão `1.116`, versionCode `746`.
- Rótulo pt-BR: `Coloração`.
- minSdk 22; targetSdk/compileSdk 33.
- Activity de entrada `com.unity3d.player.UnityPlayerActivity`.
- ABIs `arm64-v8a` e `armeabi-v7a`; não há biblioteca x86 no APK.
- Manifest declara INTERNET, billing e permissões de notificações/agendamento.
  Isso não demonstra dependência obrigatória de rede nem comportamento comercial.
- XML da activity declara `screenOrientation` inteiro `0xb` e
  `resizeableActivity=false`; isso ainda não demonstra o layout efetivo em execução.

## Engine e conteúdo

- 197 membros ZIP; APK de 135.423.615 bytes.
- Bundle UnityFS: Unity `2021.3.33f1`.
- IL2CPP `global-metadata.dat`: versão 29.
- Addressables settings: `1.19.19`; catálogo com 578 internal IDs.
- Catálogo referencia seis cenas e nove categorias com 15 prefabs numéricos cada.
- Nomes referentes a paleta, preenchimento, lápis, brilho, padrões, undo e tablet
  existem no metadata; não estão homologados como funcionalidades acessíveis.
- Biblioteca PaintIn3D presente; seus métodos genéricos não provam controles do jogo.

## Reprodutibilidade e limites

`python3 tools/inspect_apk.py` produziu inventário com hash e 212 símbolos candidatos
com offsets. Saídas ficam em `evidence/static/`; são relatórios locais de referência.
O relatório do Astra fica em [design/DESIGN_EVIDENCE.md](design/DESIGN_EVIDENCE.md).
O inventário de catálogo citado pelo Astra é um artefato local excluído do checkpoint
público, junto às imagens originais. Não há screenshot de tela real do jogo.

Não foram decodificados os objetos de cena, texturas ou hierarquias. Não foi executado
o APK; não foram realizadas compras nem acessados serviços proprietários.
Fidelidade funcional/visual e licença dos ativos continuam sem comprovação.

# Impedimentos verificados

| ID | Evidência | Impacto | Recuperação permitida |
|---|---|---|---|
| B01 | `maestri list`, `preset list` e `help`: Connection failed: Operation not permitted | Não ler nota, verificar agentes/presets nem recrutar | Sessão com acesso IPC permitido; não contornar sandbox |
| B02 | OpenCode tentou log fora writable roots; XDG local corrigiu log, mas `models --standalone --print-logs` falha ao iniciar listener de porta 0 | Modelo DeepSeek e executor não confirmados | Ambiente que permita servidor local; não trocar executor |
| B03 | `git ls-remote`: Could not resolve host github.com | Git shell não alcança remoto | Integração GitHub funciona e repo confirmado vazio; publicar por API autorizada |
| B04 | Vercel get_project coloring com scope correto: 403 forbidden; authorize_team_access requer consentimento do titular | Projeto/vínculo Git e deploy não verificáveis | Autorização oficial da conexão ao time; não aprovar pelo usuário |
| B05 | ADB SDK 37.0.1 localizado; daemon não consegue instalar listener: Operation not permitted | Não executar APK nem capturar referência dinâmica | Ambiente Android com ADB acessível |
| B06 | UnityPy/lz4/androguard não importáveis no Python atual; REA MCP não anunciado | Extração e decompilação aprofundada pendentes | Usar ferramentas existentes compatíveis ou instalar no workspace se rede permitir |

Sem credenciais lidas/expostas. Falha gh auth status não prova token expirado:
rede shell indisponível impede validar; integração GitHub separada funciona.
Não repetir tentativas idênticas nem buscar credenciais em fontes não selecionadas.

## Recuperação executada

Diagnóstico direto com mensagens reais, caminho alternativo oficial para GitHub,
XDG local suportado pelo OpenCode e investigação independente do design com Astra.
Conselho DeepSeek depende de B02, logo não foi simulado nem substituído por outros modelos.
Contingência atual: preservar análise e continuidade; não fabricar jogo, testes ou deploy.

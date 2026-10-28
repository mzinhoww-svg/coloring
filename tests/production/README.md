# Smoke de produção (Rabisco)

Verificação HTTP real do deployment publicado. Não faz build, não faz deploy e
não altera produto, `vercel.json`, `package.json`, CI ou o QA existente.

| Arquivo | Papel |
|---|---|
| `scripts/production-smoke.mjs` | CLI do smoke (Node puro, sem dependências) |
| `tests/production/fixtures.mjs` | Site de fixture + servidor HTTP local (headers estilo Vercel e estilo `vite preview`) |
| `tests/production/production-smoke.test.mjs` | `node:test`: sucesso, falhas propositais, redação de segredos, transporte `vercel curl`, `dist/` real |

## Execução

```sh
# Produção pública (fetch anônimo — caminho padrão)
node scripts/production-smoke.mjs https://coloring-woad.vercel.app --strict

# Preview protegido por Vercel Authentication (usa a sessão já existente do CLI)
node scripts/production-smoke.mjs \
  --deployment https://<preview>.vercel.app --vercel-curl

# Preview local do build real
npm run build && npm run preview      # em outro terminal
node scripts/production-smoke.mjs http://localhost:4173

# Variável de ambiente e relatório JSON
PRODUCTION_SMOKE_URL=https://coloring-woad.vercel.app node scripts/production-smoke.mjs --json
```

Flags: `--url`/`--deployment`, `--vercel-curl`, `--strict`, `--timeout <ms>`,
`--retries <n>`, `--no-hash`, `--no-spa`, `--json`, `--quiet`, `--help`.

Códigos de saída: `0` saudável, `1` alguma checagem falhou, `2` uso inválido.

## O que é verificado

1. **Shell** — `/` responde 200 HTML, `#app`, `<title>`, `lang`, `theme-color`,
   link do manifest, e os chunks `assets/*.js|css` realmente carregam com o
   content-type correto.
2. **Web manifest** — JSON válido, `name`/`short_name`/`start_url`/`scope`/
   `display`, ícones acessíveis, tipos de imagem e dimensões PNG declaradas.
3. **Service worker** — `/sw.js` como JavaScript, sem placeholder
   `__OFFLINE_BUILD_VERSION__`, `BUILD_VERSION` legível; em `--strict` exige
   `Cache-Control` não cacheável e `Service-Worker-Allowed`.
4. **Offline manifest** — schema, versão igual à do worker, entradas com
   `url`/`size`/`hash`, shell e chunk JS presentes, e **cada entrada buscada de
   verdade** com tamanho e SHA-256 conferidos.
5. **Assets estáticos** — `Cache-Control: immutable` em `/assets/*`, cache de
   ícones, PNG válido e um asset inexistente que **não** pode devolver o shell.
6. **Fallback SPA** — `/drawing/42` retorna o shell do app.

`--strict` promove avisos a falhas (headers de cache, content-type divergente).
Use `--strict` contra produção; no preview local alguns avisos são esperados.

## Autenticação sem tocar em segredo

`--vercel-curl` executa cada requisição como
`vercel curl <path> --deployment <url> -- --silent --output <tmp> --dump-header <tmp>`
e lê status/corpo do arquivo temporário. O script não lê, não imprime e não
repassa token, cookie ou bypass secret; não desativa Deployment Protection.
Sem a flag, se a resposta for uma página da Vercel Authentication, o smoke para
com `shell.protected` e a instrução de repetir com `--vercel-curl`.

Redação: query string, userinfo e cookies nunca são impressos (`redactUrl`), e
apenas `content-type`, `cache-control` e `service-worker-allowed` aparecem no
relatório.

## Testes

```sh
node --test "tests/production/**/*.test.mjs"
```

Cobrem: deployment saudável em modo `--strict`, asset alterado (hash), ícone
ausente, offline manifest ausente, worker sem stamp, versão divergente,
redação de token na URL, execução no `dist/` real e contrato da CLI.

## Resultados observados (2026-10-28)

| Alvo | Comando | Resultado |
|---|---|---|
| Produção `https://coloring-woad.vercel.app` | `--strict` | **52 pass · 0 warn · 0 fail** |
| Preview `vite preview` local (`dist/`) | padrão | 47 pass · 5 warn · 0 fail (avisos de headers/fallback do preview) |
| Preview Vercel protegido | `--vercel-curl` | endpoints principais OK; ver nota abaixo |

Nota do preview: o host injeta
`<script src="https://vercel.live/.../feedback.js">` no HTML de previews, então
`/index.html` no ar tem 1229 B contra 1066 B do manifest offline e a checagem de
tamanho/SHA falha. Isso **não** se reproduz no alias público (1066 B, SHA ok) e
não é um defeito do app; por isso a referência de produção é o alias público.

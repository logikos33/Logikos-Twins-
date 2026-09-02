# Export do piloto mobile — Claude Design

Export bruto das telas do piloto mobile do Logikos Twins, gerado no Claude Design.
É **material de design/referência**, não código de produção. Nada aqui é buildado
nem importado por `apps/web/`.

Origem: `~/Downloads/Logikos Twins design specs 2/` (export de 02/09/2026).

## Normalização de nomes

Os nomes vindos do Claude Design têm espaços, travessão e acento. Foram normalizados
para serem seguros em git/CI:

| Origem (export) | Destino (repo) |
|---|---|
| `Logikos Twins - Piloto.dc.html` | `Logikos-Twins-Piloto.dc.html` |
| `Twins - Variações.dc.html` | `Twins-Variacoes.dc.html` |
| `Entry.dc.html` `Capture.dc.html` `Job.dc.html` `Viewer.dc.html` `Shared.dc.html` `Admin.dc.html` | mesmo nome |
| `support.js` `viewer-engine.js` `strings.json` `github.md` | mesmo nome |
| `docs/piloto/ui-contract.json` `docs/piloto/handoff.md` | achatados na raiz desta pasta |

Não foram copiados: `fonts/*.woff2` (as oficiais já estão em
`apps/web/src/fonts/`, com nomes e eixos variáveis próprios) e `.thumbnail`.

## O que NÃO vai para produção

- **`support.js`** — runtime da DSL do Claude Design (`sc-if`, bindings `{{ }}`).
  Serve só para o `.dc.html` renderizar fora do editor. A conversão para React
  substitui isso por componentes; o arquivo não entra no bundle.
- **`Twins-Variacoes.dc.html`** — folha de variações/estudos, referência visual.
  Não corresponde a nenhuma rota.
- **`viewer-engine.js`** — carrega three.js por CDN. Produção usa o three.js
  pinado no `package.json` de `apps/web/`. Usar este arquivo como referência de
  comportamento (câmera, controles, render do point cloud), nunca como fonte.

## Verificação de contrato (na data do commit)

- 46/46 `data-plug` do `ui-contract.json` (`screens[].plugs[]`) presentes no DOM
  dos `.dc.html` — 78 ocorrências, 47 valores distintos.
- Zero `data-plug` estático fora do contrato.
- `Viewer.dc.html` é o único com plug dinâmico (`data-plug="{{ rootPlug }}"`) —
  o 47º valor distinto.

## Achados abertos como dívida

1. **Três controles interativos sem `data-plug` e sem proposta no contrato**:
   `tg.pick` (chips de etiqueta na folha do pino, `Viewer`), `ex.go` (exemplos de
   busca, `Viewer` e `Shared`) e `dop.pick` (validade do link — 1/7/30 dias,
   `Viewer`). Nomes sugeridos: `annotate.tag.set`, `search.example`,
   `share.validity.set`. O gate de cobertura reprova nos três.
2. **Divergência de tokens de cor**: o export usa `#3DDC84` (ok) e `#FFB020`
   (atenção), enquanto `apps/web/src/app/globals.css` define
   `--color-success: #2EE6A3` e `--color-warning: #FFB224`. A conversão precisa
   mapear para token, não copiar o hex. `#FF5A36` já bate com `--color-danger`.

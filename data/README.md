# data/

This folder holds the STEMularity index.

| Path | What it is | License |
| --- | --- | --- |
| [`problems/`](problems/) | One `<id>.json` file per problem. | [CC BY 4.0](../LICENSE-CONTENT) |
| [`schema/problem.schema.json`](schema/problem.schema.json) | The JSON Schema that every problem file must match. | [MIT](../LICENSE) |
| [`schema/vocabulary.json`](schema/vocabulary.json) | Labels and definitions for every allowed value. | [MIT](../LICENSE) |

All problems here are made-up samples for now. Each one is marked `"sample": true`. Real data comes later.

## Links only

Sources are links. Never commit copies of papers, PDFs, images, datasets or other files here.

Only `.json` and `.md` files are allowed anywhere under `data/`. The validator reports anything else as an error. The only exceptions are files named `.gitkeep` and `.DS_Store` (macOS Finder creates these; git ignores them).

## Check your changes

```sh
npm run validate
```

Every field and rule is described in [docs/DATA_FORMAT.md](../docs/DATA_FORMAT.md). To add or update a problem, see [CONTRIBUTING.md](../CONTRIBUTING.md).

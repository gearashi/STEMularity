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

Only files whose names end in `.json` or `.md` are allowed anywhere under `data/`. The validator reports any other file as an error. It checks names, not contents, so reviewers still check that nothing is copied in.

The only exceptions are `.gitkeep`, `.DS_Store`, `Thumbs.db` and `desktop.ini` (the last two in any letter case), names that start with `._` or `.#`, Emacs auto-save files such as `#x.json#`, names that end in `~`, and Vim swap files (hidden files whose names end in `.swa` to `.swp`, such as `.x.json.swp`). The validator ignores these files. (`.gitkeep` keeps an empty folder in git; the others are editor and operating-system files, which `.gitignore` keeps out of the repository.)

## Check your changes

```sh
npm run validate
```

Every field and rule is described in [docs/DATA_FORMAT.md](../docs/DATA_FORMAT.md). To add or update a problem, see [CONTRIBUTING.md](../CONTRIBUTING.md).

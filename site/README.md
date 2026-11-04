# The STEMularity website

This folder builds the STEMularity website from the problem files in [`data/problems/`](../data/problems/). The result is a folder of plain files: HTML, CSS, one small script, JSON and an SVG. There is no framework and no server code. The build needs only Node.js 22 and the two packages the validator already uses.

Nothing is deployed yet. To put the site online, see [docs/DEPLOYING.md](../docs/DEPLOYING.md).

## Commands

Run these from the repository root.

| Command | What it does |
| --- | --- |
| `npm run build` | Builds the site into `site/dist/`. |
| `npm run preview` | Builds the site, then serves it at http://127.0.0.1:8788. You can run `npm run build` again while it serves. Stop it with Ctrl+C. |
| `npm test` | Runs all tests, including [`test/site-build.test.mjs`](../test/site-build.test.mjs). |
| `npm run check` | Validates the data, runs the tests, then builds the site. |

You can also run the scripts directly:

```sh
node site/build.mjs [--data <dir>] [--out <dir>]
node site/serve.mjs [--port <n>] [--dir <folder>]
```

- `--data` is the folder that holds `schema/` and `problems/`. The default is `data/`.
- `--out` is the output folder. The default is `site/dist/`. It is deleted and rebuilt on every build.
- `--port` sets the preview port. The `PORT` environment variable works too. The default is 8788.
- `--dir` serves another folder, such as a build made with `--out`.

## How the build works

1. `build.mjs` reads the data with `loadProblems()` from [`scripts/lib/problems.mjs`](../scripts/lib/problems.mjs). The validator uses the same code, so the site and `npm run validate` apply the same rules.
2. If any problem file has an error, the build prints the errors, writes nothing and exits with code 1. Warnings are printed, and the build goes on.
3. [`src/pages.mjs`](src/pages.mjs) renders the pages. All labels and descriptions come from [`data/schema/vocabulary.json`](../data/schema/vocabulary.json).
4. The build writes the pages and the JSON files, then copies the files in [`src/static/`](src/static/) and the two schema files.

The build is deterministic: the same data always gives byte-identical files. Nothing in the output depends on the date, the time or the computer.

## What the build writes

| Path in `site/dist/` | What it is |
| --- | --- |
| `index.html` | The problem list, with search, sorting and filters. |
| `problems/<id>/index.html` | One page per problem, with its progress map. |
| `about/index.html` | What STEMularity is, the open-knowledge pledge, and what every status, checkpoint status, AI effort level, rating and field means. |
| `404.html` | The "page not found" page. |
| `problems.json` | Every problem in one file: `{ "license": "CC-BY-4.0", "count": n, "problems": [...] }`. |
| `problems/<id>.json` | One problem: the same data as `data/problems/<id>.json`, pretty-printed, with `<`, `>` and `&` written as `\u` escapes. The line and paragraph separators U+2028 and U+2029 are escaped too. |
| `schema/problem.schema.json`, `schema/vocabulary.json` | The data format and labels, so the JSON files can be checked and read. |
| `assets/styles.css`, `assets/app.js`, `assets/stemgu.svg` | Styles, the list page's script, and the STEMgu sprite (also the favicon). |
| `_headers` | Security headers for Cloudflare Pages. |
| `.stemularity-build` | A marker that tells the next build it may replace this folder. |

The JSON files are a first, static step toward the API for AI agents in the [roadmap](../docs/ROADMAP.md).

## The source files

| File | What it does |
| --- | --- |
| `build.mjs` | The build command, and `build()` for tests. |
| `serve.mjs` | The local preview server. |
| `src/config.mjs` | The GitHub repository address and branch. Change them here if the repository moves. |
| `src/html.mjs` | `escapeHtml()`, the `html` template tag, and helpers for safe links. |
| `src/format.mjs` | Dates ("March 2019", "430 BCE") and shortened summaries. |
| `src/icons.mjs` | The pixel-art checkpoint markers. |
| `src/layout.mjs` | The header, sample-data banner and footer shared by every page. |
| `src/pages.mjs` | The pages themselves. |
| `src/static/` | Files copied into the output as they are: `_headers`, `assets/styles.css`, `assets/app.js`, `assets/stemgu.svg`. |

## The problem list

`index.html` lists every problem, A to Z, as plain HTML. Without JavaScript you get the full list, the controls are not shown, and a note in their place says that search, sorting and filters need JavaScript. With JavaScript the controls keep their place from the first paint, out of sight until `app.js` has set them up, and the filters start folded (`app.js` opens them on wide screens, or when some are in use), so the list never moves when the controls appear. On wide screens the list always uses the wide right-hand column.

With JavaScript, `assets/app.js` shows the controls: search, sort, sort order, and filters by status and field. It reads the `data-*` attributes on each problem card and never fetches anything. It keeps the current view in the address, so a view can be bookmarked or shared, and the view follows the address when you go Back or Forward:

| Parameter | Values | Default (left out of the address) |
| --- | --- | --- |
| `q` | Search words, matched against the name, other names, category, field, tags and summary. Every word must match, in any order. Hyphens count as spaces, so `protein-folding` also finds "protein folding". | Empty |
| `sort` | `name`, `category`, `effort`, `work-left`, `significance` | `name` |
| `dir` | `asc` or `desc` | `asc`, except `desc` for `significance` |
| `status` | Statuses to show, separated by commas, such as `open,unsolved`. Empty means none. | All |
| `field` | Fields to show, separated by commas, such as `physics,chemistry`. | All |

Unknown values are ignored. Ties are sorted by name, then id. Solved and resolved problems have no ratings, so they always come last when sorting by work left or significance. When nothing matches, a button clears the search and filters, and keeps the sort.

## Rules for changing the site

- **Escape all data.** Problem files will come from public pull requests, so treat every value as untrusted. Build markup with the `html` template tag from `src/html.mjs`, which escapes every value you put in it. Put attribute values in double quotes. Use `externalLink()` for links to other websites: it allows only `http` and `https` addresses and adds `rel="noopener noreferrer"`.
- **No inline scripts or styles.** The Content Security Policy in `src/static/_headers` blocks `<script>` without `src`, `on...=` attributes, `style="..."` attributes and `<style>` elements. Put styles in `styles.css`. If something needs a width, use a class such as `pips-6`.
- **No outside requests.** No web fonts, CDNs, analytics or images from other websites. The policy blocks them too.
- **Relative links.** Pages link to each other and to assets with relative addresses (`../../assets/styles.css`), so the site works at any base path and when opened from disk. The one exception is `404.html`: Cloudflare Pages serves it at whatever address was not found, so its links start at the site root (`/`).
- **Labels come from the vocabulary.** Use `data/schema/vocabulary.json` for the names and meanings of statuses, fields, effort levels and ratings.
- **No line starts with a dot.** In lists such as "Physics · Number theory", put a no-break space before each dot (`SEP` in `src/pages.mjs`), so a line can break only after it.
- **Accessibility.** Keep one `h1` per page, labels on every control, visible focus, status shown as text and not only by color, and WCAG AA contrast in both the light and the dark theme.

The tests in [`test/site-build.test.mjs`](../test/site-build.test.mjs) check most of these rules.

## The output folder is replaced on every build

The build deletes the output folder and creates it again. To make that safe, it refuses to use:

- the repository root, or any folder above it,
- the data folder, a folder inside it, or a folder above it,
- a folder that has files in it but no `.stemularity-build` marker, so it was not made by this build.

A missing or empty folder is fine.

## STEMgu

`src/static/assets/stemgu.svg` is a placeholder: an original 16×16 pixel sprite of a small flask with a face. Replace it when official STEMgu artwork exists. Like other content, STEMgu art is under CC BY 4.0.

## Deploying

The Cloudflare Pages settings are:

- Build command: `npm run build`
- Build output directory: `site/dist`
- Root directory: the repository root (leave the setting blank)

The full steps are in [docs/DEPLOYING.md](../docs/DEPLOYING.md).

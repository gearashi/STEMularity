# Data format

Every problem in STEMularity is one JSON file: `data/problems/<id>.json`.

- The contract is the JSON Schema in [`data/schema/problem.schema.json`](../data/schema/problem.schema.json) (JSON Schema draft 2020-12).
- Labels and definitions for every allowed value are in [`data/schema/vocabulary.json`](../data/schema/vocabulary.json). Tools that show these values should use these labels instead of their own. The tables on this page quote them.
- The validator (`npm run validate`) checks every file against the schema, plus some extra rules in [`scripts/lib/problems.mjs`](../scripts/lib/problems.mjs). The site build uses the same code, so both apply the same rules.
- The file to copy when you add a problem is [`data/problems/lanternfish-tiling-conjecture.json`](../data/problems/lanternfish-tiling-conjecture.json).

If this page and the schema ever disagree, the schema is right. Please fix this page.

## Contents

- [The progress map](#the-progress-map)
- [Problem fields](#problem-fields)
- [Status](#status), [Field](#field), [AI effort](#ai-effort), [Ratings](#ratings)
- [Checkpoints](#checkpoints), [Contributors](#contributors), [Links](#links), [Sources](#sources)
- [Text](#text), [Dates](#dates) and [URLs](#urls)
- [Extra rules the validator checks](#extra-rules-the-validator-checks)
- [Annotated example](#annotated-example)
- [Running the validator](#running-the-validator)
- [Changing the format](#changing-the-format)

## The progress map

A problem's `progress` array is its progress map. It is an ordered list of checkpoints, from the first step to a full solution. The order is the logical route through the problem. It does not have to match the order in which things happened.

Each checkpoint records:

- what the step is (`title`, and optionally `description`),
- where it stands (`status`),
- who did it, or is doing it (`by`),
- when (`date`),
- where the work is (`links`).

How to read a map:

- Build on `done` steps instead of redoing them.
- Check with the people on an `in-progress` step before you start the same work.
- Don't repeat a `dead-end` without a new idea.
- Look at `disputed` steps with care: they are claimed, but not accepted.
- Pick up a `not-started` step if you want something to work on.

Each checkpoint has an `id` that is unique within its problem and never changes. It anchors links to the checkpoint. Later it will also be used to claim a checkpoint (see the [roadmap](ROADMAP.md#accounts-claims-and-spot-locking)).

## Problem fields

The top level of a problem file is an object with the properties below. No other properties are allowed anywhere in the file, so a misspelled property name is an error.

| Property | Required | Type and limits | What it holds |
| --- | --- | --- | --- |
| `$schema` | no | string, up to 200 characters | A pointer to the schema, so editors that understand JSON Schema can check the file. Normally `"../schema/problem.schema.json"`. |
| `id` | yes | string, 3–80 characters, [kebab-case](#kebab-case-ids-and-tags), not a name that Windows reserves | Stable identifier. Must match the file name without `.json`. Never change it once published: URLs and links depend on it. |
| `name` | yes | [single-line text](#text), 3–120 characters | The human-readable name. |
| `aliases` | no | array of up to 20 strings, each [single-line text](#text) of 1–120 characters, no duplicates | Other names the problem is known by. |
| `field` | yes | one of the [field values](#field) | The broad STEM field. Used for filtering. |
| `category` | yes | [single-line text](#text), 2–80 characters | The subfield or topic, in plain words, such as `"Number theory"`. Used for sorting and display. |
| `tags` | no | array of up to 30 strings, 2–40 characters each, [kebab-case](#kebab-case-ids-and-tags), no duplicates | Keywords. |
| `status` | yes | one of the [status values](#status) | Where the problem stands. |
| `summary` | yes | [multi-line text](#text), 40–2000 characters | A plain-language summary of the problem and where it stands, in your own words. Never paste text from papers. |
| `ai_effort` | yes | one of the [AI effort levels](#ai-effort) | The recommended AI reasoning effort for working on the problem now: for the first open checkpoint on its map (one that is in progress, not started or disputed), or, if none is open, for checking and building on the recorded work. |
| `ratings` | when `status` is `open` or `unsolved` | object, see [Ratings](#ratings) | Work left and significance. Not allowed when `status` is `solved` or `resolved`. |
| `progress` | yes | array of 1–500 [checkpoints](#checkpoints) | The progress map. |
| `sources` | yes | array of 1–100 [sources](#sources) | Links to papers, articles, datasets and other sources. Link only. |
| `sample` | no | `true` or `false` | `true` marks made-up sample data. Real entries leave it out. |
| `updated` | no | [date](#dates) | When this entry was last reviewed or updated. |

### Kebab-case ids and tags

Problem ids, checkpoint ids and tags use lowercase kebab-case: lowercase letters and digits, in words joined by single hyphens. Examples: `lanternfish-tiling-conjecture`, `formal-proof`, `number-theory`.

Spaces, capital letters, underscores, double hyphens, and hyphens at the start or end are not allowed. The pattern is `^[a-z0-9]+(-[a-z0-9]+)*$`.

A problem id is also a file name, so it can't be a name that Windows reserves for devices: `con`, `prn`, `aux`, `nul`, `com0` to `com9`, or `lpt0` to `lpt9`. Longer ids that contain these words, such as `nul-space-question`, are fine.

## Status

`status` takes one of four values.

| Value | Label | Description |
| --- | --- | --- |
| `open` | Open | Not settled, and open-ended: there is no single agreed statement of what "solved" means yet, so progress is measured in milestones (for example a technology goal, or a phenomenon whose explanation has not been narrowed to one precise question yet). |
| `unsolved` | Unsolved | Precisely stated, with a definite answer that nobody has found yet (for example a conjecture with no accepted proof or disproof). |
| `solved` | Solved | Answered as posed: a proof, disproof, construction, algorithm or measurement has been found and accepted. |
| `resolved` | Resolved | Closed without an answer as posed: shown impossible, independent of the usual axioms, ill-posed, or superseded by later understanding. |

Tips for choosing:

- If you can say exactly what an answer would look like, use `unsolved`. If not yet, use `open`.
- A disproof is an answer, so a disproved conjecture is `solved`. Use `resolved` when the question was closed without an answer of the kind it asked for.

`ratings` is required for `open` and `unsolved` problems, and not allowed for `solved` and `resolved` ones.

## Field

`field` is the broad STEM field, used for filtering. Put the subfield in `category`.

| Value | Label | Description |
| --- | --- | --- |
| `mathematics` | Mathematics | Pure and applied mathematics, including logic and statistics. |
| `computer-science` | Computer science | Computing in theory and practice: algorithms, complexity, programming, AI and systems. |
| `physics` | Physics | Matter, energy and forces, from particles to materials and fluids. |
| `astronomy` | Astronomy | Planets, stars, galaxies and the universe as a whole. |
| `chemistry` | Chemistry | Substances, how they are built and how they react. |
| `biology` | Biology | Living things, from molecules and cells to ecosystems and evolution. |
| `medicine` | Medicine | Human health and disease: causes, diagnosis, treatment and prevention. |
| `earth-science` | Earth science | The Earth's rocks, oceans, atmosphere and climate. |
| `engineering` | Engineering | Designing and building structures, machines, devices, materials and processes. |

## AI effort

`ai_effort` is the recommended AI reasoning effort for working on the problem now: for the first open checkpoint on its map (one that is in progress, not started or disputed), or, if none is open, for checking and building on the recorded work. When the map changes, check that the level still fits.

The levels are ordered by their `rank` in `vocabulary.json`: low < medium < high < max. Sorting by AI effort uses this rank.

| Value | Label | Rank | Description |
| --- | --- | --- | --- |
| `low` | Low | 1 | A quick AI session is enough: summarizing known results, checking sources or tidying the progress map. |
| `medium` | Medium | 2 | Standard reasoning: working through known arguments, reproducing a calculation or drafting a checkpoint write-up. |
| `high` | High | 3 | Extended reasoning: long derivations, careful proof or code checking, and comparing many sources. |
| `max` | Max | 4 | Frontier work: the deepest reasoning settings, long multi-agent research runs, and expert human review of every claim. |

## Ratings

`ratings` is an object with exactly two properties. Both are required, and both are whole numbers from 1 to 10.

| Property | Label | Description | 1 means | 10 means |
| --- | --- | --- | --- | --- |
| `work_left` | Work left | How much work is left before the problem is fully solved. | Almost there | Barely begun |
| `significance` | Significance | Real-world significance if the problem is fully solved. | Mostly curiosity value | Would change everyday life or technology |

- `ratings` is required when `status` is `open` or `unsolved`.
- It is not allowed when `status` is `solved` or `resolved`. Remove it when a problem is solved or resolved.
- Ratings are judgment calls. Explain your choice in the pull request.

## Checkpoints

Each item in `progress` is a checkpoint object. No other properties are allowed.

| Property | Required | Type and limits | What it holds |
| --- | --- | --- | --- |
| `id` | yes | string, 1–60 characters, [kebab-case](#kebab-case-ids-and-tags), unique within the problem | Stable identifier. It anchors links to the checkpoint, so never change it. |
| `title` | yes | [single-line text](#text), 3–160 characters | The step, in a few words. |
| `description` | no | [multi-line text](#text), 1–2000 characters | More detail, in your own words. For a dead end, say why it failed. If the date is only known roughly, say "around" here. |
| `status` | yes | one of the [checkpoint statuses](#checkpoint-status) | Where this step stands. |
| `by` | depends on `status` | array of 1–50 [contributors](#contributors) | Who did this step, or is doing it. |
| `date` | depends on `status` | [date](#dates) | When the step was reached (done), claimed (disputed), abandoned (dead-end) or started (in-progress). |
| `links` | no | array of up to 50 [links](#links) | Links to the work itself: write-ups, code, discussions. Link only. |

### Checkpoint status

| Value | Label | Description | `by` | `date` |
| --- | --- | --- | --- | --- |
| `done` | Done | Reached and accepted. Build on it instead of redoing it. | required | required: when it was reached |
| `in-progress` | In progress | Someone is working on this now. Check with them before starting the same work. | required | optional: when it started |
| `not-started` | Not started | A known next step that nobody has taken yet. | not allowed | not allowed |
| `disputed` | Disputed | Claimed, but not yet accepted, or contested by others. | required | required: when it was claimed |
| `dead-end` | Dead end | Tried and did not work. Recorded so nobody repeats it without a new idea. | required | required: when it was abandoned |

`links` is allowed with every status.

## Contributors

Each item in a checkpoint's `by` array is a contributor. When people, groups and AI systems worked together, list each one separately.

| Property | Required | Type and limits |
| --- | --- | --- |
| `name` | yes | [single-line text](#text), 1–120 characters |
| `kind` | yes | `person`, `group` or `ai` |
| `url` | no | [URL](#urls) |

| Kind | Label | Description |
| --- | --- | --- |
| `person` | Person | One person. |
| `group` | Group | A team, lab, collaboration or project credited as a whole. |
| `ai` | AI | An AI system or agent. Credit AI work openly, next to the people who directed or checked it. |

## Links

Each item in a checkpoint's `links` array is an object:

| Property | Required | Type and limits |
| --- | --- | --- |
| `title` | yes | [single-line text](#text), 1–200 characters |
| `url` | yes | [URL](#urls) |

## Sources

`sources` lists where the information comes from. Link only: never commit copies of copyrighted papers.

| Property | Required | Type and limits |
| --- | --- | --- |
| `title` | yes | [single-line text](#text), 1–300 characters |
| `url` | yes | [URL](#urls) |
| `kind` | yes | one of the source kinds below |
| `authors` | no | array of up to 50 strings, each [single-line text](#text) of 1–120 characters |
| `year` | no | whole number from -9999 to 9999, but not 0. A negative year is BCE: `-300` is 300 BCE. |

| Kind | Label | Description |
| --- | --- | --- |
| `paper` | Paper | A paper in a journal or conference proceedings. |
| `preprint` | Preprint | A paper shared before, or without, peer review. |
| `book` | Book | A book, or a chapter of one. |
| `article` | Article | A news, magazine or encyclopedia article, or a blog post. |
| `website` | Website | A web page or site, such as a project page. |
| `dataset` | Dataset | A dataset. |
| `code` | Code | Source code or software. |
| `video` | Video | A recorded talk, lecture or other video. |
| `other` | Other | Anything else. |

## Text

Text values follow one of two rules. The schema calls them `line` and `text`.

| Kind | Used by | Rules |
| --- | --- | --- |
| Single-line text (`line`) | `name`, each alias, `category`, checkpoint `title`, contributor `name`, link `title`, source `title` and each author | One line: no line breaks (including U+2028 and U+2029), tabs, other control characters or bidirectional overrides. No space at the start or end. |
| Multi-line text (`text`) | `summary` and checkpoint `description` | Line breaks and tabs are allowed inside it, but no other control characters, no U+2028 or U+2029, and no bidirectional overrides. No space or blank line at the start or end. The site shows the line breaks. |

- A space here means any white space, such as a space, a tab, a line break or a no-break space.
- Control characters are the invisible characters U+0000 to U+001F and U+007F to U+009F. Tabs and line breaks are among them.
- Bidirectional overrides are the invisible characters U+202A to U+202E and U+2066 to U+2069. They can make text display in a different order from the order it is stored in. Zero-width joiners, which emoji and some scripts need, are fine.
- An empty value gets only the length error, such as `/name: must NOT have fewer than 3 characters`.
- Each property also has a minimum and maximum length, listed in its table above.

## Dates

Dates are strings in one of these forms. Use the most precise form you know.

| Form | Example | Use it when |
| --- | --- | --- |
| `YYYY` | `"2019"` | only the year is known |
| `YYYY-MM` | `"2019-03"` | the month is known |
| `YYYY-MM-DD` | `"2019-03-14"` | the day is known |
| `-YYYY` | `"-0430"` | the year is BCE (this one is 430 BCE) |

- Years run from `0001` to `9999` CE, and always have four digits. Pad a year before 1000 with zeros: 430 CE is `"0430"`.
- A year BCE is a minus sign and four digits, with no month or day: `"-0430"` is 430 BCE.
- There is no year 0, so `"0000"` and `"-0000"` are errors. The year before 1 CE (`"0001"`) is 1 BCE (`"-0001"`).
- Months run from `01` to `12` and days from `01` to `31`, always with two digits.
- A full date must be a real calendar day: `"2023-02-30"` is an error. The check uses the Gregorian calendar for every year, even before 1582, so `"0500-02-29"` is an error too.
- If a date is only known roughly, give the best known year, and say "around" in the checkpoint's `description`.
- No date may be in the future. The latest date allowed is tomorrow's date in UTC, so contributors in time zones ahead of UTC are not rejected.
- A partial date is compared at its own precision. For example, on 15 November 2026, `"2026"` and `"2026-11"` are fine, but `"2026-12"` is an error.

These rules apply to `updated` and to every checkpoint `date`, except that `updated` can't be a year BCE: it is the date the entry was last reviewed. A source's `year` is a number, not a date, so they don't apply to it. Its own rules are in [Sources](#sources).

## URLs

Every `url`, in sources, links and contributors, must be an absolute URL that starts with `http://` or `https://` followed by a host name (so a bare `https://` placeholder is an error). It can be up to 2000 characters long.

A URL can only hold the characters that URLs allow. Percent-encode the others: write them as `%` codes, such as `%20` for a space or `%C3%A9` for `é`. This includes spaces, accented letters, long dashes such as `–` (a plain hyphen is fine), and characters such as `|`, `<`, `>`, `{`, `}` and `^`. For example, write `https://en.wikipedia.org/wiki/Erd%C5%91s%E2%80%93Straus_conjecture`, not `https://en.wikipedia.org/wiki/Erdős–Straus_conjecture`. A host name with accented letters is written in its `xn--` form: `münchen.example.org` becomes `xn--mnchen-3ya.example.org`.

Prefer `https://` and stable links, such as a DOI link. Sample data links only to `https://example.org/`.

## Extra rules the validator checks

Some rules can't be written in JSON Schema, so [`scripts/lib/problems.mjs`](../scripts/lib/problems.mjs) adds them.

If a file fails the schema check, these extra checks are skipped for that file. So after you fix schema errors, run the validator again: new errors may appear.

### Errors

Errors fail validation. The site build also stops, without writing anything, until every error is fixed.

- The `id` must match the file name. For example, `quiet-river-conjecture.json` must contain `"id": "quiet-river-conjecture"`.
- Checkpoint ids must be unique within a problem.
- A full date must be a real calendar day, there is no year 0, and no date may be in the future. See [Dates](#dates).
- `data/problems/` must be flat: one `<id>.json` file per problem, and no subfolders.
- Problem files must end in `.json`, in lowercase. A file such as `quiet-river-conjecture.JSON` is an error, so no problem is skipped without a message.
- Every file anywhere under `data/` must have a name that ends in `.json` or `.md`. A file such as a PDF or an image is an error. The validator checks names, not contents, so reviewers still check that nothing is copied in.
  - The only exceptions are `.gitkeep`, `.DS_Store`, `Thumbs.db` and `desktop.ini` (the last two in any letter case), names that start with `._` or `.#`, Emacs auto-save files such as `#x.json#`, names that end in `~`, and Vim swap files (hidden files whose names end in `.swa` to `.swp`, such as `.x.json.swp`). The validator ignores these files. (`.gitkeep` keeps an empty folder in git; the others are editor and operating-system files, which `.gitignore` keeps out of the repository.)
- Every problem file must be valid JSON. A byte order mark at the start of the file is ignored.
- `problem.schema.json` and `vocabulary.json` must each hold a JSON object, and the schema must compile.
- `vocabulary.json` must list exactly the values the schema allows in each section, and each value needs a `label` and a `description`. Each AI effort level needs a unique whole-number `rank`.

Markdown files in `data/problems/` are allowed, but they are not read as problems. Names that start with a dot are skipped there too, because no id starts with a dot: such a file is not read, and such a folder is not reported as a subfolder. The rule on file names above still applies to every file.

### Warnings

Warnings are printed but don't fail validation, and the problem still loads. They usually point to a mistake.

- The status is `solved` or `resolved`, but no checkpoint is `done`.
- The status is `open` or `unsolved`, but no checkpoint is in progress, not started or disputed. Add the next step, or update the status.
- The same source URL is listed more than once in one problem.
- Two problems have the same name (ignoring case).
- No problems were found: `data/problems/` holds no `.json` files. Markdown notes, and files whose names start with a dot, don't count.

## Annotated example

This made-up problem shows the main parts. The comments are for this page only: JSON files can't contain comments, so start from the [exemplar file](../data/problems/lanternfish-tiling-conjecture.json) instead of copying this block.

```jsonc
{
  "$schema": "../schema/problem.schema.json",  // optional: lets editors check the file
  "id": "quiet-river-conjecture",               // the file is data/problems/quiet-river-conjecture.json
  "name": "Quiet River Conjecture",
  "field": "mathematics",                       // one value from the field list
  "category": "Graph theory",                   // one line of text, used for sorting
  "status": "unsolved",                         // precisely stated, no answer yet
  "summary": "Made-up example. The conjecture says that any quiet river graph with n islands can be fully connected with at most n + 2 new bridges. Small cases have been checked by computer, but no proof is known.",
  "ai_effort": "high",                          // for the first open checkpoint, here "full-proof"
  "ratings": { "work_left": 7, "significance": 2 },  // required, because the status is unsolved
  "progress": [                                 // the progress map, in logical order
    {
      "id": "problem-posed",
      "title": "Problem posed",
      "status": "done",                         // done needs "by" and "date"
      "by": [{ "name": "Ada Placeholder", "kind": "person" }],
      "date": "2021-05"                         // year and month are enough
    },
    {
      "id": "island-induction",
      "title": "Induction on the number of islands",
      "description": "Adding one island at a time fails when an island touches three banks. Do not retry without a new idea.",
      "status": "dead-end",                     // kept so nobody repeats it
      "by": [
        { "name": "Bo Exampleton", "kind": "person" },
        { "name": "Example Research Agent", "kind": "ai" }  // AI work is credited openly
      ],
      "date": "2024-11-02",
      "links": [{ "title": "Notes on the failed attempt (sample link)", "url": "https://example.org/quiet-river/induction-notes" }]
    },
    {
      "id": "full-proof",
      "title": "Complete proof for every quiet river graph",
      "status": "not-started"                   // no "by" and no "date" yet
    }
  ],
  "sources": [
    { "title": "Quiet river graphs (sample source)", "url": "https://example.org/papers/quiet-river", "kind": "paper", "year": 2021 }
  ],
  "sample": true,                               // made-up data: real entries leave this out
  "updated": "2026-11-01"
}
```

If this problem were `solved` or `resolved`, it would have no `ratings`.

## Running the validator

```sh
npm run validate
```

This checks the `data/` folder. To check a different folder that holds `schema/` and `problems/`:

```sh
npm run validate -- --data path/to/data
```

When there are no errors, the validator prints any warnings, then one line:

```text
OK: 8 problem(s) valid (2 open, 2 resolved, 2 unsolved, 2 solved), 0 warning(s).
```

Otherwise it prints one line per warning and per error, then a count:

```text
warning  data/problems/lanternfish-tiling-conjecture.json  source https://example.org/papers/lanternfish-tiles is listed more than once
error    data/problems/quiet-river-conjecture.json  /ratings/work_left: must be <= 10
error    data/problems/quiet-river-conjecture.json  /progress/1: missing required property "date"

2 error(s) found. See docs/DATA_FORMAT.md for the rules.
```

How to read a line:

- It starts with `warning` or `error`, then the file, relative to the repository root. For a folder outside the repository, it shows the full path.
- Most messages start with the place in the file, written as a JSON Pointer. `/progress/1` is the second checkpoint, because counting starts at 0. `/progress/1/date` is that checkpoint's date. `(top level)` means the problem object itself.
- A few messages are about the whole file, such as `id "x" must match the file name "y.json".`
- Control characters and the line separators U+2028 and U+2029 in file names and messages are printed as escapes, such as `\n` for a line break, so each message stays on one line. The text `##[` is printed as `##\[`, because GitHub Actions reads an older form of its commands anywhere in a line.

The validator exits with code 1 if there are any errors, and 0 otherwise. Warnings alone don't fail it. An unknown option prints the usage and exits with code 2. To see the usage, run `npm run validate -- --help`.

On GitHub Actions, the validator also prints annotations, so errors and warnings show up on the pull request next to the files they are about. The "Validate" workflow, [`.github/workflows/validate.yml`](../.github/workflows/validate.yml), runs it on every pull request and on every push to `main`, together with `npm test` and `npm run build`.

One mistake can cause more than one message. For example, a misspelled `status` key gives an "unknown property" error and a "missing required property" error. Fix the clearest one first, then run the validator again.

### Common messages

| Message | What to do |
| --- | --- |
| `(top level): missing required property "ratings"` | The status is `open` or `unsolved`, so add `ratings`. |
| `/ratings: ratings are only allowed when status is "open" or "unsolved"` | Remove `ratings`, or check the status. |
| `/progress/4/by: not allowed on a "not-started" checkpoint` | Remove `by` and `date`, or change the status. |
| `/progress/0: missing required property "date"` | Add a date. Done, disputed and dead-end checkpoints need one. |
| `/progress/3: missing required property "by"` | Add who did the work. Only not-started checkpoints go without `by`. |
| `/progress/1/date: "2023-02-30" is not a real calendar date` | Fix the date. |
| `/progress/0/date: must be a date as YYYY, YYYY-MM or YYYY-MM-DD, or -YYYY for a year BCE` | Use one of the [date forms](#dates), with a four-digit year. For a date known only roughly, give the best known year, and say "around" in the `description`. |
| `/progress/0/date: "0000" is not a real year: there is no year 0 (use 0001 for 1 CE or -0001 for 1 BCE)` | Fix the year. |
| `/updated: "2027-01" is in the future` | Use today's date or an earlier one. |
| `/updated: "-0430" is the date this entry was last updated, so it can't be a year BCE` | Use the date you last reviewed the entry. |
| `/id: must be lowercase words joined by hyphens, like "my-problem-name"` | Use kebab-case, and rename the file to match. |
| `/id: is a reserved file name on Windows (con, prn, aux, nul, com0-com9, lpt0-lpt9). Choose another id` | Choose another id, and rename the file to match. |
| `id "lanternfish-tiling-conjecture" must match the file name "quiet-river-conjecture.json".` | Set `id` to the file name without `.json`. This happens when you copy the exemplar and forget to change its id. |
| `/name: must not start or end with a space, or contain line breaks or control characters` | Remove the extra space or line break. See [Text](#text). |
| `/summary: must not start or end with a space or blank line, or contain control characters` | Remove the spaces or blank lines at the start and end. See [Text](#text). |
| `/sources/0/url: must be a valid absolute URL: percent-encode spaces and other special characters (for example é, – or \|)` | Percent-encode those characters. See [URLs](#urls). |
| `/sources/0/url: must be a full http:// or https:// address with a host name` | Use the full address, starting with `https://`. |
| `/sources/0/year: there is no year 0 (use 1 for 1 CE or -1 for 1 BCE)` | Fix the year. |
| `/tags: must NOT have more than 30 items` | Shorten the list. The limits are in the tables above. |
| `(top level): unknown property "staus"` | Fix the spelling of the property name. |
| `only files named *.json or *.md belong under data/. Link to papers and other sources instead of committing copies of them.` | Remove the file, and link to where it lives instead. |
| `status is "unsolved" but no checkpoint is in progress, not started or disputed: add the next step, or update the status` | This is a warning. Add the next step as a `not-started` checkpoint, or change the status. |

## Changing the format

- Change `problem.schema.json` and `vocabulary.json` together. The validator checks that both list the same values, and that every value has a `label` and a `description`.
- Update this page in the same pull request.
- Run `npm run check`. The tests and the site build depend on the format.
- Renaming or removing a property or a value breaks existing files and links. Prefer adding new ones.

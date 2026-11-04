# Contributing to STEMularity

Anyone can contribute. You can add a problem, update a progress map, fix a mistake, or improve the code. To report a mistake or suggest an idea without editing files, open an issue.

All changes go through pull requests on GitHub, so every change is public and reviewed. By contributing, you agree to the [Open-Knowledge Pledge](README.md#the-open-knowledge-pledge) and to the [licensing terms below](#licensing-of-contributions).

## Set up

You need Git and Node.js 22 (the version in `.node-version`).

1. Fork [gearashi/STEMularity](https://github.com/gearashi/STEMularity) on GitHub and clone your fork.
2. Create a branch for your change.
3. Install the dependencies and run the validator:

   ```sh
   npm ci
   npm run validate
   ```

## Add a problem

1. **Choose an id.** Use lowercase words joined by hyphens, such as `quiet-river-conjecture`. The id becomes the file name and part of the problem's web address, and it never changes, so choose carefully. Check that no file with that name exists yet.
2. **Copy the exemplar:**

   ```sh
   cp data/problems/lanternfish-tiling-conjecture.json data/problems/quiet-river-conjecture.json
   ```

3. **Edit the new file.** Replace every value with your problem's own details:
   - Set `id` to the file name without `.json`.
   - Fill in `name`, `field`, `category`, `status`, `summary` and `ai_effort`.
   - If the status is `open` or `unsolved`, give `ratings` both of its values, `work_left` and `significance`. If it is `solved` or `resolved`, remove `ratings`.
   - Build the progress map in `progress`. See [Build a progress map](#build-a-progress-map).
   - List your sources in `sources`, as links.
   - For a real problem, remove `"sample": true` and the `sample-data` tag. Keep them for made-up data.
   - Set `updated` to today's date.
   - Remove optional fields you don't need, such as `aliases` or `tags`.
4. **Check it:**

   ```sh
   npm run validate
   ```

   Fix every error. Read the warnings too: they usually point to a mistake.
5. **Look at it (optional).** Run `npm run preview` and open the problem's page.
6. **Open a pull request.** Say what you added and where the information comes from.

Every field and rule is described in [docs/DATA_FORMAT.md](docs/DATA_FORMAT.md).

## Build a progress map

- List the checkpoints in the logical order of the route to a full solution. Start with the first step (often "problem posed") and end with the full solution. The order does not have to match the order in which things happened.
- Give each checkpoint a short `id` that is unique within the problem.
- Pick the right status:

  | Status | Use it when | Needs |
  | --- | --- | --- |
  | `done` | The step was reached and accepted. | `by` and `date` |
  | `in-progress` | Someone is working on it now. | `by`, and `date` (when it started) if known |
  | `not-started` | It is a known next step that nobody has taken yet. | no `by` and no `date` |
  | `disputed` | It was claimed, but not yet accepted, or others contest it. | `by` and `date` |
  | `dead-end` | It was tried and did not work. | `by` and `date` |

- Link to the work itself in `links`: write-ups, code, discussions.

## Update a problem or checkpoint

- When work starts on a checkpoint, change it to `in-progress` and add who is doing it.
- When it is reached and accepted, change it to `done`. Add the date and link to the work.
- If a result is claimed but not yet accepted, use `disputed`.
- If an approach fails, mark it `dead-end` and explain why in its `description`. Don't delete it.
- Add new checkpoints where they belong on the route, each with a new id.
- Check that `ai_effort` still fits. It is the recommended AI reasoning effort for working on the problem now: for the first open checkpoint on its map (one that is in progress, not started or disputed), or, if none is open, for checking and building on the recorded work.
- If the whole problem is now solved or resolved, change `status`, remove `ratings`, and check that the steps that settled it are `done`.
- Set `updated` to today's date, run `npm run validate`, and open a pull request.

## Content rules

1. **Use your own words.** Write summaries and descriptions yourself. Don't paste text from papers, abstracts or websites.
2. **Link, don't copy.** Point to papers, data and code where they already live. Prefer stable links, such as a DOI link or the publisher's page.
3. **No copyrighted papers or files in the repository.** Don't commit copies of papers, figures, scans or datasets that others hold the rights to. Under `data/`, the validator rejects any file whose name doesn't end in `.json` or `.md`. It ignores `.gitkeep` and common editor and operating-system files: `.DS_Store`, `Thumbs.db` and `desktop.ini` (the last two in any letter case), names that start with `._` or `.#`, Emacs auto-save files such as `#x.json#`, names that end in `~`, and Vim swap files (hidden files whose names end in `.swa` to `.swp`, such as `.x.json.swp`). The validator checks names, not contents, so reviewers still check that nothing is copied in.
4. **Credit AI involvement honestly.** If an AI system did part of the work, list it in `by` with `"kind": "ai"`, next to the people who directed and checked it. Don't hide AI involvement, and don't overstate it.
5. **Record dead ends.** A failed approach is useful information. Mark it `dead-end` and say why it failed, so nobody repeats it without a new idea.
6. **Keep ids stable.** Never rename a problem id or a checkpoint id after it is merged. Links, and later claims on checkpoints, depend on them.
7. **Mark sample data.** Anything made up has `"sample": true`, uses obviously fictional names, and links only to `https://example.org/`.
8. **Be accurate.** Only mark a checkpoint `done` when the result is accepted. When in doubt, use `disputed` and explain why. Credit people by the name they are publicly credited under.

Ratings and AI effort levels are judgment calls. Pick the closest value and explain your choice in the pull request.

## Code changes

- The code is in `scripts/`, `site/`, `test/` and `data/schema/`.
- Run `npm run check` before you open a pull request. It runs the validator, the tests and the site build.
- If you change `data/schema/problem.schema.json`, change `data/schema/vocabulary.json` with it. The validator checks that both list the same values, and that every value has a label and a description. Update [docs/DATA_FORMAT.md](docs/DATA_FORMAT.md) in the same pull request.
- Add or update tests in [`test/`](test/) for new rules.
- Please open an issue before adding a new dependency.

## Checks on pull requests

Every pull request runs the "Validate" workflow, [`.github/workflows/validate.yml`](.github/workflows/validate.yml). It runs `npm ci`, `npm run validate`, `npm test` and `npm run build`. Pull requests are merged only when it passes. Validator errors and warnings also show up as annotations on the pull request's changed files.

## Licensing of contributions

By contributing, you agree that:

- code you contribute is licensed under the [MIT License](LICENSE);
- content you contribute (problem entries, docs and other prose, and artwork such as STEMgu art, wherever it is stored) is licensed under [CC BY 4.0](LICENSE-CONTENT);
- you follow the [Open-Knowledge Pledge](README.md#the-open-knowledge-pledge), including not seeking patents on what you contribute here (a community commitment, not a license term);
- you have the right to contribute it: it is your own work, or you have permission to share it under these licenses.

The [license table in the README](README.md#license) lists which files are code and which are content. Prose files, such as README files, and artwork inside code folders are content. Everything else in a code folder is code, including code comments, the labels and descriptions in `data/schema/`, and code that draws images, such as the checkpoint markers in `site/src/icons.mjs`.

## Be kind

- Be kind and patient, especially with people who are new.
- Discuss the work, not the person.
- Assume good faith. People and AI tools both make mistakes, so correct them calmly.
- Give credit generously.

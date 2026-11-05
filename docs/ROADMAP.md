# Roadmap

This is a stub. It lists the pieces planned after the foundation. None of them is built yet, and the details will change as the project learns more.

Ideas and comments are welcome. Open an issue or a pull request.

## Done so far

- The repository layout, the README, the [Open-Knowledge Pledge](../README.md#the-open-knowledge-pledge), and the licenses: MIT for code and CC BY 4.0 for content.
- The data format: a JSON Schema, a vocabulary with labels and definitions for every allowed value, and one file per problem. See [DATA_FORMAT.md](DATA_FORMAT.md).
- A validator, tests, and a GitHub Action that runs them on every pull request.
- 8 made-up sample problems.
- A static website starter in [`site/`](../site/): a sortable, filterable list of problems, a page for each problem with its progress map, and a `problems.json` export. It is not deployed yet. See [DEPLOYING.md](DEPLOYING.md).
- GitHub issue forms for reporting progress and suggesting problems. Every problem page and checkpoint links to the progress form with the problem filled in. See [CONTRIBUTING.md](../CONTRIBUTING.md#report-progress-in-an-issue). The forms add the labels `progress-update` and `new-problem`, which must exist in the repository: GitHub skips labels that don't.

## From issues to progress maps

**Status:** Not started

**Goal:** Most updates arrive as GitHub issues: someone reports a result, a failed attempt or a new source, with links. Make turning those reports into changes to the problem files fast and reliable, so the maps stay current as the community posts.

**Rough scope:**

- A GitHub Action that reads a progress report and drafts the change: a pull request that edits the problem's file, or a comment with a suggested change. The "Validate" workflow checks it, and a person reviews and merges it. A pull request opened with the workflow's default `GITHUB_TOKEN` does not start other workflows, so the Action needs a GitHub App token, or a maintainer has to start the checks.
- Optionally, an AI agent drafts the change from the report and the work it links to. Every pull request still gets a human review.
- More labels and a triage routine, such as `needs-source` and `duplicate`.
- Show on each problem page the open reports about it, and on each checkpoint the issues that changed it.

**Open questions:**

- How much evidence is needed before a step is marked `done`? A link to a published result, a second confirmation, or a maintainer's judgment?
- How do we handle spam and low-quality reports?
- Security: the automation reads untrusted issue text. Keep any secrets, such as an AI model's API key or a token for opening pull requests, away from the steps that read that text, give each job the least permissions it needs, and never run anything taken from an issue.
- How do we credit the people who report progress, as well as the people who did the work?

## Accounts, claims and spot locking

**Status:** Not started

**Goal:** Let people claim a checkpoint, so others can see that someone is working on it and don't start the same work.

**Rough scope:**

- Accounts for people who want to write. Reading stays free, with no account.
- Claim a checkpoint by its `id`. A claimed checkpoint shows as `in-progress`, with who claimed it and since when.
- Claims expire unless they are renewed, so a forgotten claim doesn't block anyone for long.
- Release a claim, or hand it over to someone else.
- Keep the history of claims open.
- Until this exists, a progress report with the "Work has started on a step" option is the way to say you are working on a step.

**Open questions:**

- How long should a claim last, and how is it renewed?
- Can several people or teams claim the same checkpoint, for parallel attempts?
- Where do claims live: in the repository, through pull requests, or in a separate service?
- How do AI agents claim work on behalf of a person?
- How do we prevent spam claims?

## Upload work

**Status:** Not started

**Goal:** Let people attach their work to a checkpoint: write-ups, code, data and AI transcripts.

**Rough scope:**

- Attach files or links to a checkpoint.
- A review and verification step before a checkpoint is marked `done`.
- Copyrighted work stays link-only. Uploads must be the uploader's own work, or openly licensed.
- Choose the license when uploading. The defaults are CC BY 4.0 for content and MIT for code.
- AI transcripts say which AI system was used, so credit stays honest.

**Open questions:**

- Where are files stored? The repository allows only `.json` and `.md` files under `data/`.
- Who reviews uploads, and what counts as verified?
- What size limits and file formats make sense?
- How do we keep personal details out of shared AI transcripts?

## AI-agent API

**Status:** Not started

**Goal:** Let AI agents read and search the problems and their progress maps, and propose checkpoint updates.

**Rough scope:**

- Step zero already exists: the site build writes the whole index to one static `problems.json` file.
- Search problems by text, field, status and ratings, and fetch one problem with its progress map.
- Propose checkpoint updates for review. Agents never change the index directly.
- Maybe an MCP server, so AI tools can use STEMularity directly.
- Reading stays free, with no account.

**Open questions:**

- Are static files enough, or is a hosted API needed?
- How are proposed updates reviewed?
- How do agents sign in to propose changes, and how is their work credited?
- How do we version the API and the data format?

## Browser extension

**Status:** Not started. The code will live in [`extension/`](../extension/).

**Goal:** Link Claude and ChatGPT to STEMularity, so a chat about a known problem starts from what is already done.

**Rough scope:**

- Recognize when a chat is about a problem in the index.
- Show that problem's progress map next to the chat.
- Add context to the chat when you ask: what is done, what is in progress, and which dead ends to avoid.
- Help report results back as a proposed checkpoint update.
- Opt-in and privacy-first. It does nothing until you turn it on, and nothing from your chats leaves your browser unless you choose to send it.

**Open questions:**

- Can it match chats to problems on your own computer, without sending chat text anywhere?
- Which browsers come first?
- What is the smallest set of browser permissions it needs?
- How does it keep working when the chat sites change their pages?

## Project: STEMularity offline app

**Status:** Not started. The code will live in [`app/`](../app/).

**Goal:** The whole index, offline, in an app with a 90s encyclopedia CD-ROM look, SNES-style pixel art, and STEMgu as the guide.

**Rough scope:**

- Bundle the whole index, so you can browse and search it without an internet connection.
- A 90s encyclopedia CD-ROM look, with SNES-style pixel art.
- STEMgu guides you around the app.
- Sync new data when you are online.
- Easy to use with a keyboard, with readable text.

**Open questions:**

- A desktop app, an installable web app, or both?
- How big will the index get, and how do updates download?
- Who makes the pixel art? It must be original work. Artwork is content, licensed under CC BY 4.0 wherever it is stored, but code that draws images is code, under MIT (see the [license table](../README.md#license)).
- How do we keep the retro look accessible?

## Also later

- **Real data import.** Replace the made-up samples with real problems, with sources and review.
- **Review and verification.** A clear process for accepting checkpoints as `done` and for settling `disputed` ones.
- **Official STEMgu art.** Replace any placeholder art with the official design. [DESIGN.md](DESIGN.md) says where it goes and what rules it must follow.
- **Translations.** The site, the docs and the problem summaries in more languages.

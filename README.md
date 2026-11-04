# STEMularity

STEMularity is an open index of every open, unsolved, solved and resolved STEM problem.

Each problem has a progress map: an ordered list of checkpoints. The map shows what has been done, what is being worked on, what failed, and what is still left. The goal is that people using AI on STEM problems don't redo work that is already done.

> **Status:** foundation only. The index holds 8 made-up sample problems. Nothing is deployed or published yet.

## Who it is for

- Researchers, students and hobbyists who use AI tools to work on science, technology, engineering and math problems.
- Anyone who wants to know where a problem stands before spending time on it.
- AI agents and tools. They can read the plain JSON files today, and an API is planned.

## Meet STEMgu

STEMgu is the STEMularity mascot. STEMgu will be your guide in the offline app planned for later.

Official artwork is still to come. Until then, any STEMgu art in this repository is an original placeholder, and it is labeled as one.

## Project status

- This is the foundation: the data format, a validator, tests, a website starter and these docs.
- The index holds 8 made-up sample problems. Each one is marked `"sample": true`, uses fictional names, and links only to `example.org`. Real data comes later.
- Nothing is deployed or published yet. There is no live website.

## The Open-Knowledge Pledge

STEMularity is open knowledge. Everyone who works on the project makes these commitments.

### No gatekeeping

- **Free to read.** Reading never needs an account, a payment or a sign-up.
- **Bulk downloads.** The whole index is plain JSON in this repository. Clone it, or download it as a ZIP, to get everything at once. The site build also writes every problem into one `problems.json` file.
- **Open formats.** Problems are JSON files, the format is a JSON Schema, and the docs are Markdown.
- **Anyone can contribute.** Changes go through public pull requests.
- **Credit for everyone.** Each checkpoint names who did the work: people, groups and AI systems. AI-assisted work is credited openly.

### No patents

- The project will never seek patents on anything recorded here.
- Contributors agree not to seek patents on what they contribute here.
- Everything is published openly, with dates, so it can serve as public prior art.

### Link, don't copy

- Sources are links only. This repository never hosts copies of copyrighted papers.
- Summaries and checkpoint notes are written in your own words, not pasted from papers.
- The validator rejects any file under `data/` that is not JSON or Markdown.

The pledge is a community commitment, not legal advice: the legal terms are in [LICENSE](LICENSE) and [LICENSE-CONTENT](LICENSE-CONTENT).

## How it works

Each problem is one JSON file in [`data/problems/`](data/problems/). Every file is checked against the JSON Schema in [`data/schema/`](data/schema/).

- **Status.** Every problem has one of four statuses:
  - **Open:** not settled, and open-ended. There is no single agreed statement of what "solved" means yet, so progress is measured in milestones.
  - **Unsolved:** precisely stated, with a definite answer that nobody has found yet.
  - **Solved:** answered as posed, by a proof, disproof, construction, algorithm or measurement that has been accepted.
  - **Resolved:** closed without an answer as posed, because it was shown impossible, independent of the usual axioms, or ill-posed, or because it was superseded.
- **Progress map.** An ordered list of checkpoints, from the first step to a full solution. Each checkpoint has a status: done, in progress, not started, disputed or dead end. Once work starts, it also records who did the work and when, with links to it. Dead ends stay on the map so nobody repeats them.
- **Credit.** Each contributor is a person, a group or an AI.
- **Ratings.** Open and unsolved problems have two ratings from 1 to 10:
  - *Work left*: 1 = almost there, 10 = barely begun.
  - *Significance if fully solved*: 1 = mostly curiosity value, 10 = would change everyday life or technology.
- **AI effort.** The recommended AI reasoning effort for the next open checkpoint: low, medium, high or max.
- **Sources.** Links to papers, datasets, code and other sources. Links only.

The field-by-field reference is in [docs/DATA_FORMAT.md](docs/DATA_FORMAT.md).

## Repository layout

| Folder | What is in it |
| --- | --- |
| [`data/problems/`](data/problems/) | One JSON file per problem. |
| [`data/schema/`](data/schema/) | The JSON Schema for problem files, and `vocabulary.json` with labels and definitions for every allowed value. |
| [`scripts/`](scripts/) | The validator, and the shared loader that the validator and the site build both use. |
| [`site/`](site/) | The static website generator. It builds the site into `site/dist/`. |
| [`extension/`](extension/) | The browser extension, planned for later. No code yet. |
| [`app/`](app/) | The offline app "Project: STEMularity", planned for later. No code yet. |
| [`docs/`](docs/) | The data format, how to deploy the site, and the roadmap. |
| [`test/`](test/) | Automated tests. |
| [`.github/workflows/`](.github/workflows/) | The "Validate" workflow, which runs on every pull request and every push to `main`. |

## Quick start

You need [Node.js](https://nodejs.org/) 22, the version in `.node-version`.

```sh
npm ci             # install dependencies
npm run validate   # check every problem file
npm test           # run the tests
npm run preview    # build the site and serve it at http://127.0.0.1:8788
```

`npm run build` only builds the site into `site/dist/`. `npm run check` runs the validator, the tests and the build in one go.

## Contributing

Anyone can add a problem, update a progress map, or improve the code. Everything goes through pull requests. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

STEMularity uses one license for code and another for content.

| Part | License | What it covers |
| --- | --- | --- |
| Code | [MIT](LICENSE) | `scripts/`, `site/`, `extension/`, `app/`, `test/`, `data/schema/`, `.github/`, and config files such as `package.json` |
| Content | [CC BY 4.0](LICENSE-CONTENT) | `data/problems/`, `docs/`, this README and other prose (such as `CONTRIBUTING.md` and the README file in each folder), and STEMgu artwork |

If you reuse content, give credit, link to the source and the license, and say if you changed anything. For example:

> From [STEMularity](https://github.com/gearashi/STEMularity) by the STEMularity contributors, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

A shorter form is "STEMularity contributors, CC BY 4.0", with links to the repository and the license. If you changed the content, say so, for example by starting with "Adapted from".

## Roadmap

Planned for later:

- accounts, with claim and spot locking for checkpoints,
- uploading work to a checkpoint,
- an API for AI agents,
- a browser extension that links Claude and ChatGPT to STEMularity,
- "Project: STEMularity", an offline app with a 90s encyclopedia CD-ROM look and SNES-style pixel art.

See [docs/ROADMAP.md](docs/ROADMAP.md).

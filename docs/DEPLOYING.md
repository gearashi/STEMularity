# Deploying the site

> **Nothing is deployed yet.** There is no live STEMularity website. Deploying is a manual decision for the maintainer. No workflow in this repository deploys anything: the "Validate" workflow only checks the data, runs the tests and builds the site.

This page is for the maintainer. It explains how to put the site on [Cloudflare Pages](https://pages.cloudflare.com/) when you decide to.

Cloudflare's dashboard changes from time to time, so its labels may differ slightly from the names used here. This page names the settings rather than exact button paths.

## What gets deployed

`npm run build` reads `data/problems/` and writes a static site to `site/dist/`. That folder is not committed: it is listed in `.gitignore`. It holds:

- `index.html`: the list of all problems, with search, sorting and filters,
- `problems/<id>/`: one page per problem, showing its progress map,
- `about/`: the pledge, and what the statuses, checkpoints, AI effort levels and ratings mean,
- `problems.json`: the whole index in one file, plus one `problems/<id>.json` file per problem and a copy of the schema in `schema/`,
- `assets/`: the stylesheet, the script for search, sorting and filters, and the placeholder STEMgu image,
- `404.html`: the "page not found" page,
- `_headers`: the security headers that Cloudflare Pages adds to responses,
- `.stemularity-build`: a small marker file that tells the next build it may replace the folder.

There is no server code. The site is plain files.

The build runs the same checks as `npm run validate`. If the data has any error, the build stops and writes nothing, so a broken problem file can't reach the site.

## Option 1: Cloudflare Pages with Git integration (recommended)

With Git integration, Cloudflare builds the site from GitHub. Every push to `main` updates the live site, and every other branch pushed to this repository gets its own preview site. Pull requests from forks get no preview: see [Preview deployments](#preview-deployments).

### Create the project

1. Sign in to the Cloudflare dashboard and go to the Workers & Pages section.
2. Create a new **Pages** project, and choose to connect it to a Git repository. The dashboard may suggest creating a Worker instead: this guide is for a Pages project.
3. Connect your GitHub account, and give Cloudflare access to the `gearashi/STEMularity` repository. You can limit its access to this one repository.
4. Enter the build settings below. Then save, and the first deployment starts.

### Build settings

| Setting | Value |
| --- | --- |
| Project name | Your choice, such as `stemularity`. The site's address becomes `https://<project-name>.pages.dev`. |
| Production branch | `main` |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `site/dist` |
| Root directory | Leave it blank. The build runs from the repository root. |
| Environment variables | None needed. |

- **Node.js version.** The Cloudflare build reads `.node-version`, so it uses Node.js 22. If a build ever uses a different version, set the environment variable `NODE_VERSION` to `22` in the project settings.
- **Dependencies.** Cloudflare installs them automatically from `package-lock.json` before it runs the build command.

When the first build finishes, the site is available at `https://<project-name>.pages.dev`. After that, every push to `main` builds and deploys it again.

If a build fails, Cloudflare keeps serving the last deployment that worked. Cloudflare does not wait for the "Validate" workflow on GitHub, so only merge to `main` when the checks pass.

### Preview deployments

Cloudflare builds previews only for branches pushed to this repository.

- By default, every push to a branch other than `main` gets its own preview deployment.
- Each preview has its own address, like `https://<hash>.<project-name>.pages.dev`. Each branch also gets an alias, like `https://<branch>.<project-name>.pages.dev`, that points to the branch's latest preview.
- For a pull request from a branch in this repository, the preview's link shows up on the pull request, so reviewers can open the site before they merge.
- Previews never change the live site.
- Preview links are public by default: anyone who has the link can open them. You can restrict them with Cloudflare Access in the project settings.
- You can choose which branches get previews, or turn previews off, in the project's build settings.

Pull requests from forks, the route that [CONTRIBUTING.md](../CONTRIBUTING.md) describes, get no Cloudflare preview. Reviewers check them on their own computer instead: check out the pull request, then build and serve the site.

```sh
git fetch origin pull/<number>/head:pr-<number>
git switch pr-<number>
npm ci
npm run preview
```

These commands run the pull request's code on your computer, so read its changes first.

### Security headers: the `_headers` file

The build copies [`site/src/static/_headers`](../site/src/static/_headers) to `site/dist/_headers`. Cloudflare Pages reads this file and adds the headers it lists to the matching responses. Its one rule, `/*`, matches every address. It sets:

- a Content Security Policy (CSP) that allows scripts, styles and images only from the site itself (plus `data:` images), and blocks plugins, all framing (even by the site's own pages), and form submissions,
- `X-Content-Type-Options: nosniff`,
- `Referrer-Policy: strict-origin-when-cross-origin`,
- a `Permissions-Policy` that turns off browser features the site doesn't use, such as the camera, the microphone and location.

Keep these points in mind:

- Edit `site/src/static/_headers`, not `site/dist/_headers`, which is replaced on every build.
- The CSP blocks inline scripts and styles, so keep scripts and styles in their own files.
- If you add a script, style, font or image from another website, update the CSP too. Otherwise browsers will block it.
- After a deployment, check the headers with your browser's developer tools, or with `curl -I https://<project-name>.pages.dev/`.

### The 404 page

The build writes `site/dist/404.html`. When someone opens an address that doesn't exist, Cloudflare Pages serves this page with a 404 status.

Keep this file. Without a `404.html` at the top level of the output, Cloudflare Pages treats the site as a single-page app and answers every unknown address with the home page instead.

### Custom domain

To use your own domain, add it in the Pages project's custom domain settings.

- If Cloudflare manages the domain's DNS, it can add the DNS record for you.
- If another provider manages the DNS, add a `CNAME` record there that points the subdomain, such as `www`, to `<project-name>.pages.dev`. Add the domain in the project settings first: the `CNAME` record alone is not enough.
- A root domain, such as `example.org` without `www`, needs its DNS managed by Cloudflare.
- Cloudflare sets up the HTTPS certificate automatically.
- `pages.dev` addresses only work over HTTPS. For a custom domain, consider turning on HSTS, which tells browsers to always use HTTPS, once you are sure the domain will stay on HTTPS.

## Local preview

You don't need Cloudflare to see the site:

```sh
npm run preview
```

This builds the site and serves `site/dist/` at http://127.0.0.1:8788. Stop it with Ctrl+C. To use another port, set the `PORT` environment variable, for example `PORT=9000 npm run preview`. `npm run build` builds the site without serving it.

The preview server ([`site/serve.mjs`](../site/serve.mjs)) only listens on your own computer. Like Cloudflare Pages, it serves `404.html` for unknown addresses and applies the rules in `_headers`, so the preview runs under the same Content Security Policy. It only understands simple `_headers` patterns (an exact path, or one ending in `/*`), so check new rules on a preview deployment too.

## Option 2: Direct Upload with Wrangler

Instead of Git integration, you can build the site on your own computer and upload `site/dist/` with Cloudflare's command-line tool, Wrangler. Wrangler is not a dependency of this project: `npx` downloads it when you run it.

Start from an up-to-date checkout of `main`. The first time, create the project, with `main` as its production branch. Then build the site and upload it:

```sh
git switch main
git pull
npx wrangler pages project create <name> --production-branch main   # first time only
npm run build
npx wrangler pages deploy site/dist --project-name <name> --branch main
```

- If you are not signed in, the first Wrangler command opens your browser so you can sign in to Cloudflare. (`npx wrangler login` does only that.) In scripts, set the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` environment variables instead.
- If Wrangler asks for the production branch, type `main`: the default it suggests is the branch you have checked out.
- `--branch main` makes the upload a production deployment, which updates the live site, whichever branch you have checked out. That is why you start from an up-to-date `main`. Without `--branch`, Wrangler takes the branch name from Git, and any branch other than `main` gives a preview.
- Nothing deploys automatically with Direct Upload. Every upload is a manual step.
- A project created with Direct Upload can't be switched to Git integration later. To switch, create a new project.

## Before you deploy

- Run `npm run check` and make sure it passes.
- All problems are made-up samples for now (`"sample": true`). Decide whether to deploy before real data exists.
- Choose the project name with care: it sets the `pages.dev` address.
- Read the `_headers` file, and check that the CSP allows everything the site needs.
- For Cloudflare's own documentation, see [Cloudflare Pages docs](https://developers.cloudflare.com/pages/).

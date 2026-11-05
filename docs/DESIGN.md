# Art and design guide

This guide is for anyone adding STEMularity's real artwork and visual design, whether a person or an AI tool. It says where each piece lives, which rules the site enforces, and how to check your work.

Today the site uses placeholder art: a small pixel-art STEMgu and pixel-art checkpoint markers.

## What to make

| Piece | File | Used for | Notes |
| --- | --- | --- | --- |
| STEMgu, the mascot | [`site/src/static/assets/stemgu.svg`](../site/src/static/assets/stemgu.svg) | The site header (32 px), empty states and the About page (64 px), the 404 page (96 px), and the browser tab icon | One square image. Keep the file name, or update the references in `site/src/layout.mjs` and `site/src/pages.mjs`. |
| Checkpoint markers | [`site/src/icons.mjs`](../site/src/icons.mjs) | Progress maps, problem cards and legends | Five pixel grids, 9×9 each: done, in progress, not started, disputed and dead end. Each marker must keep its own shape, not only its own color. |
| Colors and type | [`site/src/static/assets/styles.css`](../site/src/static/assets/styles.css) | The whole site | Colors are CSS custom properties at the top of the file, with a light and a dark value each. |
| The offline app's look | [`app/`](../app/) | "Project: STEMularity" | A 90s encyclopedia CD-ROM look with SNES-style pixel art. There is no code yet: see the [roadmap](ROADMAP.md#project-stemularity-offline-app). |

STEMgu's final design is still open. The placeholder is a small flask with a face; the real character is the project owner's choice.

## Rules the site enforces

The site sends a strict Content-Security-Policy (see [`site/src/static/_headers`](../site/src/static/_headers)), and the tests check every built page. So:

- **No inline code or styles.** No `<script>` without `src`, no `on...=` attributes, no `style="..."` attributes and no `<style>` elements in the HTML. Put styles in `styles.css`.
- **Everything is self-hosted.** No fonts, images or scripts from other sites, including font services. If you add a font, such as a pixel font, put the file in `site/src/static/assets/`, choose one whose license allows this (such as the SIL Open Font License), and commit its license file next to it.
- **SVG files:** plain shapes with presentation attributes such as `fill="..."`, and `shape-rendering="crispEdges"` for crisp pixels. No scripts, no `<style>` elements and no links to other files. Start the file with a comment that says what it is and who made it.
- **PNG pixel art:** draw it at its true pixel size, scale it up only by whole numbers, and keep it crisp with `image-rendering: pixelated` in `styles.css`.
- **Both themes.** Every color needs a light and a dark value. Text needs a contrast ratio of at least 4.5:1 against its background, and borders and icons at least 3:1 (WCAG AA).
- **Status is never shown by color alone.** Problem statuses appear as text. Checkpoint statuses appear as text plus the marker's shape.
- **Calm motion.** No animation that plays on its own. Anything that moves must stop when the visitor's system asks for reduced motion (`prefers-reduced-motion`).
- **Small and steady.** Pages should stay light, work from 320 px wide, and not shift while they load.

## Originality, licensing and credit

- Artwork is content, licensed under CC BY 4.0 wherever it is stored. See the [license table](../README.md#license).
- Make it original. "SNES-style" means the look: a small palette, chunky pixels, and sprites on a 16×16 or 32×32 grid. It does not mean copying sprites, characters or logos from existing games or brands.
- Credit how each piece was made, including any AI tools, in the file's opening comment and in the pull request. This follows the [Open-Knowledge Pledge](../README.md#the-open-knowledge-pledge), which credits AI work openly.
- In some countries, images made entirely by AI are not protected by copyright, so the CC BY 4.0 license may not apply to them. That doesn't stop the project from using them. Have a person choose, edit and review the art before it is merged.

## Check your work

```sh
npm run check     # validator, tests and site build
npm run preview   # serves the site at http://127.0.0.1:8788
```

Then look at the problem list, a problem page, the About page and a missing page (the 404 page), in light and dark mode, at a phone width and a desktop width. The browser console should show no errors, including no Content-Security-Policy errors. The tests fail if a page breaks the inline-code rules above.

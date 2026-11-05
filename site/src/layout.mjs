// The page shell shared by every page: head, header, sample-data banner and
// footer.
//
// Links and assets are relative to the page (`root` is '', '../' or '../../'),
// so the site works at any base path and from file://. The 404 page is the
// one exception: Cloudflare Pages serves it at whatever address was not found,
// so its URLs must start at the site root ('/').
//
// The Content Security Policy in _headers allows no inline scripts or styles,
// so pages never use <style>, style="", inline <script> or on* attributes.
//
// The footer's dot separator has a no-break space before it, so the dot never
// starts a line.

import { html } from './html.mjs';
import { CC_BY_URL, REPO_URL, SITE_NAME, repoFileUrl } from './config.mjs';

/**
 * @param {object} page
 * @param {string} page.title Page name; the site name is added after it.
 * @param {string} page.description Text for <meta name="description">.
 * @param {string} page.root Prefix that leads back to the site root.
 * @param {string} [page.current] 'problems' or 'about', to mark the nav link.
 * @param {boolean} page.hasSamples Show the sample-data banner.
 * @param {import('./html.mjs').SafeHtml} page.main Contents of <main>.
 * @param {string[]} [page.scripts] Script paths relative to the site root.
 */
export function layout({ title, description, root, current, hasSamples, main, scripts = [] }) {
  const index = root === '/' ? '/' : `${root}index.html`;
  const about = root === '/' ? '/about/' : `${root}about/index.html`;
  const navLink = (href, text, key) =>
    html`<a href="${href}"${current === key ? html` aria-current="page"` : ''}>${text}</a>`;

  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · ${SITE_NAME}</title>
<meta name="description" content="${description}">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="${root}assets/stemgu.svg" type="image/svg+xml">
<link rel="stylesheet" href="${root}assets/styles.css">
${scripts.map((src) => html`<script src="${root}${src}" defer></script>
`)}</head>
<body>
<a class="skip-link" href="#main">Skip to main content</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="${index}"><img class="pixel" src="${root}assets/stemgu.svg" alt="" width="32" height="32"><span class="brand-name">${SITE_NAME}</span></a>
    <nav class="site-nav" aria-label="Main">
      <ul>
        <li>${navLink(index, 'Problems', 'problems')}</li>
        <li>${navLink(about, 'About', 'about')}</li>
        <li><a href="${REPO_URL}" rel="noopener noreferrer">GitHub</a></li>
      </ul>
    </nav>
  </div>
</header>
${hasSamples ? html`<div class="sample-banner" role="note">
  <p class="wrap"><span class="tag">Sample data</span> These are made-up sample problems. Real data comes later.</p>
</div>
` : ''}<main id="main" tabindex="-1">
${main}
</main>
<footer class="site-footer">
  <div class="wrap">
    <p>Code: <a href="${repoFileUrl('LICENSE')}" rel="noopener noreferrer">MIT</a>&nbsp;· Content: <a href="${CC_BY_URL}" rel="noopener noreferrer">CC BY 4.0</a></p>
    <p>License files on GitHub: <a href="${repoFileUrl('LICENSE')}" rel="noopener noreferrer">LICENSE</a> (code) and <a href="${repoFileUrl('LICENSE-CONTENT')}" rel="noopener noreferrer">LICENSE-CONTENT</a> (content). <a href="${about}#pledge">Our open-knowledge pledge</a>.</p>
  </div>
</footer>
</body>
</html>
`;
}

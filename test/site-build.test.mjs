// Tests for the static site build (site/build.mjs) and the preview server
// (site/serve.mjs). Every build goes into a temporary folder that is removed
// at the end.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import fsPromises, { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { BUILD_MARKER, BuildError, build, checkOutDir } from '../site/build.mjs';
import { createServer } from '../site/serve.mjs';
import { escapeHtml, externalLink, html, safeUrl } from '../site/src/html.mjs';
import { formatDate, formatYear, truncate } from '../site/src/format.mjs';
import { DEFAULT_DATA_DIR, ROOT, loadProblems } from '../scripts/lib/problems.mjs';

// Child processes must not think they are part of this test run.
const { NODE_TEST_CONTEXT, ...CHILD_ENV } = process.env;

const NASTY = '<script>alert(1)</script>';

// A valid problem whose text tries every way to break out of HTML. The schema
// allows line breaks only in the summary and checkpoint descriptions.
const nastyProblem = {
  id: 'nasty-escaping-test',
  name: `Nasty ${NASTY} "quoted" & 'single' x" onmouseover="alert(2)`,
  aliases: ['</title><script>alert(3)</script>', `it's "aliased" & <b>bold</b>`],
  field: 'mathematics',
  category: '<b>Bold</b> & "category"',
  tags: ['escaping-test'],
  status: 'unsolved',
  summary: `Summary with ${NASTY}, "double quotes", 'single quotes' & ampersands,\n<img src=x onerror=alert(4)> and a stray </p> end tag.\n\nA second paragraph " onfocus="alert(7)`,
  ai_effort: 'medium',
  ratings: { work_left: 5, significance: 7 },
  progress: [
    {
      id: 'step-one',
      title: `${NASTY} & "step" one`,
      description: `<style>body { display: none }</style>\n' " & <a href="javascript:alert(5)">x</a>`,
      status: 'done',
      by: [{ name: `${NASTY} Person`, kind: 'person', url: 'https://example.org/people?a=1&b=2' }],
      date: '2020-01-02',
      links: [{ title: `${NASTY} link`, url: 'https://example.org/link?x=%3Cscript%3E&y=1' }],
    },
    { id: 'step-two', title: 'Next step " onclick="alert(6)', status: 'not-started' },
  ],
  sources: [
    { title: `${NASTY} source`, url: 'https://example.org/source', kind: 'paper', authors: [`${NASTY} Author`], year: 2020 },
  ],
  sample: true,
  updated: '2020-02-03',
};

// A valid problem with dates before 1000 CE, including a year BCE.
const ancientProblem = {
  id: 'ancient-dates-test',
  name: 'Ancient Dates Test',
  field: 'mathematics',
  category: 'Geometry',
  status: 'resolved',
  summary: 'A made-up problem posed in 430 BCE, restated in 430 CE and shown impossible in 1882, with sources from 300 BCE on.',
  ai_effort: 'low',
  progress: [
    { id: 'posed', title: 'Problem posed', status: 'done', by: [{ name: 'Ancient Placeholder', kind: 'person' }], date: '-0430' },
    { id: 'restated', title: 'Problem restated', status: 'done', by: [{ name: 'Later Placeholder', kind: 'person' }], date: '0430-05-14' },
    { id: 'settled', title: 'Shown impossible', status: 'done', by: [{ name: 'Modern Placeholder', kind: 'group' }], date: '1882' },
  ],
  sources: [
    { title: 'An old book', url: 'https://example.org/old-book', kind: 'book', year: -300 },
    { title: 'A newer book', url: 'https://example.org/newer-book', kind: 'book', authors: ['Ada Placeholder'], year: 430 },
  ],
  sample: true,
};

let tmp;
const realProblems = [];

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'stemularity-site-test-'));
  const loaded = await loadProblems({ dataDir: DEFAULT_DATA_DIR });
  assert.deepEqual(loaded.errors, [], 'data/ must be valid for these tests');
  realProblems.push(...loaded.problems);
});

after(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers

async function listFiles(dir, prefix = '') {
  const files = [];
  for (const entry of await readdir(path.join(dir, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await listFiles(dir, relative)));
    else files.push(relative);
  }
  return files.sort();
}

async function readOutput(dir) {
  const contents = new Map();
  for (const file of await listFiles(dir)) contents.set(file, await readFile(path.join(dir, file), 'utf8'));
  return contents;
}

// Writes a data folder, with the real schema and the given problems, in the test folder.
async function makeDataDir(name, problems) {
  const data = path.join(tmp, name);
  await cp(path.join(DEFAULT_DATA_DIR, 'schema'), path.join(data, 'schema'), { recursive: true });
  await mkdir(path.join(data, 'problems'));
  for (const problem of problems) {
    await writeFile(path.join(data, 'problems', `${problem.id}.json`), JSON.stringify(problem, null, 2));
  }
  return data;
}

// The page without its <head>: only what is shown.
const bodyOf = (page) => page.slice(page.indexOf('<body>'));

const ATTR = /\s([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const TAG = /<([a-zA-Z][\w:-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;

// Every start tag in the page, with its attributes.
function tags(page) {
  return [...page.matchAll(TAG)].map(([, name, attrs]) => ({
    name: name.toLowerCase(),
    attrs: new Map([...attrs.matchAll(ATTR)].map((m) => [m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? ''])),
  }));
}

// Anything the Content Security Policy would block, or that suggests escaping failed.
function cspProblems(page) {
  const found = [];
  if (/<style[\s>]/i.test(page)) found.push('<style> element');
  for (const tag of tags(page)) {
    for (const name of tag.attrs.keys()) {
      if (name.startsWith('on')) found.push(`<${tag.name}> has an ${name} attribute`);
      if (name === 'style') found.push(`<${tag.name}> has a style attribute`);
    }
    if (tag.name === 'script' && !tag.attrs.has('src')) found.push('<script> without src');
  }
  for (const [, body] of page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (body.trim()) found.push('<script> with inline code');
  }
  // Data is always escaped, so a quote-delimited attribute here is a real one.
  if (/\s(on[a-z]+|style)\s*=\s*["']/i.test(page)) found.push('on*= or style= attribute');
  return found;
}

function ids(page) {
  return new Set(tags(page).map((tag) => tag.attrs.get('id')).filter(Boolean));
}

// ---------------------------------------------------------------------------

describe('HTML helpers', () => {
  it('escapeHtml escapes the five special characters', () => {
    assert.equal(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;');
    assert.equal(escapeHtml('&amp;'), '&amp;amp;');
    assert.equal(escapeHtml('plain text'), 'plain text');
  });

  it('escapeHtml turns any value into text', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
    assert.equal(escapeHtml(42), '42');
    assert.equal(escapeHtml({ toString: () => '<x>' }), '&lt;x&gt;');
  });

  it('html`` escapes values in text and attributes, but not nested html``', () => {
    const value = '"><script>alert(1)</script>';
    assert.equal(
      html`<p title="${value}">${value}</p>`.toString(),
      '<p title="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;">&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
    const inner = html`<b>${'<i>'}</b>`;
    assert.equal(html`<p>${inner}</p>`.toString(), '<p><b>&lt;i&gt;</b></p>');
    assert.equal(html`<ul>${['<a>', html`<li>ok</li>`]}</ul>`.toString(), '<ul>&lt;a&gt;<li>ok</li></ul>');
    assert.equal(html`${null}${undefined}${false}${0}`.toString(), '0');
  });

  it('safeUrl allows only absolute http and https URLs', () => {
    assert.equal(safeUrl('https://example.org/a?b=1&c=2'), 'https://example.org/a?b=1&c=2');
    assert.equal(safeUrl('http://example.org'), 'http://example.org/');
    for (const bad of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'data:text/html,<b>x</b>', '/relative', 'example.org', 'mailto:a@example.org', '', 42, null]) {
      assert.equal(safeUrl(bad), null, String(bad));
    }
  });

  it('externalLink adds rel and drops unsafe URLs', () => {
    assert.equal(
      externalLink('https://example.org/?a=1&b=2', 'A & B').toString(),
      '<a href="https://example.org/?a=1&amp;b=2" rel="noopener noreferrer">A &amp; B</a>',
    );
    assert.equal(externalLink('javascript:alert(1)', 'x').toString(), '<span>x</span>');
  });

  it('the CSP checker used below catches what it should', () => {
    assert.notDeepEqual(cspProblems('<p style="color:red">x</p>'), []);
    assert.notDeepEqual(cspProblems('<a href="#" onclick="go()">x</a>'), []);
    assert.notDeepEqual(cspProblems('<script>alert(1)</script>'), []);
    assert.notDeepEqual(cspProblems('<style>p{}</style>'), []);
    assert.deepEqual(cspProblems('<script src="a.js" defer></script><p data-x="a onclick=b">x</p>'), []);
  });
});

describe('formatting', () => {
  it('formats YYYY, YYYY-MM and YYYY-MM-DD dates', () => {
    assert.equal(formatDate('2019'), '2019');
    assert.equal(formatDate('2019-03'), 'March 2019');
    assert.equal(formatDate('2023-08-14'), '14 August 2023');
    assert.equal(formatDate('2023-13'), '2023-13');
    assert.equal(formatDate('not a date'), 'not a date');
  });

  it('formats years BCE, and adds CE to years before 1000', () => {
    assert.equal(formatDate('-0430'), '430 BCE');
    assert.equal(formatDate('-0001'), '1 BCE');
    assert.equal(formatDate('0430'), '430 CE');
    assert.equal(formatDate('0430-05'), 'May 430 CE');
    assert.equal(formatDate('0430-05-14'), '14 May 430 CE');
    assert.equal(formatDate('0999'), '999 CE');
    assert.equal(formatDate('1000'), '1000');
    // Not valid dates: shown as written.
    assert.equal(formatDate('0000'), '0000');
    assert.equal(formatDate('-0430-05'), '-0430-05');
  });

  it('formats source years the same way', () => {
    assert.equal(formatYear(-300), '300 BCE');
    assert.equal(formatYear(430), '430 CE');
    assert.equal(formatYear(2019), '2019');
    assert.equal(formatYear(undefined), '');
  });

  it('shortens long text at a word boundary', () => {
    const text = 'word '.repeat(100).trim();
    const short = truncate(text, 200);
    assert.ok(short.length <= 201, `${short.length} characters`);
    assert.ok(short.endsWith('word…'));
    assert.ok(text.startsWith(short.slice(0, -1)));
    assert.equal(truncate('Short summary.', 200), 'Short summary.');
  });
});

describe('build from data/', () => {
  let out;
  let files;
  let html;

  before(async () => {
    out = path.join(tmp, 'real');
    const result = await build({ dataDir: DEFAULT_DATA_DIR, outDir: out });
    assert.equal(result.problems, realProblems.length);
    files = await readOutput(out);
    html = [...files.keys()].filter((file) => file.endsWith('.html'));
  });

  it('writes the top-level pages and files', () => {
    for (const file of ['index.html', '404.html', 'about/index.html', '_headers', 'problems.json', BUILD_MARKER,
      'assets/styles.css', 'assets/app.js', 'assets/stemgu.svg', 'schema/problem.schema.json', 'schema/vocabulary.json']) {
      assert.ok(files.has(file), `${file} is missing`);
    }
  });

  it('lists every problem on the index page and gives each one a page and a JSON file', () => {
    assert.ok(realProblems.length > 0);
    const index = files.get('index.html');
    for (const problem of realProblems) {
      assert.ok(index.includes(`href="problems/${problem.id}/index.html"`), `index does not link to ${problem.id}`);
      assert.ok(files.has(`problems/${problem.id}/index.html`), `page for ${problem.id} is missing`);
      const json = JSON.parse(files.get(`problems/${problem.id}.json`));
      assert.deepEqual(json, problem);
    }
  });

  it('offers the sort options, and has a note for visitors without JavaScript', () => {
    const index = files.get('index.html');
    assert.match(index, /<option value="name"[^>]*>Name<\/option>/);
    // The note comes first, in the controls' place: the first column on wide
    // screens, above the list on narrow ones.
    assert.match(index, /<div class="index-layout">\s*<noscript><p class="noscript-note">Search, sorting and filters need JavaScript\. Without it, all problems are listed A to Z\.<\/p><\/noscript>\s*<form id="controls"/);
  });

  it('gives the values on a card a fixed width, so the bars line up', () => {
    const index = files.get('index.html');
    const bars = index.match(/<span class="pips /g) ?? [];
    const lined = index.match(/<dd><span class="card-value">[^<]+<\/span> <span class="pips /g) ?? [];
    assert.ok(bars.length > 0);
    assert.equal(lined.length, bars.length);
  });

  it('explains the licenses, AI effort and fields on the About page', () => {
    const about = files.get('about/index.html');
    for (const text of [
      'Content, including the problem data and artwork such as STEMgu, is under',
      'The problem data is under CC BY 4.0; the schema and vocabulary files are under MIT.',
      'The recommended AI reasoning effort for working on the problem now: for the first open checkpoint on its map (one that is in progress, not started or disputed), or, if none is open, for checking and building on the recorded work.',
    ]) {
      assert.ok(about.includes(text), text);
    }
    const vocabulary = JSON.parse(files.get('schema/vocabulary.json'));
    for (const field of Object.values(vocabulary.field)) assert.ok(about.includes(escapeHtml(field.description)), field.label);
  });

  it('writes problems.json with the license, the count and every problem', () => {
    const bulk = JSON.parse(files.get('problems.json'));
    assert.equal(bulk.license, 'CC-BY-4.0');
    assert.equal(bulk.count, realProblems.length);
    assert.deepEqual(bulk.problems.map((p) => p.id), realProblems.map((p) => p.id));
  });

  it('writes the security headers for Cloudflare Pages', () => {
    const headers = files.get('_headers');
    assert.match(headers, /^\/\*$/m);
    assert.match(headers, /^ {2}Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'$/m);
    assert.match(headers, /^ {2}X-Content-Type-Options: nosniff$/m);
    assert.match(headers, /^ {2}Referrer-Policy: strict-origin-when-cross-origin$/m);
    assert.match(headers, /^ {2}Permissions-Policy: .*camera=\(\)/m);
  });

  it('has no inline scripts, inline styles or event handler attributes', () => {
    assert.ok(html.length >= 3 + realProblems.length);
    for (const file of html) assert.deepEqual(cspProblems(files.get(file)), [], file);
  });

  it('gives every page lang, a title, a description, landmarks and one h1', () => {
    for (const file of html) {
      const page = files.get(file);
      assert.match(page, /^<!doctype html>\n<html lang="en">/, file);
      assert.match(page, /<title>[^<]+ · STEMularity<\/title>/, file);
      assert.match(page, /<meta name="description" content="[^"]+">/, file);
      assert.match(page, /<meta name="viewport" content="width=device-width, initial-scale=1">/, file);
      for (const landmark of ['<header', '<nav', '<main id="main"', '<footer', 'class="skip-link" href="#main"']) {
        assert.ok(page.includes(landmark), `${file} has no ${landmark}`);
      }
      assert.equal(page.match(/<h1[\s>]/g)?.length, 1, `${file} needs exactly one h1`);
    }
  });

  it('uses relative links that resolve, except on the 404 page', () => {
    for (const file of html) {
      const page = files.get(file);
      for (const tag of tags(page)) {
        for (const attr of ['href', 'src']) {
          const value = tag.attrs.get(attr);
          if (value === undefined) continue;
          if (/^https?:/.test(value)) {
            if (tag.name === 'a') assert.equal(tag.attrs.get('rel'), 'noopener noreferrer', `${file}: ${value}`);
            continue;
          }
          assert.ok(!/^[a-z][a-z0-9+.-]*:/i.test(value), `${file}: unexpected URL scheme in ${value}`);
          if (value.startsWith('#')) {
            assert.ok(ids(page).has(value.slice(1)), `${file}: ${value} points to a missing id`);
            continue;
          }
          if (file === '404.html') {
            assert.ok(value.startsWith('/') && !value.startsWith('//'), `404.html must use root-relative URLs: ${value}`);
          } else {
            assert.ok(!value.startsWith('/'), `${file} must use relative URLs: ${value}`);
          }
          const [target, hash] = value.replace(/\?.*?(#|$)/, '$1').split('#');
          let resolved = target === ''
            ? file
            : path.posix.normalize(value.startsWith('/') ? target.slice(1) : path.posix.join(path.posix.dirname(file), target));
          if (resolved === '.' || resolved === '' || resolved.endsWith('/')) resolved = `${resolved === '.' ? '' : resolved}index.html`;
          assert.ok(files.has(resolved), `${file}: ${value} points to missing ${resolved}`);
          if (hash) assert.ok(ids(files.get(resolved)).has(hash), `${file}: ${value} points to a missing #${hash}`);
        }
      }
    }
  });

  it('shows the progress map and links to edit each problem', () => {
    for (const problem of realProblems) {
      const page = files.get(`problems/${problem.id}/index.html`);
      for (const step of problem.progress) assert.ok(page.includes(`id="checkpoint-${step.id}"`), `${problem.id}: ${step.id}`);
      assert.ok(page.includes(`href="https://github.com/gearashi/STEMularity/edit/main/data/problems/${problem.id}.json"`));
      assert.ok(page.includes(`href="../${problem.id}.json"`));
    }
  });

  it('links each problem, and each of its steps, to a filled-in progress report', () => {
    const report = (problem, step) => {
      const title = encodeURIComponent(`[Progress] ${problem.name}`);
      const query = `template=progress-update.yml&title=${title}&problem=${encodeURIComponent(problem.id)}${step ? `&checkpoint=${encodeURIComponent(step.id)}` : ''}`;
      // The page writes the address inside an attribute, so each & is escaped.
      return `href="https://github.com/gearashi/STEMularity/issues/new?${query.replaceAll('&', '&amp;')}"`;
    };
    for (const problem of realProblems) {
      const page = files.get(`problems/${problem.id}/index.html`);
      assert.ok(page.includes(`${report(problem)} rel="noopener noreferrer">Report progress</a>`), problem.id);
      for (const step of problem.progress) assert.ok(page.includes(report(problem, step)), `${problem.id}: ${step.id}`);
    }
    assert.ok(files.get('index.html').includes('href="https://github.com/gearashi/STEMularity/issues/new?template=new-problem.yml" rel="noopener noreferrer">Suggest a problem</a>'));
    assert.ok(files.get('about/index.html').includes('href="https://github.com/gearashi/STEMularity/issues/new?template=new-problem.yml"'));
  });

  it('shows the sample-data banner on every page while samples exist', () => {
    if (!realProblems.some((problem) => problem.sample === true)) return;
    for (const file of html) {
      assert.ok(files.get(file).includes('These are made-up sample problems. Real data comes later.'), file);
    }
  });

  it('produces byte-identical output when built twice', async () => {
    const again = path.join(tmp, 'real-again');
    await build({ dataDir: DEFAULT_DATA_DIR, outDir: again });
    const second = await readOutput(again);
    assert.deepEqual([...second.keys()], [...files.keys()]);
    for (const [file, content] of files) assert.equal(second.get(file), content, file);
  });

  it('replaces an earlier build, removing stale files', async () => {
    const dir = path.join(tmp, 'rebuild');
    await build({ outDir: dir });
    await writeFile(path.join(dir, 'stale.html'), 'old');
    await build({ outDir: dir });
    assert.equal(existsSync(path.join(dir, 'stale.html')), false);
    assert.ok(existsSync(path.join(dir, 'index.html')));
  });
});

describe('build from hostile data', () => {
  let files;

  before(async () => {
    const data = await makeDataDir('nasty-data', [nastyProblem]);
    const out = path.join(tmp, 'nasty-out');
    const result = await build({ dataDir: data, outDir: out });
    assert.equal(result.problems, 1, 'the hostile problem must pass validation');
    files = await readOutput(out);
  });

  it('escapes every piece of data', () => {
    for (const [file, content] of files) {
      assert.ok(!content.includes('<script>alert'), `${file} contains a raw <script>alert`);
      assert.ok(!content.includes('<img src=x'), `${file} contains a raw <img>`);
      assert.ok(!content.includes('<b>Bold</b>'), `${file} contains raw <b>`);
    }
    const page = files.get(`problems/${nastyProblem.id}/index.html`);
    assert.ok(page.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(page.includes('&quot;quoted&quot; &amp; &#39;single&#39;'));
    assert.ok(page.includes('href="https://example.org/people?a=1&amp;b=2"'));
    assert.ok(files.get('index.html').includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    // In the progress-report links the name is percent-encoded, so nothing in it can end the attribute.
    const title = encodeURIComponent(`[Progress] ${nastyProblem.name}`);
    assert.match(title, /%3Cscript%3E/);
    assert.ok(page.includes(`${escapeHtml(`&title=${title}&problem=${nastyProblem.id}`)}"`), 'report link');
  });

  it('cannot break out of attributes or add active content', () => {
    for (const [file, content] of files) {
      if (file.endsWith('.html')) assert.deepEqual(cspProblems(content), [], file);
    }
  });

  it('keeps line breaks in the summary and descriptions inside their paragraph', () => {
    const page = files.get(`problems/${nastyProblem.id}/index.html`);
    assert.ok(page.includes('<p class="summary-text">Summary with &lt;script&gt;'), 'summary');
    assert.ok(page.includes('ampersands,\n&lt;img src=x onerror=alert(4)&gt; and a stray &lt;/p&gt; end tag.'), 'summary');
    assert.ok(page.includes('A second paragraph &quot; onfocus=&quot;alert(7)</p>'), 'summary');
    assert.ok(page.includes('&lt;/style&gt;\n&#39; &quot; &amp; &lt;a href=&quot;javascript:alert(5)&quot;&gt;x&lt;/a&gt;</p>'), 'description');
    // The stylesheet shows those line breaks instead of running the paragraphs together.
    assert.match(files.get('assets/styles.css'), /\.summary-text,\s*\.cp-description\s*\{\s*white-space: pre-line;/);
  });

  it('never lets a separator dot start a line', () => {
    // Each " · " has a no-break space before the dot, so a line can break only after it.
    for (const [file, content] of files) {
      if (!file.endsWith('.html')) continue;
      const body = bodyOf(content);
      assert.ok(body.includes('&nbsp;· '), file);
      assert.doesNotMatch(body, /[ \t\r\n]·/, file);
    }
    const page = files.get(`problems/${nastyProblem.id}/index.html`);
    for (const list of ['class="problem-meta"', 'class="progress-summary"', 'class="cp-meta"', 'class="source-meta"']) {
      assert.match(page, new RegExp(`${list}>[^\\n]*&nbsp;· `), list);
    }
  });

  it('keeps the raw values in the JSON files', () => {
    const json = JSON.parse(files.get(`problems/${nastyProblem.id}.json`));
    assert.deepEqual(json, nastyProblem);
    assert.deepEqual(JSON.parse(files.get('problems.json')).problems, [nastyProblem]);
  });
});

describe('build with dates before 1000 CE', () => {
  let page;

  before(async () => {
    const data = await makeDataDir('ancient-data', [ancientProblem]);
    const out = path.join(tmp, 'ancient-out');
    const result = await build({ dataDir: data, outDir: out });
    assert.equal(result.problems, 1, 'the problem must pass validation');
    page = await readFile(path.join(out, 'problems', ancientProblem.id, 'index.html'), 'utf8');
  });

  it('writes a year BCE as plain text, because HTML dates cannot hold one', () => {
    assert.ok(page.includes('<span class="cp-when">Reached 430 BCE</span>'));
    assert.ok(!page.includes('datetime="-'));
  });

  it('marks up the other dates, with CE added before the year 1000', () => {
    assert.ok(page.includes('<span class="cp-when">Reached <time datetime="0430-05-14">14 May 430 CE</time></span>'));
    assert.ok(page.includes('<span class="cp-when">Reached <time datetime="1882">1882</time></span>'));
  });

  it('shows source years BCE and CE', () => {
    assert.ok(page.includes('<span class="source-meta">&nbsp;· 300 BCE</span>'));
    assert.ok(page.includes('<span class="source-meta">&nbsp;· Ada Placeholder&nbsp;· 430 CE</span>'));
  });
});

describe('output folder safety', () => {
  it('refuses the repository root and the folders above it', async () => {
    await assert.rejects(checkOutDir(ROOT), /repository root/);
    await assert.rejects(checkOutDir(path.dirname(ROOT)), /repository root/);
    await assert.rejects(build({ outDir: ROOT }), /repository root/);
    assert.ok(existsSync(path.join(ROOT, 'package.json')), 'the repository must be untouched');
  });

  it('refuses the data folder, folders inside it and folders above it', async () => {
    await assert.rejects(checkOutDir(DEFAULT_DATA_DIR), /data folder/);
    await assert.rejects(checkOutDir(path.join(DEFAULT_DATA_DIR, 'problems')), /data folder/);
    const data = path.join(tmp, 'outer', 'data');
    await assert.rejects(checkOutDir(path.join(tmp, 'outer'), { dataDir: data }), /data folder/);
  });

  it('refuses a folder with other files in it, and leaves it alone', async () => {
    const dir = path.join(tmp, 'not-ours');
    await mkdir(dir);
    await writeFile(path.join(dir, 'keep.txt'), 'keep me');
    await assert.rejects(build({ outDir: dir }), /not empty/);
    assert.equal(await readFile(path.join(dir, 'keep.txt'), 'utf8'), 'keep me');
  });

  it('accepts a missing or empty folder', async () => {
    await checkOutDir(path.join(tmp, 'does-not-exist'));
    const empty = path.join(tmp, 'empty');
    await mkdir(empty);
    await checkOutDir(empty);
  });

  it('writes nothing when the data has errors', async () => {
    const data = path.join(tmp, 'bad-data');
    await cp(path.join(DEFAULT_DATA_DIR, 'schema'), path.join(data, 'schema'), { recursive: true });
    await mkdir(path.join(data, 'problems'));
    await writeFile(path.join(data, 'problems', 'broken.json'), JSON.stringify({ id: 'broken', name: 'Broken' }));
    const out = path.join(tmp, 'bad-out');
    await assert.rejects(build({ dataDir: data, outDir: out }), (err) => err instanceof BuildError && err.errors.length > 0);
    assert.equal(existsSync(out), false);
  });
});

describe('preview server', () => {
  let out;
  let server;
  let port;

  before(async () => {
    out = path.join(tmp, 'serve');
    await build({ outDir: out });
    server = createServer({ root: out });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
  });

  // Also closes connections left open, so a broken response can't keep the tests running.
  after(() => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  }));

  // Sends the path exactly as given, without normalizing it.
  const get = (rawPath, method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: rawPath, method }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });

  it('serves pages and assets with the right types and headers', async () => {
    const home = await get('/');
    assert.equal(home.status, 200);
    assert.equal(home.headers['content-type'], 'text/html; charset=utf-8');
    assert.match(home.headers['content-security-policy'], /script-src 'self'/);
    assert.equal((await get('/assets/styles.css')).headers['content-type'], 'text/css; charset=utf-8');
    assert.equal((await get('/assets/app.js')).headers['content-type'], 'text/javascript; charset=utf-8');
    assert.equal((await get('/assets/stemgu.svg')).headers['content-type'], 'image/svg+xml');
    assert.equal((await get('/problems.json')).headers['content-type'], 'application/json; charset=utf-8');
  });

  it('redirects folders without a trailing slash', async () => {
    const res = await get('/about');
    assert.equal(res.status, 301);
    assert.equal(res.headers.location, '/about/');
  });

  it('answers unknown paths with the 404 page', async () => {
    const res = await get('/no/such/page');
    assert.equal(res.status, 404);
    assert.match(res.body, /Page not found/);
  });

  it('never serves files outside the site folder', async () => {
    for (const attempt of ['/../package.json', '/%2e%2e/%2e%2e/package.json', '/..%2f..%2fpackage.json', '/assets/..%2F..%2F..%2Fsite/build.mjs']) {
      const res = await get(attempt);
      assert.equal(res.status, 404, attempt);
      assert.ok(!res.body.includes('"name": "stemularity"') && !res.body.includes('BUILD_MARKER'), attempt);
    }
    assert.equal((await get('/a%00b')).status, 400);
  });

  it('answers HEAD with the headers only', async () => {
    const res = await get('/', 'HEAD');
    assert.equal(res.status, 200);
    assert.equal(Number(res.headers['content-length']), (await readFile(path.join(out, 'index.html'))).length);
    assert.equal(res.body, '');
  });

  // A rebuild while the server runs deletes and rewrites files. These tests
  // change a file at the worst moment: just after the server's stat() has
  // seen it, before the server reads it. The server's stat() is swapped for
  // one that does this, through Node's live bindings for built-in modules.
  async function changeAfterStat(file, change, request) {
    const realStat = fsPromises.stat;
    fsPromises.stat = async (target, ...rest) => {
      const info = await realStat(target, ...rest);
      if (target === file) await change();
      return info;
    };
    syncBuiltinESMExports();
    try {
      return await request();
    } finally {
      fsPromises.stat = realStat;
      syncBuiltinESMExports();
    }
  }

  it('answers 404, and keeps running, when a file disappears while it is served', { timeout: 10_000 }, async () => {
    const file = path.join(out, 'vanishing.html');
    await writeFile(file, '<p>Soon gone</p>');
    const res = await changeAfterStat(file, () => rm(file), () => get('/vanishing.html'));
    assert.equal(res.status, 404);
    assert.match(res.body, /Page not found/);
    assert.equal((await get('/')).status, 200, 'the server still answers');
  });

  it('answers 500, and keeps running, when a file cannot be read', { timeout: 10_000 }, async () => {
    const file = path.join(out, 'unreadable.html');
    await writeFile(file, '<p>Soon a folder</p>');
    const swap = async () => {
      await rm(file);
      await mkdir(file);
    };
    const res = await changeAfterStat(file, swap, () => get('/unreadable.html'));
    assert.equal(res.status, 500);
    assert.match(res.body, /^Internal error: /);
    assert.equal((await get('/')).status, 200, 'the server still answers');
  });
});

describe('the build command', () => {
  /** Runs site/build.mjs from the repository root. */
  const run = (args) => spawnSync(process.execPath, ['site/build.mjs', ...args], { cwd: ROOT, encoding: 'utf8', env: CHILD_ENV });

  it('prints every error on one line, even when the data holds line breaks', async () => {
    const forged = '\n::error file=README.md::forged';
    // An unknown property: the error message repeats its name.
    const problem = { ...nastyProblem, [`note${forged}\u001b[2J\t`]: 'x', 'old ##[error]form': 'x' };
    const data = await makeDataDir('forged-data', [problem]);
    // A file name can hold a line break too, except on Windows.
    const forgedFile = await writeFile(path.join(data, 'problems', `copy${forged}.pdf`), 'not really a PDF').then(
      () => true,
      () => false,
    );
    const out = path.join(tmp, 'forged-out');
    const { status, stdout, stderr } = run(['--data', data, '--out', out]);
    assert.equal(status, 1);
    // GitHub reads a command from any line that starts with "::", after leading spaces.
    for (const line of `${stdout}\n${stderr}`.split(/\r\n|\r|\n/)) {
      assert.ok(!line.trimStart().startsWith('::'), `a line of output was forged:\n${line}`);
    }
    // The runner's older "##[command]" form, which it reads anywhere in a line, is broken up.
    assert.ok(!`${stdout}\n${stderr}`.includes('##['), stderr);
    assert.ok(stderr.includes('unknown property "old ##\\[error]form"'), stderr);
    // The text is still shown, with the control characters escaped.
    assert.ok(stderr.includes('(top level): unknown property "note\\n::error file=README.md::forged\\u001b[2J\\t"'), stderr);
    if (forgedFile) assert.ok(stderr.includes('copy\\n::error file=README.md::forged.pdf  '), stderr);
    assert.equal(existsSync(out), false, 'nothing was built');
  });
});

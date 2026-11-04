// Renders every HTML page of the site from the validated problems and the
// vocabulary. Pure functions: no file access, no clock, so the output depends
// only on the data.
//
// Labels and descriptions come from data/schema/vocabulary.json. Every value
// from the data goes through html``, which escapes it.

import { externalLink, html } from './html.mjs';
import { formatDate, plural, truncate } from './format.mjs';
import { marker, markerSprite } from './icons.mjs';
import { layout } from './layout.mjs';
import { CC_BY_URL, REPO_URL, repoEditUrl, repoFileUrl } from './config.mjs';

const SITE_DESCRIPTION =
  'An open index of open, unsolved, solved and resolved STEM problems, each with a checkpoint-style progress map.';

// What a checkpoint's date records, by status (see the schema: checkpoint.date).
const DATE_LABELS = { done: 'Reached', 'in-progress': 'Started', disputed: 'Claimed', 'dead-end': 'Abandoned' };

// Order of the counts after "n of m checkpoints done" in a map's summary.
const SUMMARY_ORDER = ['in-progress', 'disputed', 'dead-end', 'not-started'];

// The two ratings, in display order. The schema allows exactly these keys.
const RATINGS = ['work_left', 'significance'];

/**
 * @param {{problems: object[], vocabulary: object}} input Valid problems,
 *   sorted by name, and the vocabulary, as returned by loadProblems().
 * @returns {[string, string][]} [path inside the output folder, HTML] pairs.
 */
export function renderSite({ problems, vocabulary }) {
  const ctx = {
    problems,
    v: vocabularyHelpers(vocabulary),
    hasSamples: problems.some((problem) => problem.sample === true),
  };
  const pages = [
    ['index.html', renderIndex(ctx)],
    ['about/index.html', renderAbout(ctx)],
    ['404.html', renderNotFound(ctx)],
    ...problems.map((problem) => [`problems/${problem.id}/index.html`, renderProblem(problem, ctx)]),
  ];
  // Optional parts leave blank lines behind; drop them. No page uses <pre>.
  return pages.map(([file, page]) => [file, page.toString().replace(/\n[ \t]*(?=\n)/g, '')]);
}

/** Lookups into vocabulary.json that fall back to the raw value. */
export function vocabularyHelpers(vocabulary) {
  const section = (name) => {
    const value = vocabulary?.[name];
    return value && typeof value === 'object' ? value : {};
  };
  const entry = (name, key) => (Object.hasOwn(section(name), key) ? section(name)[key] : undefined);
  return {
    entry,
    keys: (name) => Object.keys(section(name)),
    label: (name, key) => entry(name, key)?.label ?? key,
    description: (name, key) => entry(name, key)?.description ?? '',
  };
}

// AI effort levels, lowest rank first.
function effortLevels(v) {
  return v
    .keys('ai_effort')
    .map((key) => ({ key, ...v.entry('ai_effort', key) }))
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
}

function effortInfo(key, v) {
  const levels = effortLevels(v);
  const level = levels.findIndex((entry) => entry.key === key);
  return {
    label: v.label('ai_effort', key),
    description: v.description('ai_effort', key),
    rank: v.entry('ai_effort', key)?.rank ?? 0,
    level: level + 1,
    levels: levels.length,
  };
}

// The options of the "Sort by" control. app.js reads the data-* attributes.
function sortOptions(v) {
  const levels = effortLevels(v);
  const low = (levels[0]?.label ?? 'low').toLowerCase();
  const high = (levels.at(-1)?.label ?? 'high').toLowerCase();
  const workLeft = v.label('ratings', 'work_left');
  const significance = v.label('ratings', 'significance');
  return [
    { value: 'name', label: 'Name (A-Z)', noun: 'name', dir: 'asc', asc: 'A to Z', desc: 'Z to A' },
    { value: 'category', label: 'Category', noun: 'category', dir: 'asc', asc: 'A to Z', desc: 'Z to A' },
    { value: 'effort', label: 'AI effort', noun: 'AI effort', dir: 'asc', asc: `${low} to ${high}`, desc: `${high} to ${low}` },
    { value: 'work-left', label: workLeft, noun: workLeft.toLowerCase(), dir: 'asc', asc: 'least first', desc: 'most first' },
    { value: 'significance', label: significance, noun: significance.toLowerCase(), dir: 'desc', asc: 'least first', desc: 'most first' },
  ];
}

// Must match countText() in assets/app.js.
function countText(shown, total, sort) {
  return `Showing ${shown} of ${plural(total, 'problem', 'problems')}, sorted by ${sort.noun} (${sort[sort.dir]}).`;
}

function statusBadge(status, v) {
  return html`<span class="badge status-${status}">${v.label('status', status)}</span>`;
}

function sampleBadge(problem) {
  return problem.sample === true ? html` <span class="badge badge-sample">Sample</span>` : '';
}

// A row of small blocks, like a health bar. Decorative: the number is always
// shown as text too. Widths come from classes because the CSP blocks style="".
function pips(n, max, size = '') {
  const clamp = (value) => Math.max(0, Math.min(10, Math.round(Number(value) || 0)));
  return html`<span class="pips pips-max-${clamp(max)} pips-${clamp(n)}${size ? ` pips-${size}` : ''}" aria-hidden="true"></span>`;
}

function contributors(people, v) {
  return people.map((person, i) => html`${i ? ', ' : ''}<span class="contributor">${person.url ? externalLink(person.url, person.name) : person.name} <span class="kind">(${v.label('contributor_kind', person.kind)})</span></span>`);
}

function dateTime(value) {
  return html`<time datetime="${value}">${formatDate(value)}</time>`;
}

// ---------------------------------------------------------------------------
// The problem list (index.html)

function renderIndex(ctx) {
  const { problems, v } = ctx;
  const total = problems.length;
  const sorts = sortOptions(v);
  const countOf = (prop, value) => problems.filter((problem) => problem[prop] === value).length;
  const fields = v.keys('field').filter((key) => countOf('field', key) > 0);

  const checkbox = (name, key, label, count) =>
    html`<label class="check"><input type="checkbox" name="${name}" value="${key}" checked> <span>${label}</span> <span class="check-count">(${count})</span></label>`;

  const controls = html`<form id="controls" class="controls panel" role="search" aria-label="Search, sort and filter problems" autocomplete="off" hidden>
      <div class="control">
        <label for="q">Search</label>
        <input type="search" id="q" name="q" autocomplete="off" spellcheck="false" maxlength="200" placeholder="Name, topic or tag">
      </div>
      <div class="control">
        <label for="sort">Sort by</label>
        <div class="sort-row">
          <select id="sort" name="sort">
${sorts.map((sort, i) => html`            <option value="${sort.value}" data-dir="${sort.dir}" data-asc="${sort.asc}" data-desc="${sort.desc}" data-noun="${sort.noun}"${i === 0 ? html` selected` : ''}>${sort.label}</option>
`)}          </select>
          <button type="button" id="sort-dir" class="button">Order: ${sorts[0][sorts[0].dir]}</button>
        </div>
      </div>
      <details id="filters" class="filters" open>
        <summary>Filter by status and field</summary>
        <div class="filter-groups">
          <fieldset class="checks">
            <legend>Status</legend>
            <div class="check-list">
${v.keys('status').map((key) => html`              ${checkbox('status', key, v.label('status', key), countOf('status', key))}
`)}            </div>
          </fieldset>
          <fieldset class="checks">
            <legend>Field</legend>
            <div class="check-list">
${fields.map((key) => html`              ${checkbox('field', key, v.label('field', key), countOf('field', key))}
`)}            </div>
          </fieldset>
        </div>
      </details>
      <button type="button" id="reset" class="button button-quiet">Reset</button>
    </form>`;

  const results = html`<div class="results">
      <p id="result-count" class="result-count" aria-live="polite">${countText(total, total, sorts[0])}</p>
      <ul id="problem-list" class="cards" role="list">
${problems.map((problem) => problemCard(problem, ctx))}      </ul>
      <div id="empty" class="empty" hidden>
        <img class="pixel portrait" src="assets/stemgu.svg" alt="" width="64" height="64">
        <div class="dialog">
          <p>STEMgu found no problems that match these filters.</p>
          <p><button type="button" id="empty-reset" class="button">Clear search and filters</button></p>
        </div>
      </div>
    </div>`;

  const nothingYet = html`<div class="empty">
    <img class="pixel portrait" src="assets/stemgu.svg" alt="" width="64" height="64">
    <div class="dialog"><p>STEMgu found no problems in the index yet.</p></div>
  </div>`;

  const main = html`${total ? markerSprite() : ''}
<div class="wrap">
  <h1>Problems</h1>
  <p class="lede">An open index of STEM problems: open, unsolved, solved and resolved. Each problem has a progress map of checkpoints, so you can see what is done, what failed and what is next before you start work with AI.</p>
  <p class="lede-link"><a href="about/index.html#statuses">What the statuses, checkpoints and ratings mean</a></p>
  ${total === 0 ? nothingYet : html`<div class="index-layout">
    ${controls}
    ${results}
  </div>`}
</div>`;

  return layout({
    title: 'Problems',
    description: SITE_DESCRIPTION,
    root: '',
    current: 'problems',
    hasSamples: ctx.hasSamples,
    main,
    scripts: total === 0 ? [] : ['assets/app.js'],
  });
}

function problemCard(problem, { v }) {
  const fieldLabel = v.label('field', problem.field);
  const effort = effortInfo(problem.ai_effort, v);
  const tags = problem.tags ?? [];
  const search = [
    problem.name,
    ...(problem.aliases ?? []),
    problem.category,
    fieldLabel,
    ...tags,
    ...tags.map((tag) => tag.replace(/-/g, ' ')),
    problem.summary,
  ].join(' ').replace(/\s+/g, ' ').toLowerCase();
  const ratings = problem.ratings;
  const ratingData = ratings
    ? html` data-work-left="${ratings.work_left}" data-significance="${ratings.significance}"`
    : '';
  const ratingFacts = ratings
    ? RATINGS.map((key) => html`
            <div><dt>${v.label('ratings', key)}</dt><dd>${ratings[key]}/10 ${pips(ratings[key], 10)}</dd></div>`)
    : html`
            <div class="not-rated"><dt class="visually-hidden">Ratings</dt><dd>Not rated (${v.label('status', problem.status).toLowerCase()})</dd></div>`;

  return html`        <li class="card" data-id="${problem.id}" data-name="${problem.name}" data-category="${problem.category}" data-field="${problem.field}" data-status="${problem.status}" data-effort="${effort.rank}"${ratingData} data-search="${search}">
          <h2 class="card-title"><a href="problems/${problem.id}/index.html">${problem.name}</a></h2>
          <p class="card-badges">${statusBadge(problem.status, v)}${sampleBadge(problem)}</p>
          <p class="card-meta">${fieldLabel} · ${problem.category}</p>
          <p class="card-summary">${truncate(problem.summary, 200)}</p>
          <dl class="card-facts">
            <div><dt>AI effort</dt><dd>${effort.label} ${pips(effort.level, effort.levels)}</dd></div>${ratingFacts}
          </dl>
          ${miniMap(problem, v)}
        </li>
`;
}

function miniMap(problem, v) {
  const steps = problem.progress;
  const done = steps.filter((step) => step.status === 'done').length;
  const order = steps.map((step) => v.label('checkpoint_status', step.status).toLowerCase()).join(', ');
  const markers = steps.map((step) =>
    marker(step.status, { size: 18, title: `${v.label('checkpoint_status', step.status)}: ${step.title}` }));
  return html`<div class="minimap">
            <span class="minimap-track" role="img" aria-label="Checkpoints in order: ${order}">${markers}</span>
            <span class="minimap-text">${done} of ${plural(steps.length, 'checkpoint', 'checkpoints')} done</span>
          </div>`;
}

// ---------------------------------------------------------------------------
// One page per problem (problems/<id>/index.html)

function renderProblem(problem, ctx) {
  const { v } = ctx;
  const root = '../../';
  const statusLabel = v.label('status', problem.status);
  const tags = problem.tags ?? [];

  const header = html`<header class="problem-header">
    <h1>${problem.name}</h1>
    ${problem.aliases?.length ? html`<p class="aliases">Also known as: ${problem.aliases.join('; ')}</p>` : ''}
    <p class="badges">${statusBadge(problem.status, v)}${sampleBadge(problem)}</p>
    <p class="status-description"><strong>${statusLabel}:</strong> ${v.description('status', problem.status)}</p>
    <p class="problem-meta"><a href="${root}index.html?field=${problem.field}">${v.label('field', problem.field)}</a> · ${problem.category}</p>
    ${tags.length ? html`<div class="tags"><span class="tags-label">Tags:</span>
      <ul role="list">${tags.map((tag) => html`<li><a href="${root}index.html?q=${encodeURIComponent(tag)}">${tag}</a></li>`)}</ul>
    </div>` : ''}
    ${problem.sample === true ? html`<p class="sample-note">This is a made-up sample problem, used while the site is being built. Real data comes later.</p>` : ''}
  </header>`;

  const summary = html`<section class="summary" aria-labelledby="summary-title">
    <h2 id="summary-title">Summary</h2>
    <p>${problem.summary}</p>
    ${problem.updated ? html`<p class="updated">Entry updated ${dateTime(problem.updated)}</p>` : ''}
  </section>`;

  const main = html`${markerSprite()}
<div class="wrap problem">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <ol>
      <li><a href="${root}index.html">Problems</a></li>
      <li><span aria-current="page">${problem.name}</span></li>
    </ol>
  </nav>
  ${header}
  ${summary}
  ${factsPanel(problem, v)}
  ${progressSection(problem, v)}
  ${sourcesSection(problem, v)}
  <section class="panel improve" aria-labelledby="improve-title">
    <h2 id="improve-title">Improve this entry</h2>
    <p>Know of progress that is missing here, or spotted a mistake? Anyone can suggest a change to this entry on GitHub.</p>
    <p class="actions"><a class="button" href="${repoEditUrl(`data/problems/${problem.id}.json`)}" rel="noopener noreferrer">Improve this entry</a> <a class="button button-quiet" href="../${problem.id}.json">Raw data (JSON)</a></p>
  </section>
</div>`;

  return layout({
    title: problem.name,
    description: truncate(problem.summary, 160),
    root,
    hasSamples: ctx.hasSamples,
    main,
  });
}

function factsPanel(problem, v) {
  const effort = effortInfo(problem.ai_effort, v);
  const ratings = problem.ratings
    ? RATINGS.map((key) => {
      const scale = v.entry('ratings', key) ?? {};
      return html`
      <div class="fact">
        <dt>${v.label('ratings', key)}</dt>
        <dd><span class="fact-value">${problem.ratings[key]}/10</span> ${pips(problem.ratings[key], 10, 'large')}
          <span class="fact-note">${scale.description ?? ''} 1 = ${scale.low ?? 'lowest'}, 10 = ${scale.high ?? 'highest'}.</span></dd>
      </div>`;
    })
    : html`
      <div class="fact">
        <dt>Ratings</dt>
        <dd>Ratings don't apply: this problem is ${v.label('status', problem.status).toLowerCase()}. ${v.label('ratings', 'work_left')} and ${v.label('ratings', 'significance').toLowerCase()} are rated only for ${v.label('status', 'open').toLowerCase()} and ${v.label('status', 'unsolved').toLowerCase()} problems.</dd>
      </div>`;

  return html`<section class="panel facts" aria-labelledby="facts-title">
    <h2 id="facts-title">At a glance</h2>
    <dl>
      <div class="fact">
        <dt>AI effort</dt>
        <dd><span class="fact-value">${effort.label}</span> ${pips(effort.level, effort.levels, 'large')}
          <span class="fact-note">${effort.description}</span></dd>
      </div>${ratings}
    </dl>
  </section>`;
}

// "3 of 6 checkpoints done · 1 in progress · 1 dead end · 1 not started"
function progressSummary(steps, v) {
  const counts = {};
  for (const step of steps) counts[step.status] = (counts[step.status] ?? 0) + 1;
  const parts = [`${counts.done ?? 0} of ${plural(steps.length, 'checkpoint', 'checkpoints')} done`];
  const order = [...SUMMARY_ORDER, ...v.keys('checkpoint_status').filter((key) => !SUMMARY_ORDER.includes(key))];
  for (const key of order) {
    const n = counts[key];
    if (key === 'done' || !n) continue;
    const label = v.label('checkpoint_status', key).toLowerCase();
    parts.push(`${n} ${key === 'dead-end' && n !== 1 ? `${label}s` : label}`);
  }
  // Each count stays on one line; the line may break between counts.
  return parts.map((part, i) => html`${i ? ' · ' : ''}<span class="nowrap">${part}</span>`);
}

function progressSection(problem, v) {
  const steps = problem.progress;
  const nodes = steps.map((step, i) => {
    const anchor = `checkpoint-${step.id}`;
    const dateLabel = DATE_LABELS[step.status] ?? 'Date';
    return html`
      <li class="cp cp-${step.status}" id="${anchor}">
        <span class="cp-marker">${marker(step.status, { size: 27 })}</span>
        <div class="cp-body">
          <p class="cp-step"><a class="cp-self" href="#${anchor}">Checkpoint ${i + 1} of ${steps.length}<span class="visually-hidden">, link to this checkpoint</span></a></p>
          <h3 class="cp-title"><span class="cp-status">${v.label('checkpoint_status', step.status)}<span class="visually-hidden">:</span></span> ${step.title}</h3>
          ${step.description ? html`<p class="cp-description">${step.description}</p>` : ''}
          ${step.by?.length || step.date ? html`<p class="cp-meta">${step.by?.length ? html`<span>By ${contributors(step.by, v)}</span>` : ''}${step.by?.length && step.date ? ' · ' : ''}${step.date ? html`<span class="cp-when">${dateLabel} ${dateTime(step.date)}</span>` : ''}</p>` : ''}
          ${step.links?.length ? html`<ul class="cp-links" role="list">${step.links.map((link) => html`<li>${externalLink(link.url, link.title)}</li>`)}</ul>` : ''}
        </div>
      </li>`;
  });

  return html`<section class="progress" aria-labelledby="progress-title">
    <h2 id="progress-title">Progress map</h2>
    <p class="progress-summary">${progressSummary(steps, v)}</p>
    <div class="progress-layout">
      <ol class="map" role="list">${nodes}
      </ol>
      <aside class="legend panel" aria-labelledby="legend-title">
        <h3 id="legend-title">Checkpoint key</h3>
        ${checkpointLegend(v)}
      </aside>
    </div>
  </section>`;
}

function checkpointLegend(v) {
  return html`<dl class="legend-list">
${v.keys('checkpoint_status').map((key) => html`          <div><dt>${marker(key, { size: 18 })} <span class="cp-status cp-status-${key}">${v.label('checkpoint_status', key)}</span></dt><dd>${v.description('checkpoint_status', key)}</dd></div>
`)}        </dl>`;
}

function sourcesSection(problem, v) {
  return html`<section class="sources" aria-labelledby="sources-title">
    <h2 id="sources-title">Sources</h2>
    <p class="note">STEMularity links to sources and never hosts copies.</p>
    <ul class="source-list" role="list">
${problem.sources.map((source) => {
    const meta = [(source.authors ?? []).join(', '), source.year].filter((part) => part !== '' && part !== undefined);
    return html`      <li><span class="badge badge-kind">${v.label('source_kind', source.kind)}</span> ${externalLink(source.url, source.title)}${meta.length ? html`<span class="source-meta"> · ${meta.join(' · ')}</span>` : ''}</li>
`;
  })}    </ul>
  </section>`;
}

// ---------------------------------------------------------------------------
// About (about/index.html)

function renderAbout(ctx) {
  const { problems, v } = ctx;
  const root = '../';
  const levels = effortLevels(v);
  const example = problems[0];

  const defs = (items) => html`<dl class="defs">
${items.map(([term, text]) => html`    <div><dt>${term}</dt><dd>${text}</dd></div>
`)}  </dl>`;

  const main = html`${markerSprite()}
<div class="wrap prose">
  <h1>About STEMularity</h1>
  <p class="lede">STEMularity is an open index of STEM problems: open, unsolved, solved and resolved. Each problem has a progress map, an ordered list of checkpoints from the first step to a full solution.</p>
  <p>The aim is simple. People who use AI to work on hard problems should build on work that is already done, not redo it. Before you start, read the problem's progress map. Build on the checkpoints that are done. Check with the people on checkpoints in progress. Skip the dead ends, unless you have a new idea.</p>

  <h2 id="pledge">The open-knowledge pledge</h2>
  <ul class="pledge">
    <li><strong>No gatekeeping.</strong> Everything here is free to read, with no account and no paywall. You can <a href="${root}problems.json">download all the data at once</a>, and <a href="${repoFileUrl('CONTRIBUTING.md')}" rel="noopener noreferrer">anyone can contribute</a>.</li>
    <li><strong>No patents.</strong> Ideas and solutions recorded here are published openly, for everyone. The project will never seek patents on them, and contributors agree not to seek patents on what they contribute.</li>
    <li><strong>Link, don't copy.</strong> Sources are linked, never hosted. STEMularity never stores copies of papers.</li>
  </ul>
  <p>Code is under the <a href="${repoFileUrl('LICENSE')}" rel="noopener noreferrer">MIT license</a>. Content, including the problem data and the STEMgu mascot, is under <a href="${CC_BY_URL}" rel="noopener noreferrer">CC BY 4.0</a>: you can share and adapt it if you give credit. The full pledge is in the <a href="${repoFileUrl('README.md')}#the-open-knowledge-pledge" rel="noopener noreferrer">project README</a>.</p>

  <h2 id="statuses">Problem statuses</h2>
  ${defs(v.keys('status').map((key) => [statusBadge(key, v), v.description('status', key)]))}

  <h2 id="checkpoints">Checkpoints</h2>
  <p>A progress map is a list of checkpoints, in the order of the route to a full solution. Each checkpoint says who did the work, including AI systems, and when. Dead ends are kept on the map so nobody repeats them.</p>
  ${defs(v.keys('checkpoint_status').map((key) => [
    html`${marker(key, { size: 18 })} <span class="cp-status cp-status-${key}">${v.label('checkpoint_status', key)}</span>`,
    v.description('checkpoint_status', key),
  ]))}

  <h2 id="ai-effort">Recommended AI effort</h2>
  <p>How much AI reasoning effort to plan for when you work on a problem's next open checkpoint, from lowest to highest.</p>
  ${defs(levels.map((level, i) => [html`${level.label ?? level.key} ${pips(i + 1, levels.length)}`, level.description ?? '']))}

  <h2 id="ratings">Ratings</h2>
  <p>Open and unsolved problems have two ratings, each from 1 to 10. Solved and resolved problems are not rated.</p>
  ${defs(v.keys('ratings').map((key) => {
    const scale = v.entry('ratings', key) ?? {};
    return [scale.label ?? key, html`${scale.description ?? ''} <span class="scale">1 = ${scale.low ?? 'lowest'}, 10 = ${scale.high ?? 'highest'}.</span>`];
  }))}

  <h2 id="fields">Fields</h2>
  <p>Every problem belongs to one broad field, used for filtering: ${v.keys('field').map((key) => v.label('field', key)).join(', ')}.</p>

  <h2 id="data">Data for people and AI agents</h2>
  <ul>
    <li><a href="${root}problems.json">problems.json</a>: every problem in one file.</li>
    <li>problems/&lt;id&gt;.json: one problem${example ? html`, for example <a href="${root}problems/${example.id}.json">problems/${example.id}.json</a>` : ''}.</li>
    <li><a href="${root}schema/problem.schema.json">schema/problem.schema.json</a> and <a href="${root}schema/vocabulary.json">schema/vocabulary.json</a>: the data format, and the labels for every value.</li>
  </ul>
  <p>These static files are a first step toward an API for AI agents. The data is under CC BY 4.0.</p>

  <h2 id="contribute">Contribute</h2>
  <p>Every problem is a JSON file in the <a href="${REPO_URL}" rel="noopener noreferrer">GitHub repository</a>. To add progress or fix a mistake, use the "Improve this entry" link on a problem's page, or open a pull request. The <a href="${repoFileUrl('CONTRIBUTING.md')}" rel="noopener noreferrer">contributing guide</a> explains the steps, and the <a href="${repoFileUrl('docs/DATA_FORMAT.md')}" rel="noopener noreferrer">data format guide</a> explains every field.</p>

  <h2 id="stemgu">STEMgu</h2>
  <div class="mascot">
    <img class="pixel portrait" src="${root}assets/stemgu.svg" alt="STEMgu, a small pixel-art creature" width="64" height="64">
    <p>STEMgu is the STEMularity mascot. The pixel art on this site is a placeholder until official STEMgu art exists.</p>
  </div>
</div>`;

  return layout({
    title: 'About',
    description: 'What STEMularity is, its open-knowledge pledge, and what every status, checkpoint, AI effort level and rating means.',
    root,
    current: 'about',
    hasSamples: ctx.hasSamples,
    main,
  });
}

// ---------------------------------------------------------------------------
// Page not found (404.html). Served at any address, so its URLs start at '/'.

function renderNotFound(ctx) {
  const main = html`<div class="wrap notfound">
  <h1>Page not found</h1>
  <div class="mascot speech">
    <img class="pixel portrait" src="/assets/stemgu.svg" alt="" width="96" height="96">
    <div class="dialog">
      <p>STEMgu looked everywhere, but this page is not on the map.</p>
      <p>The link may be wrong, or the page may have moved.</p>
    </div>
  </div>
  <p class="actions"><a class="button" href="/">Go to the problem list</a> <a class="button button-quiet" href="/about/">About STEMularity</a></p>
</div>`;

  return layout({
    title: 'Page not found',
    description: 'This page is not on the STEMularity map.',
    root: '/',
    hasSamples: ctx.hasSamples,
    main,
  });
}


// Tests for the problem validator: the rules in scripts/lib/problems.mjs and
// the command line in scripts/validate.mjs.
//
// Each test writes its own data folder to the system temp folder: a copy of
// the real data/schema/ plus made-up problems derived from baseProblem(). The
// folder is removed when the test ends.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_DATA_DIR, ROOT, formatAjvErrors, loadProblems } from '../scripts/lib/problems.mjs';

const SCHEMA_DIR = path.join(DEFAULT_DATA_DIR, 'schema');
const SCHEMA = JSON.parse(await readFile(path.join(SCHEMA_DIR, 'problem.schema.json'), 'utf8'));

// A fixed "today" for loadProblems(), so the tests do not depend on the clock.
const LATEST = '2026-06-30';

// Positions of the checkpoints in baseProblem().progress.
const DONE = 0;
const DISPUTED = 1;
const DEAD_END = 2;
const IN_PROGRESS = 3;
const NOT_STARTED = 4;

/** A valid problem that uses every optional field and every checkpoint status. */
function baseProblem() {
  return {
    $schema: '../schema/problem.schema.json',
    id: 'sample-problem',
    name: 'Sample Problem',
    aliases: ['The test problem'],
    field: 'mathematics',
    category: 'Combinatorics',
    tags: ['sample-data', 'tilings'],
    status: 'unsolved',
    summary: 'Made-up problem for the validator tests. Nothing here describes real work.',
    ai_effort: 'medium',
    ratings: { work_left: 5, significance: 4 },
    progress: [
      {
        id: 'problem-posed',
        title: 'Problem posed',
        status: 'done',
        by: [{ name: 'Ada Placeholder', kind: 'person', url: 'https://example.org/people/ada' }],
        date: '2019-03',
        links: [{ title: 'Statement (sample link)', url: 'https://example.org/sample/statement' }],
      },
      {
        id: 'small-cases',
        title: 'Small cases checked by computer',
        status: 'disputed',
        by: [{ name: 'Example Research Agent', kind: 'ai' }],
        date: '2024-02-29',
      },
      {
        id: 'first-route',
        title: 'First proof route',
        description: 'Failed. Recorded so nobody repeats it.',
        status: 'dead-end',
        by: [{ name: 'Sample Tiling Collective', kind: 'group' }],
        date: '2025',
      },
      {
        id: 'second-route',
        title: 'Second proof route',
        status: 'in-progress',
        by: [
          { name: 'Bo Exampleton', kind: 'person' },
          { name: 'Example Proof Assistant', kind: 'ai' },
        ],
      },
      { id: 'formal-proof', title: 'Machine-checked proof', status: 'not-started' },
    ],
    sources: [
      { title: 'Sample paper', url: 'https://example.org/papers/sample', kind: 'paper', authors: ['Ada Placeholder'], year: 2019 },
      // Plain http:// on purpose: the schema allows it.
      { title: 'Sample dataset', url: 'http://example.org/datasets/sample', kind: 'dataset' },
    ],
    sample: true,
    updated: '2026-06-30',
  };
}

/** A valid problem with only the required properties. */
function minimalProblem() {
  return {
    id: 'minimal-problem',
    name: 'Minimal Problem',
    field: 'physics',
    category: 'Optics',
    status: 'solved',
    summary: 'Made-up problem with only the required properties, for the validator tests.',
    ai_effort: 'low',
    progress: [{ id: 'answer', title: 'Answer found', status: 'done', by: [{ name: 'Ada Placeholder', kind: 'person' }], date: '2020' }],
    sources: [{ title: 'Sample page', url: 'https://example.org/minimal', kind: 'website' }],
  };
}

/**
 * Writes a data folder to the system temp folder and returns its path. It
 * holds a copy of the real data/schema/, a problems/ folder, and `files`:
 * paths relative to the data folder, mapped to their content (an object is
 * written as JSON, a string as it is). The folder is removed after test `t`.
 */
async function makeDataDir(t, files = {}, { schema = true, problems = true } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'stemularity-validate-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  if (schema) await cp(SCHEMA_DIR, path.join(dir, 'schema'), { recursive: true });
  if (problems) await mkdir(path.join(dir, 'problems'));
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
  }
  return dir;
}

/** Maps each problem to problems/<id>.json. */
const problemFiles = (...problems) => Object.fromEntries(problems.map((p) => [`problems/${p.id}.json`, p]));

/** Runs loadProblems() on a new data folder holding `files`. */
async function load(t, files, options = {}) {
  const dir = await makeDataDir(t, files);
  return { dir, ...(await loadProblems({ dataDir: dir, latestDate: LATEST, ...options })) };
}

/** Changes a copy of a valid problem, then runs loadProblems() on it alone. */
async function loadChanged(t, change, from = baseProblem) {
  const problem = from();
  change(problem);
  return load(t, problemFiles(problem));
}

const posix = (file) => file.split(path.sep).join('/');
const list = (items) => items.map(({ file, message }) => `  ${file}  ${message}`).join('\n') || '  (none)';

/**
 * Asserts that one of `items` has exactly the `expected` message (or matches
 * it, for a RegExp), from a file whose path ends with `file` when given.
 */
function assertReported(items, kind, expected, file) {
  const found = items.some(
    (item) =>
      (expected instanceof RegExp ? expected.test(item.message) : item.message === expected) &&
      (!file || posix(item.file).endsWith(`/${file}`)),
  );
  assert.ok(found, `expected ${kind} ${JSON.stringify(String(expected))}${file ? ` for ${file}` : ''}, got:\n${list(items)}`);
}
const assertError = (result, expected, file) => assertReported(result.errors, 'error', expected, file);
const assertWarning = (result, expected, file) => assertReported(result.warnings, 'warning', expected, file);

/** Asserts that the folder's only problem was rejected with this error. */
function assertRejected(result, expected, file = 'problems/sample-problem.json') {
  assertError(result, expected, file);
  assert.deepEqual(result.problems, [], 'a problem with errors must not be returned');
}

/** Asserts that the folder's problems all loaded, with no errors or warnings. */
function assertClean(result, count = 1) {
  assert.deepEqual(result.errors, [], `errors:\n${list(result.errors)}`);
  assert.deepEqual(result.warnings, [], `warnings:\n${list(result.warnings)}`);
  assert.equal(result.problems.length, count);
}

/** The message the validator gives for a value outside an enum. */
const oneOf = (where, values) => `${where}: must be one of ${values.map((v) => JSON.stringify(v)).join(', ')}`;

/** Every value of a "url" property anywhere inside `value`. */
function urlsIn(value) {
  if (Array.isArray(value)) return value.flatMap(urlsIn);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, inner]) => (key === 'url' && typeof inner === 'string' ? [inner] : urlsIn(inner)));
}

describe('the real data/ folder', () => {
  test('has no errors and no warnings', async () => {
    const { problems, errors, warnings } = await loadProblems();
    assert.deepEqual(errors, [], `errors:\n${list(errors)}`);
    assert.deepEqual(warnings, [], `warnings:\n${list(warnings)}`);
    assert.ok(problems.length > 0, 'data/problems/ should hold at least one problem');
  });

  test('sample problems link only to https://example.org/', async () => {
    const { problems } = await loadProblems();
    for (const problem of problems.filter((p) => p.sample)) {
      for (const url of urlsIn(problem)) {
        assert.ok(url.startsWith('https://example.org/'), `${problem.id}: made-up sample data must not link to ${url}`);
      }
    }
  });

  test('reports files inside the repository relative to its root', async () => {
    // A latest date long ago turns every dated entry into an error.
    const { errors } = await loadProblems({ latestDate: '1000-01-01' });
    assert.ok(errors.length > 0);
    for (const { file } of errors) assert.match(file, /^data\/problems\/[a-z0-9-]+\.json$/);
  });
});

describe('valid problems', () => {
  test('a minimal problem with only the required properties passes and is returned', async (t) => {
    const problem = minimalProblem();
    const result = await load(t, problemFiles(problem));
    assertClean(result);
    assert.deepEqual(result.problems, [problem]);
  });

  test('a problem that uses every optional property and every checkpoint status passes', async (t) => {
    const problem = baseProblem();
    const result = await load(t, problemFiles(problem));
    assertClean(result);
    assert.deepEqual(result.problems, [problem]);
  });

  test('the schema and vocabulary used are returned too', async (t) => {
    const result = await load(t, problemFiles(minimalProblem()));
    assert.deepEqual(result.schema, SCHEMA);
    assert.equal(result.vocabulary.status.unsolved.label, 'Unsolved');
  });

  test('only valid problems are returned, sorted by name, ignoring case', async (t) => {
    const named = (id, name, change = () => {}) => {
      const problem = { ...minimalProblem(), id, name };
      change(problem);
      return problem;
    };
    const result = await load(
      t,
      problemFiles(
        named('zeta-problem', 'Zeta problem'),
        named('alpha-problem', 'alpha problem'),
        named('broken-problem', 'Broken problem', (p) => delete p.summary),
        named('mu-problem', 'Mu problem'),
      ),
    );
    assertError(result, '(top level): missing required property "summary"', 'problems/broken-problem.json');
    assert.deepEqual(
      result.problems.map((p) => p.id),
      ['alpha-problem', 'mu-problem', 'zeta-problem'],
    );
  });

  test('Markdown, .gitkeep and .DS_Store files are allowed, and are not read as problems', async (t) => {
    const result = await load(t, {
      ...problemFiles(baseProblem()),
      'README.md': '# Data\n',
      'problems/README.md': '# Notes\n',
      'problems/.gitkeep': '',
      'extra/.gitkeep': '',
      '.DS_Store': '',
      'problems/.DS_Store': '',
    });
    assertClean(result);
  });

  test('a byte order mark at the start of a file is ignored', async (t) => {
    const result = await load(t, { 'problems/sample-problem.json': `\uFEFF${JSON.stringify(baseProblem())}` });
    assertClean(result);
  });
});

describe('errors', () => {
  test('a missing required property', async (t) => {
    const cases = [
      ['summary', (p) => delete p.summary, '(top level): missing required property "summary"'],
      ['checkpoint title', (p) => delete p.progress[DONE].title, `/progress/${DONE}: missing required property "title"`],
      ['source kind', (p) => delete p.sources[0].kind, '/sources/0: missing required property "kind"'],
    ];
    for (const [name, change, expected] of cases) {
      await t.test(name, async (t) => assertRejected(await loadChanged(t, change), expected));
    }
  });

  test('an unknown property', async (t) => {
    const cases = [
      ['top level', (p) => (p.difficulty = 3), '(top level): unknown property "difficulty"'],
      ['checkpoint', (p) => (p.progress[DONE].owner = 'Ada'), `/progress/${DONE}: unknown property "owner"`],
      ['source', (p) => (p.sources[0].pdf = 'paper.pdf'), '/sources/0: unknown property "pdf"'],
    ];
    for (const [name, change, expected] of cases) {
      await t.test(name, async (t) => assertRejected(await loadChanged(t, change), expected));
    }
  });

  test('a value outside the allowed list', async (t) => {
    const { checkpoint, contributor, source } = SCHEMA.$defs;
    const cases = [
      ['status', (p) => (p.status = 'pending'), oneOf('/status', SCHEMA.properties.status.enum)],
      ['field', (p) => (p.field = 'alchemy'), oneOf('/field', SCHEMA.properties.field.enum)],
      ['AI effort', (p) => (p.ai_effort = 'extreme'), oneOf('/ai_effort', SCHEMA.properties.ai_effort.enum)],
      ['checkpoint status', (p) => (p.progress[DISPUTED].status = 'finished'), oneOf(`/progress/${DISPUTED}/status`, checkpoint.properties.status.enum)],
      ['contributor kind', (p) => (p.progress[DONE].by[0].kind = 'robot'), oneOf(`/progress/${DONE}/by/0/kind`, contributor.properties.kind.enum)],
      ['source kind', (p) => (p.sources[1].kind = 'journal'), oneOf('/sources/1/kind', source.properties.kind.enum)],
    ];
    for (const [name, change, expected] of cases) {
      await t.test(name, async (t) => assertRejected(await loadChanged(t, change), expected));
    }
    // The message names every allowed value.
    assert.equal(oneOf('/status', SCHEMA.properties.status.enum), '/status: must be one of "open", "unsolved", "solved", "resolved"');
  });

  test('ratings missing on an open or unsolved problem', async (t) => {
    for (const status of ['open', 'unsolved']) {
      await t.test(status, async (t) => {
        const result = await loadChanged(t, (p) => {
          p.status = status;
          delete p.ratings;
        });
        assertRejected(result, '(top level): missing required property "ratings"');
      });
    }
  });

  test('ratings on a solved or resolved problem', async (t) => {
    for (const status of ['solved', 'resolved']) {
      await t.test(status, async (t) => {
        const result = await loadChanged(t, (p) => (p.status = status));
        assertRejected(result, '/ratings: ratings are only allowed when status is "open" or "unsolved"');
      });
    }
  });

  test('a misspelled or missing status is reported on its own, without a ratings error', async (t) => {
    const cases = [
      ['misspelled', (p) => (p.status = 'pending'), oneOf('/status', SCHEMA.properties.status.enum)],
      ['missing', (p) => delete p.status, '(top level): missing required property "status"'],
    ];
    for (const [name, change, expected] of cases) {
      await t.test(name, async (t) => {
        const result = await loadChanged(t, change);
        assertRejected(result, expected);
        assert.ok(!result.errors.some(({ message }) => message.includes('ratings')), list(result.errors));
      });
    }
  });

  test('a rating outside 1 to 10, or not a whole number', async (t) => {
    const cases = [
      ['above 10', (r) => (r.work_left = 11), '/ratings/work_left: must be <= 10'],
      ['below 1', (r) => (r.significance = 0), '/ratings/significance: must be >= 1'],
      ['a fraction', (r) => (r.work_left = 5.5), '/ratings/work_left: must be integer'],
      ['a string', (r) => (r.significance = '7'), '/ratings/significance: must be integer'],
      ['one rating missing', (r) => delete r.significance, '/ratings: missing required property "significance"'],
      ['an extra rating', (r) => (r.difficulty = 3), '/ratings: unknown property "difficulty"'],
    ];
    for (const [name, change, expected] of cases) {
      await t.test(name, async (t) => assertRejected(await loadChanged(t, (p) => change(p.ratings)), expected));
    }
  });

  test('an id, checkpoint id or tag that is not kebab-case', async (t) => {
    const kebab = 'must be lowercase words joined by hyphens, like "my-problem-name"';
    for (const id of ['Sample-Problem', 'sample_problem', 'sample--problem', '-sample-problem', 'sample problem', 'sample-problem-']) {
      await t.test(`id ${JSON.stringify(id)}`, async (t) => {
        // Saved as sample-problem.json, so only the id itself is wrong.
        const problem = baseProblem();
        problem.id = id;
        assertRejected(await load(t, { 'problems/sample-problem.json': problem }), `/id: ${kebab}`);
      });
    }
    await t.test('checkpoint id', async (t) => {
      assertRejected(await loadChanged(t, (p) => (p.progress[DONE].id = 'Problem Posed')), `/progress/${DONE}/id: ${kebab}`);
    });
    await t.test('tag', async (t) => {
      assertRejected(await loadChanged(t, (p) => (p.tags = ['sample-data', 'Number_Theory'])), `/tags/1: ${kebab}`);
    });
  });

  test('an id that does not match the file name', async (t) => {
    const result = await load(t, { 'problems/other-name.json': baseProblem() });
    assertRejected(result, 'id "sample-problem" must match the file name "other-name.json".', 'problems/other-name.json');
  });

  test('two checkpoints with the same id', async (t) => {
    const result = await loadChanged(t, (p) => (p.progress[DEAD_END].id = p.progress[DONE].id));
    assertRejected(result, `/progress/${DEAD_END}/id: checkpoint id "problem-posed" is used more than once`);
  });

  test('a not-started checkpoint with "by" or "date"', async (t) => {
    await t.test('by', async (t) => {
      const result = await loadChanged(t, (p) => (p.progress[NOT_STARTED].by = [{ name: 'Ada Placeholder', kind: 'person' }]));
      assertRejected(result, `/progress/${NOT_STARTED}/by: not allowed on a "not-started" checkpoint`);
    });
    await t.test('date', async (t) => {
      const result = await loadChanged(t, (p) => (p.progress[NOT_STARTED].date = '2025'));
      assertRejected(result, `/progress/${NOT_STARTED}/date: not allowed on a "not-started" checkpoint`);
    });
  });

  test('a done, disputed or dead-end checkpoint without a date', async (t) => {
    for (const [status, i] of [['done', DONE], ['disputed', DISPUTED], ['dead-end', DEAD_END]]) {
      await t.test(status, async (t) => {
        const result = await loadChanged(t, (p) => delete p.progress[i].date);
        assertRejected(result, `/progress/${i}: missing required property "date"`);
      });
    }
  });

  test('an in-progress, done, disputed or dead-end checkpoint without "by"', async (t) => {
    for (const [status, i] of [['in-progress', IN_PROGRESS], ['done', DONE], ['disputed', DISPUTED], ['dead-end', DEAD_END]]) {
      await t.test(status, async (t) => {
        const result = await loadChanged(t, (p) => delete p.progress[i].by);
        assertRejected(result, `/progress/${i}: missing required property "by"`);
      });
    }
  });

  test('a malformed date', async (t) => {
    const malformed = ['2024-13', '2024-00', '2024-1-5', '2024-01-32', '24-01-01', '2024/01/01', '2024-01-01T10:00', 'March 2024', ''];
    for (const date of malformed) {
      await t.test(JSON.stringify(date), async (t) => {
        const result = await loadChanged(t, (p) => (p.progress[DONE].date = date));
        assertRejected(result, `/progress/${DONE}/date: must be a date as YYYY, YYYY-MM or YYYY-MM-DD`);
      });
    }
    await t.test('in "updated"', async (t) => {
      assertRejected(await loadChanged(t, (p) => (p.updated = '2026-6-1')), '/updated: must be a date as YYYY, YYYY-MM or YYYY-MM-DD');
    });
    await t.test('a number', async (t) => {
      assertRejected(await loadChanged(t, (p) => (p.progress[DONE].date = 2024)), `/progress/${DONE}/date: must be string`);
    });
  });

  test('a date that is not a real calendar day', async (t) => {
    for (const date of ['2025-02-29', '1900-02-29', '2026-04-31']) {
      await t.test(date, async (t) => {
        const result = await loadChanged(t, (p) => (p.progress[DONE].date = date));
        assertRejected(result, `/progress/${DONE}/date: "${date}" is not a real calendar date`);
      });
    }
    await t.test('real leap days pass', async (t) => {
      for (const date of ['2024-02-29', '2000-02-29']) {
        assertClean(await loadChanged(t, (p) => (p.progress[DONE].date = date)));
      }
    });
  });

  test('a date in the future', async (t) => {
    // LATEST is 2026-06-30. A partial date is compared at its own precision.
    for (const date of ['2026-07-01', '2026-07', '2027']) {
      await t.test(date, async (t) => {
        const result = await loadChanged(t, (p) => (p.progress[DONE].date = date));
        assertRejected(result, `/progress/${DONE}/date: "${date}" is in the future`);
      });
    }
    await t.test('in "updated"', async (t) => {
      assertRejected(await loadChanged(t, (p) => (p.updated = '2026-07-01')), '/updated: "2026-07-01" is in the future');
    });
    await t.test('dates up to the latest date pass', async (t) => {
      for (const date of ['2026-06-30', '2026-06', '2026']) {
        assertClean(await loadChanged(t, (p) => (p.progress[DONE].date = date)));
      }
    });
  });

  test('the latest date allowed is tomorrow (UTC) unless latestDate is given', async (t) => {
    const dated = (date) => {
      const problem = baseProblem();
      problem.progress[DONE].date = date;
      return problemFiles(problem);
    };
    const today = new Date().toISOString().slice(0, 10);
    const todayResult = await loadProblems({ dataDir: await makeDataDir(t, dated(today)) });
    assert.deepEqual(todayResult.errors, [], `errors:\n${list(todayResult.errors)}`);
    const farResult = await loadProblems({ dataDir: await makeDataDir(t, dated('9999')) });
    assertRejected(farResult, `/progress/${DONE}/date: "9999" is in the future`);

    // A Date object is read in UTC.
    const dir = await makeDataDir(t, dated('2026-07-01'));
    const dateResult = await loadProblems({ dataDir: dir, latestDate: new Date('2026-06-30T23:59:59Z') });
    assertRejected(dateResult, `/progress/${DONE}/date: "2026-07-01" is in the future`);

    // Anything else is a bug in the caller, not in the data.
    for (const latestDate of ['2026', '30/06/2026', 20260630, new Date('not a date')]) {
      await assert.rejects(loadProblems({ dataDir: dir, latestDate }), {
        name: 'TypeError',
        message: /^latestDate must be a date as YYYY-MM-DD/,
      });
    }
  });

  test('a URL that is not http(s), or not absolute', async (t) => {
    const http = 'must be a full http:// or https:// address with a host name';
    const absolute = 'must be an absolute URL';
    const cases = [
      ['ftp source', (p) => (p.sources[0].url = 'ftp://example.org/papers/sample'), '/sources/0/url', [http]],
      ['mailto contributor', (p) => (p.progress[DONE].by[0].url = 'mailto:ada@example.org'), `/progress/${DONE}/by/0/url`, [http]],
      ['javascript link', (p) => (p.progress[DONE].links[0].url = 'javascript:alert(1)'), `/progress/${DONE}/links/0/url`, [http]],
      ['relative link', (p) => (p.progress[DONE].links[0].url = 'notes/statement.html'), `/progress/${DONE}/links/0/url`, [http, absolute]],
      ['root-relative source', (p) => (p.sources[0].url = '/papers/sample'), '/sources/0/url', [http, absolute]],
      ['protocol-relative source', (p) => (p.sources[0].url = '//example.org/papers/sample'), '/sources/0/url', [http, absolute]],
      ['bare scheme with no host', (p) => (p.sources[0].url = 'https://'), '/sources/0/url', [http]],
    ];
    for (const [name, change, where, expected] of cases) {
      await t.test(name, async (t) => {
        const result = await loadChanged(t, change);
        for (const message of expected) assertRejected(result, `${where}: ${message}`);
      });
    }
  });

  test('a file that is not valid JSON', async (t) => {
    const result = await load(t, {
      ...problemFiles(minimalProblem()),
      'problems/broken-file.json': '{ "id": "broken-file", }\n',
      'problems/empty-file.json': '',
    });
    // The message says where the mistake is.
    assertError(result, /^invalid JSON: .*line 1 column 24/, 'problems/broken-file.json');
    assertError(result, /^invalid JSON: /, 'problems/empty-file.json');
    assert.deepEqual(
      result.problems.map((p) => p.id),
      ['minimal-problem'],
      'other files still load',
    );
  });

  test('a PDF, or any other file that is not JSON or Markdown, anywhere under data/', async (t) => {
    const copies = ['problems/sample-paper.pdf', 'papers/2024/scan.PDF', 'schema/diagram.png', 'notes.txt'];
    const result = await load(t, {
      ...problemFiles(baseProblem()),
      ...Object.fromEntries(copies.map((file) => [file, 'not really a PDF'])),
    });
    for (const file of copies) {
      assertError(result, 'data/ holds only JSON and Markdown. Link to papers and other sources instead of committing copies of them.', file);
    }
    assert.equal(result.errors.length, copies.length, `errors:\n${list(result.errors)}`);
  });

  test('a subfolder inside problems/', async (t) => {
    const result = await load(t, { ...problemFiles(minimalProblem()), 'problems/extra/sample-problem.json': baseProblem() });
    assertError(result, 'data/problems/ must be flat: one <id>.json file per problem, no subfolders.', 'problems/extra');
    assert.deepEqual(
      result.problems.map((p) => p.id),
      ['minimal-problem'],
      'files in the subfolder are not loaded',
    );
  });

  test('a problem file whose extension is not lowercase .json', async (t) => {
    const result = await load(t, { 'problems/sample-problem.JSON': baseProblem() });
    assertRejected(result, 'problem files must end in ".json", in lowercase. Rename it to "sample-problem.json".', 'problems/sample-problem.JSON');
    assert.deepEqual(result.warnings, []);
  });

  test('vocabulary.json out of step with the schema', async (t) => {
    const cases = [
      ['a value the schema allows is missing', (v) => delete v.status.resolved, '"status" is missing labels for: resolved.'],
      ['a whole section is missing', (v) => delete v.contributor_kind, '"contributor_kind" is missing labels for: person, group, ai.'],
      ['a value the schema does not allow', (v) => (v.field.alchemy = { label: 'Alchemy' }), '"field" has labels for values the schema does not allow: alchemy.'],
      ['a label is missing', (v) => delete v.source_kind.video.label, '"source_kind.video" needs a "label" string.'],
      ['two AI effort levels share a rank', (v) => (v.ai_effort.max.rank = 3), 'every "ai_effort" entry needs a unique integer "rank".'],
      ['an entry is null', (v) => (v.ai_effort.max = null), '"ai_effort.max" needs a "label" string.'],
    ];
    for (const [name, change, expected] of cases) {
      await t.test(name, async (t) => {
        const dir = await makeDataDir(t, problemFiles(baseProblem()));
        const file = path.join(dir, 'schema', 'vocabulary.json');
        const vocabulary = JSON.parse(await readFile(file, 'utf8'));
        change(vocabulary);
        await writeFile(file, JSON.stringify(vocabulary, null, 2));
        const result = await loadProblems({ dataDir: dir, latestDate: LATEST });
        assertError(result, expected, 'schema/vocabulary.json');
      });
    }
  });

  test('a data folder without schema files', async (t) => {
    const dir = await makeDataDir(t, problemFiles(baseProblem()), { schema: false });
    const result = await loadProblems({ dataDir: dir, latestDate: LATEST });
    assertError(result, /^cannot read file: ENOENT/, 'schema/problem.schema.json');
    assertError(result, /^cannot read file: ENOENT/, 'schema/vocabulary.json');
    assert.deepEqual(result.problems, []);
  });

  test('a data folder without a problems folder', async (t) => {
    const dir = await makeDataDir(t, {}, { problems: false });
    const result = await loadProblems({ dataDir: dir, latestDate: LATEST });
    assertError(result, /^cannot read the problems folder: ENOENT/, 'problems');
    assert.deepEqual(result.warnings, [], 'the error is enough, so no "no problems found" warning');
  });
});

describe('warnings', () => {
  test('a solved or resolved problem with no done checkpoint', async (t) => {
    for (const status of ['solved', 'resolved']) {
      await t.test(status, async (t) => {
        const result = await loadChanged(t, (p) => {
          p.status = status;
          delete p.ratings;
          p.progress = p.progress.filter((checkpoint) => checkpoint.status !== 'done');
        });
        assert.deepEqual(result.errors, [], `errors:\n${list(result.errors)}`);
        assertWarning(result, `status is "${status}" but no checkpoint is "done"`, 'problems/sample-problem.json');
        assert.equal(result.problems.length, 1, 'a warning does not stop the problem from loading');
      });
    }
  });

  test('an open or unsolved problem where every checkpoint is done', async (t) => {
    for (const status of ['open', 'unsolved']) {
      await t.test(status, async (t) => {
        const result = await loadChanged(t, (p) => {
          p.status = status;
          p.progress = p.progress.filter((checkpoint) => checkpoint.status === 'done');
        });
        assert.deepEqual(result.errors, [], `errors:\n${list(result.errors)}`);
        assertWarning(
          result,
          `every checkpoint is "done" but status is "${status}": add the next step, or update the status`,
          'problems/sample-problem.json',
        );
        assert.equal(result.problems.length, 1);
      });
    }
  });

  test('the same source URL listed twice', async (t) => {
    const result = await loadChanged(t, (p) => (p.sources[1].url = p.sources[0].url));
    assert.deepEqual(result.errors, [], `errors:\n${list(result.errors)}`);
    assertWarning(result, 'source https://example.org/papers/sample is listed more than once', 'problems/sample-problem.json');
    assert.equal(result.problems.length, 1);
  });

  test('two problems with the same name, ignoring case', async (t) => {
    const first = { ...baseProblem(), id: 'first-copy', name: 'Sample Problem' };
    const second = { ...baseProblem(), id: 'second-copy', name: 'SAMPLE problem' };
    const result = await load(t, problemFiles(first, second));
    assert.deepEqual(result.errors, [], `errors:\n${list(result.errors)}`);
    assertWarning(result, 'name "SAMPLE problem" is also used by first-copy.json.', 'problems/second-copy.json');
    assert.equal(result.problems.length, 2);
  });

  test('no problems at all', async (t) => {
    const result = await load(t, { 'problems/README.md': '# Notes\n' });
    assert.deepEqual(result.errors, []);
    assertWarning(result, 'no problems found.', 'problems');
  });
});

describe('formatAjvErrors', () => {
  test('returns an empty list when there are no errors', () => {
    assert.deepEqual(formatAjvErrors(), []);
    assert.deepEqual(formatAjvErrors(null), []);
  });

  test('skips "if" errors and repeated messages', () => {
    const missing = { keyword: 'required', instancePath: '', schemaPath: '#/required', params: { missingProperty: 'name' } };
    const ifError = { keyword: 'if', instancePath: '', schemaPath: '#/allOf/0/if', params: { failingKeyword: 'then' } };
    assert.deepEqual(formatAjvErrors([ifError, missing, missing]), ['(top level): missing required property "name"']);
  });

  test("uses Ajv's own message for a pattern, format or false schema it does not know", () => {
    const errors = [
      { keyword: 'pattern', instancePath: '/orcid', schemaPath: '#/properties/orcid/pattern', params: { pattern: '^[0-9X-]+$' }, message: 'must match pattern "^[0-9X-]+$"' },
      { keyword: 'format', instancePath: '/email', schemaPath: '#/properties/email/format', params: { format: 'email' }, message: 'must match format "email"' },
      { keyword: 'false schema', instancePath: '/legacy', schemaPath: '#/properties/legacy/false schema', params: {}, message: 'boolean schema is false' },
    ];
    assert.deepEqual(formatAjvErrors(errors), [
      '/orcid: must match pattern "^[0-9X-]+$"',
      '/email: must match format "email"',
      '/legacy: not allowed here',
    ]);
  });
});

describe('the command line', () => {
  // The test runner's own setting must not reach the validator.
  const { NODE_TEST_CONTEXT, ...parentEnv } = process.env;

  /** Runs scripts/validate.mjs from the repository root, outside GitHub Actions unless `env` says so. */
  const run = (args, env = {}) =>
    spawnSync(process.execPath, ['scripts/validate.mjs', ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...parentEnv, GITHUB_ACTIONS: '', ...env },
    });
  const annotations = (stdout) => stdout.split('\n').filter((line) => line.startsWith('::'));

  test('checks data/ when no folder is given', () => {
    const { status, stdout, stderr } = run([]);
    assert.equal(status, 0, stderr);
    assert.match(stdout, /^OK: \d+ problem\(s\) valid/);
  });

  test('exits 0 and prints a summary for valid data', async (t) => {
    const dir = await makeDataDir(t, problemFiles(baseProblem(), minimalProblem()));
    const { status, stdout, stderr } = run(['--data', dir]);
    assert.equal(status, 0, stderr);
    assert.equal(stdout, 'OK: 2 problem(s) valid (1 solved, 1 unsolved), 0 warning(s).\n');
    assert.equal(stderr, '');
  });

  test('exits 1 and prints each error for invalid data', async (t) => {
    const dir = await makeDataDir(t, { 'problems/other-name.json': baseProblem() });
    const { status, stdout, stderr } = run(['--data', dir]);
    assert.equal(status, 1);
    assert.ok(
      stderr.includes(`error    ${path.join(dir, 'problems', 'other-name.json')}  id "sample-problem" must match the file name "other-name.json".`),
      stderr,
    );
    assert.match(stderr, /\n1 error\(s\) found\. See docs\/DATA_FORMAT\.md for the rules\.\n$/);
    assert.deepEqual(annotations(stdout), [], 'no annotations outside GitHub Actions');
  });

  test('prints warnings but still exits 0', async (t) => {
    const problem = baseProblem();
    problem.sources[1].url = problem.sources[0].url;
    const dir = await makeDataDir(t, problemFiles(problem));
    const { status, stdout, stderr } = run(['--data', dir]);
    assert.equal(status, 0, stderr);
    assert.match(stderr, /^warning {2}.*sample-problem\.json {2}source https:\/\/example\.org\/papers\/sample is listed more than once\n$/);
    assert.equal(stdout, 'OK: 1 problem(s) valid (1 unsolved), 1 warning(s).\n');
  });

  test('prints GitHub Actions annotations when GITHUB_ACTIONS is true', async (t) => {
    const problem = baseProblem();
    problem.sources[0].url = 'https://example.org/papers/sample%20copy';
    problem.sources[1].url = problem.sources[0].url;
    const dir = await makeDataDir(t, { ...problemFiles(problem), 'problems/notes, draft.pdf': 'not really a PDF' });
    const { status, stdout } = run(['--data', dir], { GITHUB_ACTIONS: 'true' });
    assert.equal(status, 1);
    const lines = annotations(stdout);
    assert.equal(lines.length, 2, stdout);
    // "," and ":" in the file name and "%" in the message are escaped, as GitHub requires.
    const [warning, error] = lines;
    assert.match(warning, /^::warning file=[^,]+\/problems\/sample-problem\.json::/);
    assert.ok(warning.endsWith('::source https://example.org/papers/sample%2520copy is listed more than once'), warning);
    assert.match(error, /^::error file=[^,]+\/problems\/notes%2C draft\.pdf::/);
    assert.ok(
      error.endsWith('::data/ holds only JSON and Markdown. Link to papers and other sources instead of committing copies of them.'),
      error,
    );
  });

  test('exits 2 and prints the usage for an unknown option', () => {
    const { status, stderr } = run(['--strict']);
    assert.equal(status, 2);
    assert.match(stderr, /Unknown option '--strict'/);
    assert.match(stderr, /Usage: node scripts\/validate\.mjs \[--data <dir>\]/);
  });

  test('prints the usage for --help', () => {
    const { status, stdout } = run(['--help']);
    assert.equal(status, 0);
    assert.match(stdout, /^Usage: node scripts\/validate\.mjs \[--data <dir>\]/);
  });
});

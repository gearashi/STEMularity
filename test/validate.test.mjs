// Tests for the problem validator: the rules in scripts/lib/problems.mjs and
// the command line in scripts/validate.mjs.
//
// Each test writes its own data folder to the system temp folder: a copy of
// the real data/schema/ plus made-up problems derived from baseProblem(). The
// folder is removed when the test ends.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_DATA_DIR, ROOT, formatAjvErrors, loadProblems } from '../scripts/lib/problems.mjs';

const SCHEMA_DIR = path.join(DEFAULT_DATA_DIR, 'schema');
const SCHEMA = JSON.parse(await readFile(path.join(SCHEMA_DIR, 'problem.schema.json'), 'utf8'));

// For child processes: the test runner's own setting must not reach them.
const { NODE_TEST_CONTEXT, ...CHILD_ENV } = process.env;

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

/** Messages the validator gives, used by several tests below. */
const DATE_MESSAGE = 'must be a date as YYYY, YYYY-MM or YYYY-MM-DD, or -YYYY for a year BCE';
const URL_MESSAGE = 'must be a valid absolute URL: percent-encode spaces and other special characters (for example é, – or |)';
const LINE_MESSAGE = 'must not start or end with a space, or contain line breaks or control characters';
const TEXT_MESSAGE = 'must not start or end with a space or blank line, or contain control characters';
const FILE_TYPE_MESSAGE = 'only files named *.json or *.md belong under data/. Link to papers and other sources instead of committing copies of them.';
const yearZero = (where, year) => `${where}: "${year}" is not a real year: there is no year 0 (use 0001 for 1 CE or -0001 for 1 BCE)`;

/** Each error as [its file relative to the data folder `dir`, with "/" separators, message]. */
const errorList = (result, dir) => result.errors.map(({ file, message }) => [posix(path.relative(dir, file)), message]);

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

  test('editor and OS litter that git ignores is allowed, and is not read as a problem', async (t) => {
    const dir = await makeDataDir(t, {
      ...problemFiles(baseProblem()),
      'problems/.sample-problem.json.swp': 'Vim swap file',
      'problems/.sample-problem.json.swo': 'Vim swap file, when the .swp file exists',
      'problems/sample-problem.json~': '{ "an unfinished": "backup copy',
      'problems/._sample-problem.json': '\u0000\u0005\u0016\u0007 macOS AppleDouble file',
      '._problems': 'macOS AppleDouble file for the folder',
      'problems/Thumbs.db': 'Windows thumbnail cache',
      'desktop.ini': '[.ShellClassInfo]',
      'problems/.hidden-problem.json': '{ "not": "read" }',
      // A copied paper is still an error, but the litter it brings is not.
      'problems/copied-paper.pdf': 'not really a PDF',
      'problems/._copied-paper.pdf': 'macOS AppleDouble file',
      'notes.txt': 'notes kept in the wrong place',
      'problems/.#notes.txt': 'Emacs lock file',
      'problems/#sample-problem.json#': 'Emacs auto-save file',
      'schema/thumbs.db': 'Windows thumbnail cache, lowercase',
      'extra/DESKTOP.INI': '[.ShellClassInfo]',
      // Not a Vim swap file (those are hidden), so still an error.
      'problems/old-demo.swf': 'not really a Flash file',
    });
    // Emacs makes its lock file a symlink to nowhere. Some systems do not allow that, so fall back to a file.
    const lock = path.join(dir, 'problems', '.#sample-problem.json');
    await symlink('someone@example-host.12345:1700000000', lock).catch(() => writeFile(lock, 'Emacs lock file'));

    const result = await loadProblems({ dataDir: dir, latestDate: LATEST });
    assert.deepEqual(errorList(result, dir), [
      ['notes.txt', FILE_TYPE_MESSAGE],
      ['problems/copied-paper.pdf', FILE_TYPE_MESSAGE],
      ['problems/old-demo.swf', FILE_TYPE_MESSAGE],
    ]);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.problems.map((p) => p.id), ['sample-problem']);
  });

  test('the order does not depend on the locale of the computer', async (t) => {
    // Danish sorts "aa" after "z". Names that tie, ignoring accents and case,
    // are ordered by id, so these ids show whether a locale was used.
    const named = (id, name) => ({ ...minimalProblem(), id, name });
    const dir = await makeDataDir(
      t,
      problemFiles(
        named('zeta-cafe', 'Cafe Problem'),
        named('aabenraa-cafe', 'Caf\u00E9 Problem'),
        named('zeta-flux', 'Flux question'),
        named('aabenraa-flux', 'Flux Question'),
      ),
    );
    const loader = pathToFileURL(path.join(ROOT, 'scripts', 'lib', 'problems.mjs')).href;
    const script = `
      const { loadProblems } = await import(${JSON.stringify(loader)});
      const { problems, errors, warnings } = await loadProblems({ dataDir: ${JSON.stringify(dir)}, latestDate: ${JSON.stringify(LATEST)} });
      console.log(JSON.stringify({ ids: problems.map((p) => p.id), errors, warnings }));
    `;
    for (const locale of ['en_US.UTF-8', 'da_DK.UTF-8']) {
      const { status, stdout, stderr } = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
        encoding: 'utf8',
        env: { ...CHILD_ENV, LC_ALL: locale, LANG: locale },
      });
      assert.equal(status, 0, stderr);
      const { ids, errors, warnings } = JSON.parse(stdout);
      assert.deepEqual(errors, [], locale);
      assert.deepEqual(ids, ['aabenraa-cafe', 'zeta-cafe', 'aabenraa-flux', 'zeta-flux'], locale);
      // Files are read in a fixed order, so the same file always gets the warning.
      assert.deepEqual(
        warnings.map(({ file, message }) => [path.basename(file), message]),
        [['zeta-flux.json', 'name "Flux question" is also used by aabenraa-flux.json.']],
        locale,
      );
    }
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

  test('an id that is a reserved file name on Windows', async (t) => {
    const reserved = '/id: is a reserved file name on Windows (con, prn, aux, nul, com0-com9, lpt0-lpt9). Choose another id';
    for (const id of ['con', 'prn', 'aux', 'nul', 'com0', 'com1', 'com9', 'lpt0', 'lpt1', 'lpt9']) {
      await t.test(id, async (t) => {
        // Saved as sample-problem.json, because Windows cannot create the file itself.
        const result = await load(t, { 'problems/sample-problem.json': { ...baseProblem(), id } });
        assertRejected(result, reserved);
        assert.equal(result.errors.length, 1, list(result.errors));
      });
    }
    await t.test('an id that is not a string gets only the type error', async (t) => {
      for (const id of [123, null, true]) {
        const result = await load(t, { 'problems/sample-problem.json': { ...baseProblem(), id } });
        assert.deepEqual(errorList(result, result.dir), [['problems/sample-problem.json', '/id: must be string']]);
      }
    });
    await t.test('ids that only start with a reserved name pass', async (t) => {
      const problems = ['console-problem', 'nullable-sets', 'com10', 'lpt-queue', 'aux-fields'].map((id) => ({ ...minimalProblem(), id, name: `Problem ${id}` }));
      assertClean(await load(t, problemFiles(...problems)), problems.length);
    });
  });

  test('an id that does not match the file name', async (t) => {
    const result = await load(t, { 'problems/other-name.json': baseProblem() });
    assertRejected(result, 'id "sample-problem" must match the file name "other-name.json".', 'problems/other-name.json');
  });

  test('a copy of a problem whose id was not changed: only the copy is reported', async (t) => {
    // The copy sorts before the original, which still loads.
    const dir = await makeDataDir(t, { 'problems/aurora-knot-question.json': baseProblem(), ...problemFiles(baseProblem()) });
    const result = await loadProblems({ dataDir: dir, latestDate: LATEST });
    assert.deepEqual(errorList(result, dir), [
      ['problems/aurora-knot-question.json', 'id "sample-problem" must match the file name "aurora-knot-question.json".'],
    ]);
    assert.deepEqual(result.problems.map((p) => p.id), ['sample-problem']);
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
    const malformed = [
      '2024-13', '2024-00', '2024-1-5', '2024-01-32', '24-01-01', '2024/01/01', '2024-01-01T10:00', 'March 2024', '',
      // Years always have four digits, and a year BCE has no month or day.
      '430', '-430', '+0430', '0430 BCE', '-0430-05', '-0430-05-14', '--0430', '10000',
    ];
    for (const date of malformed) {
      await t.test(JSON.stringify(date), async (t) => {
        const result = await loadChanged(t, (p) => (p.progress[DONE].date = date));
        assertRejected(result, `/progress/${DONE}/date: ${DATE_MESSAGE}`);
      });
    }
    await t.test('in "updated"', async (t) => {
      assertRejected(await loadChanged(t, (p) => (p.updated = '2026-6-1')), `/updated: ${DATE_MESSAGE}`);
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
    await t.test('the check covers years before 1000', async (t) => {
      assertRejected(await loadChanged(t, (p) => (p.progress[DONE].date = '0430-02-29')), `/progress/${DONE}/date: "0430-02-29" is not a real calendar date`);
      assertClean(await loadChanged(t, (p) => (p.progress[DONE].date = '0400-02-29')));
    });
  });

  test('a year before 1000, or a year BCE', async (t) => {
    await t.test('passes as YYYY, YYYY-MM or YYYY-MM-DD, or as -YYYY for a year BCE', async (t) => {
      for (const date of ['-0430', '-9999', '-0001', '0001', '0430', '0430-05', '0430-05-14']) {
        assertClean(await loadChanged(t, (p) => (p.progress[DONE].date = date)));
      }
    });
    await t.test('the schema alone accepts the same shapes', () => {
      // Editors check files with the schema alone. Year 0 is left to the validator, which explains it.
      const pattern = new RegExp(SCHEMA.$defs.date.pattern, 'u');
      for (const date of ['-0430', '0430', '0430-05', '0430-05-14', '2026-11-04', '0000', '-0000']) assert.ok(pattern.test(date), date);
      for (const date of ['-0430-05', '-0430-05-14', '-430', '430', '+0430', '--0430', '2024-13', '2024-02-30T10:00']) {
        assert.ok(!pattern.test(date), date);
      }
    });
    await t.test('there is no year 0', async (t) => {
      for (const [date, year] of [['0000', '0000'], ['-0000', '-0000'], ['0000-05', '0000'], ['0000-05-14', '0000']]) {
        const result = await loadChanged(t, (p) => (p.progress[DONE].date = date));
        assertRejected(result, yearZero(`/progress/${DONE}/date`, year));
        assert.equal(result.errors.length, 1, list(result.errors));
      }
      assertRejected(await loadChanged(t, (p) => (p.updated = '0000')), yearZero('/updated', '0000'));
    });
    await t.test('"updated" can\'t be a year BCE', async (t) => {
      const result = await loadChanged(t, (p) => (p.updated = '-0430'));
      assertRejected(result, '/updated: "-0430" is the date this entry was last updated, so it can\'t be a year BCE');
      assert.equal(result.errors.length, 1, list(result.errors));
    });
    await t.test('a year BCE is never in the future', async (t) => {
      // Even when the latest date allowed is the first day of 1 CE.
      const dated = (date) => {
        const problem = minimalProblem();
        problem.progress[0].date = date;
        return problemFiles(problem);
      };
      for (const date of ['-0001', '-0430', '-9999', '0001']) {
        assertClean(await load(t, dated(date), { latestDate: '0001-01-01' }));
      }
      assertRejected(await load(t, dated('0002'), { latestDate: '0001-01-01' }), '/progress/0/date: "0002" is in the future', 'problems/minimal-problem.json');
    });
  });

  test('a source year', async (t) => {
    await t.test('passes from -9999 (9999 BCE) to 9999', async (t) => {
      for (const year of [-9999, -300, -1, 1, 2020, 9999]) {
        assertClean(await loadChanged(t, (p) => (p.sources[0].year = year)));
      }
    });
    const cases = [
      ['0', 0, '/sources/0/year: there is no year 0 (use 1 for 1 CE or -1 for 1 BCE)'],
      ['before 9999 BCE', -10000, '/sources/0/year: must be >= -9999'],
      ['after 9999', 10000, '/sources/0/year: must be <= 9999'],
      ['a fraction', 2020.5, '/sources/0/year: must be integer'],
      ['a string', '2020', '/sources/0/year: must be integer'],
    ];
    for (const [name, year, expected] of cases) {
      await t.test(name, async (t) => assertRejected(await loadChanged(t, (p) => (p.sources[0].year = year)), expected));
    }
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
    const updated = (date) => problemFiles({ ...baseProblem(), updated: date });
    const evening = Date.parse('2026-11-04T21:00:00Z'); // already 5 November in Sydney
    const lastMoment = Date.parse('2026-11-04T23:59:59.999Z');
    const midnight = Date.parse('2026-11-05T00:00:00Z');

    // Without latestDate, the clock decides. It is mocked here, and loadProblems() must read the mocked one.
    t.mock.timers.enable({ apis: ['Date'], now: evening });
    assert.equal(new Date().toISOString(), '2026-11-04T21:00:00.000Z', 'the clock is mocked');
    assertClean(await loadProblems({ dataDir: await makeDataDir(t, updated('2026-11-05')) }));
    assertRejected(await loadProblems({ dataDir: await makeDataDir(t, updated('2026-11-06')) }), '/updated: "2026-11-06" is in the future');
    assertRejected(await loadProblems({ dataDir: await makeDataDir(t, dated('2026-12')) }), `/progress/${DONE}/date: "2026-12" is in the future`);
    t.mock.timers.setTime(lastMoment);
    assertRejected(await loadProblems({ dataDir: await makeDataDir(t, updated('2026-11-06')) }), '/updated: "2026-11-06" is in the future');
    t.mock.timers.setTime(midnight);
    assertClean(await loadProblems({ dataDir: await makeDataDir(t, updated('2026-11-06')) }));
    t.mock.timers.reset();

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
    const absolute = URL_MESSAGE;
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

  test('a URL with characters that must be percent-encoded', async (t) => {
    const cases = [
      ['a space', 'https://example.org/papers/sample copy', 'https://example.org/papers/sample%20copy'],
      ['letters with accents and a dash', 'https://example.org/wiki/Erdős–Straus', 'https://example.org/wiki/Erd%C5%91s%E2%80%93Straus'],
      ['a vertical bar', 'https://example.org/search?q=a|b', 'https://example.org/search?q=a%7Cb'],
      ['a host name with accents', 'https://münchen.example.org/x', 'https://xn--mnchen-3ya.example.org/x'],
    ];
    for (const [name, raw, encoded] of cases) {
      await t.test(name, async (t) => {
        const result = await loadChanged(t, (p) => (p.sources[0].url = raw));
        assertRejected(result, `/sources/0/url: ${URL_MESSAGE}`);
        assert.equal(result.errors.length, 1, list(result.errors));
        assertClean(await loadChanged(t, (p) => (p.sources[0].url = encoded)));
      });
    }
  });

  test('text that is blank, has a space at the start or end, or holds control characters', async (t) => {
    const cases = [
      ['a blank name', (p) => (p.name = '   '), '/name', LINE_MESSAGE],
      ['a name with a space at the start', (p) => (p.name = ' Sample Problem'), '/name', LINE_MESSAGE],
      ['a name with a space at the end', (p) => (p.name = 'Sample Problem '), '/name', LINE_MESSAGE],
      ['a name with a no-break space at the end', (p) => (p.name = 'Sample Problem\u00a0'), '/name', LINE_MESSAGE],
      ['a name with a line break', (p) => (p.name = 'Sample\nProblem'), '/name', LINE_MESSAGE],
      ['a name with a tab', (p) => (p.name = 'Sample\tProblem'), '/name', LINE_MESSAGE],
      ['a name with a NUL character', (p) => (p.name = 'Sample\u0000Problem'), '/name', LINE_MESSAGE],
      ['a name with U+0085 (next line)', (p) => (p.name = 'Sample\u0085Problem'), '/name', LINE_MESSAGE],
      ['a name with DEL', (p) => (p.name = 'Sample\u007fProblem'), '/name', LINE_MESSAGE],
      ['another name', (p) => (p.aliases = ['The test problem\n']), '/aliases/0', LINE_MESSAGE],
      ['a category', (p) => (p.category = '  '), '/category', LINE_MESSAGE],
      ['a checkpoint title', (p) => (p.progress[DONE].title = 'Problem posed '), `/progress/${DONE}/title`, LINE_MESSAGE],
      ['a contributor name', (p) => (p.progress[DONE].by[0].name = ' '), `/progress/${DONE}/by/0/name`, LINE_MESSAGE],
      ['a link title', (p) => (p.progress[DONE].links[0].title = '\tStatement'), `/progress/${DONE}/links/0/title`, LINE_MESSAGE],
      ['a source title', (p) => (p.sources[0].title = ' '), '/sources/0/title', LINE_MESSAGE],
      ['an author', (p) => (p.sources[0].authors = ['Ada\rPlaceholder']), '/sources/0/authors/0', LINE_MESSAGE],
      ['a summary of only spaces', (p) => (p.summary = ' '.repeat(40)), '/summary', TEXT_MESSAGE],
      ['a summary with a space at the start', (p) => (p.summary = ` ${p.summary}`), '/summary', TEXT_MESSAGE],
      ['a summary that ends in a blank line', (p) => (p.summary = `${p.summary}\n\n`), '/summary', TEXT_MESSAGE],
      ['a summary with a NUL character', (p) => (p.summary = p.summary.replace(' ', '\u0000')), '/summary', TEXT_MESSAGE],
      ['a summary with a form feed', (p) => (p.summary = p.summary.replace(' ', '\f')), '/summary', TEXT_MESSAGE],
      ['a checkpoint description that ends in a line break', (p) => (p.progress[DEAD_END].description += '\n'), `/progress/${DEAD_END}/description`, TEXT_MESSAGE],
      ['a checkpoint description with an escape character', (p) => (p.progress[DEAD_END].description = 'Failed \u001b[31m badly.'), `/progress/${DEAD_END}/description`, TEXT_MESSAGE],
      ['a name with U+2028 (line separator)', (p) => (p.name = 'Sample\u2028Problem'), '/name', LINE_MESSAGE],
      ['a name with a right-to-left override', (p) => (p.name = 'Sample \u202eProblem'), '/name', LINE_MESSAGE],
      ['a summary with U+2029 (paragraph separator)', (p) => (p.summary = p.summary.replace(' ', '\u2029')), '/summary', TEXT_MESSAGE],
      ['a summary with a left-to-right isolate', (p) => (p.summary = p.summary.replace(' ', ' \u2066')), '/summary', TEXT_MESSAGE],
    ];
    for (const [name, change, where, message] of cases) {
      await t.test(name, async (t) => {
        const result = await loadChanged(t, change);
        assertRejected(result, `${where}: ${message}`);
        assert.equal(result.errors.length, 1, list(result.errors));
      });
    }
    await t.test('line breaks and tabs inside a summary or checkpoint description pass', async (t) => {
      const result = await loadChanged(t, (p) => {
        p.summary = 'First paragraph of a made-up summary.\n\nSecond paragraph,\twith a tab.';
        p.progress[DEAD_END].description = 'Failed.\r\nRecorded so nobody repeats it.';
      });
      assertClean(result);
    });
    await t.test('spaces, accents, symbols and emoji inside a line pass', async (t) => {
      assertClean(await loadChanged(t, (p) => (p.name = 'Sample  Problem – é, 41 °C,\u00a0漢字 🙂')));
      // A zero-width joiner holds emoji sequences and some scripts together, so it is allowed.
      assertClean(await loadChanged(t, (p) => (p.name = 'Sample Problem \u{1f469}\u200d\u{1f52c}')));
    });
    await t.test('an empty string gets only the length error', async (t) => {
      const result = await loadChanged(t, (p) => (p.name = ''));
      assertRejected(result, '/name: must NOT have fewer than 3 characters');
      assert.equal(result.errors.length, 1, list(result.errors));
    });
    await t.test('the patterns in the schema', () => {
      // problem.schema.json writes each backslash twice, as JSON requires.
      assert.equal(SCHEMA.$defs.line.pattern, String.raw`^(?:[^\s\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069](?:[^\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]*[^\s\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069])?)?$`);
      assert.equal(
        SCHEMA.$defs.text.pattern,
        String.raw`^(?:[^\s\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069](?:[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]*[^\s\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069])?)?$`,
      );
    });
  });

  test('more items than allowed, or a "$schema" value that is too long', async (t) => {
    const many = (n, make) => Array.from({ length: n }, (_, i) => make(i));
    const step = (i) => ({ id: `step-${i}`, title: `Step ${i}`, status: 'not-started' });
    const cases = [
      ['$schema', 200, (p, n) => (p.$schema = 'x'.repeat(n)), '/$schema: must NOT have more than 200 characters'],
      ['aliases', 20, (p, n) => (p.aliases = many(n, (i) => `Other name ${i}`)), '/aliases: must NOT have more than 20 items'],
      ['tags', 30, (p, n) => (p.tags = many(n, (i) => `tag-${i}`)), '/tags: must NOT have more than 30 items'],
      ['checkpoints', 500, (p, n) => p.progress.push(...many(n - p.progress.length, step)), '/progress: must NOT have more than 500 items'],
      ['sources', 100, (p, n) => (p.sources = many(n, (i) => ({ title: `Source ${i}`, url: `https://example.org/sources/${i}`, kind: 'paper' }))), '/sources: must NOT have more than 100 items'],
      ['links on a checkpoint', 50, (p, n) => (p.progress[DONE].links = many(n, (i) => ({ title: `Link ${i}`, url: `https://example.org/links/${i}` }))), `/progress/${DONE}/links: must NOT have more than 50 items`],
      ['contributors to a checkpoint', 50, (p, n) => (p.progress[DONE].by = many(n, (i) => ({ name: `Person ${i}`, kind: 'person' }))), `/progress/${DONE}/by: must NOT have more than 50 items`],
      ['authors of a source', 50, (p, n) => (p.sources[0].authors = many(n, (i) => `Author ${i}`)), '/sources/0/authors: must NOT have more than 50 items'],
    ];
    for (const [name, limit, change, expected] of cases) {
      await t.test(`${name}: ${limit} pass`, async (t) => assertClean(await loadChanged(t, (p) => change(p, limit))));
      await t.test(`${name}: ${limit + 1} fail`, async (t) => assertRejected(await loadChanged(t, (p) => change(p, limit + 1)), expected));
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
    for (const file of copies) assertError(result, FILE_TYPE_MESSAGE, file);
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
      ['a description is missing', (v) => delete v.field.physics.description, '"field.physics" needs a "description" string.'],
      ['a description is not a string', (v) => (v.contributor_kind.ai.description = 42), '"contributor_kind.ai" needs a "description" string.'],
      ['a rating has no description', (v) => delete v.ratings.significance.description, '"ratings.significance" needs a "description" string.'],
      ['two AI effort levels share a rank', (v) => (v.ai_effort.max.rank = 3), 'every "ai_effort" entry needs a unique integer "rank".'],
      ['an entry is null: label', (v) => (v.ai_effort.max = null), '"ai_effort.max" needs a "label" string.'],
      ['an entry is null: description', (v) => (v.ai_effort.max = null), '"ai_effort.max" needs a "description" string.'],
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

  test('a schema file that does not hold a JSON object', async (t) => {
    for (const name of ['problem.schema.json', 'vocabulary.json']) {
      for (const content of ['null', 'false', '0', '""', '[]', 'true']) {
        await t.test(`${name} holding ${content}`, async (t) => {
          const dir = await makeDataDir(t, problemFiles(baseProblem()));
          await writeFile(path.join(dir, 'schema', name), `${content}\n`);
          const result = await loadProblems({ dataDir: dir, latestDate: LATEST });
          assert.deepEqual(errorList(result, dir), [[`schema/${name}`, 'must hold a JSON object.']]);
          assert.deepEqual(result.problems, []);
        });
      }
    }
  });

  test('a schema that lacks the values the vocabulary describes', async (t) => {
    const dir = await makeDataDir(t, problemFiles(baseProblem()));
    await writeFile(path.join(dir, 'schema', 'problem.schema.json'), '{}\n');
    const result = await loadProblems({ dataDir: dir, latestDate: LATEST });
    assert.ok(result.errors.length > 0);
    for (const [file, message] of errorList(result, dir)) {
      assert.equal(file, 'schema/vocabulary.json');
      assert.match(message, /^cannot find the values for "[a-z_]+" in the schema\.$/);
    }
    assert.deepEqual(result.problems, []);
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

  test('an open or unsolved problem with no checkpoint in progress, not started or disputed', async (t) => {
    const maps = [
      ['every checkpoint done', ['done']],
      ['only done and dead-end checkpoints', ['done', 'dead-end']],
    ];
    for (const status of ['open', 'unsolved']) {
      for (const [name, keep] of maps) {
        await t.test(`${status}, ${name}`, async (t) => {
          const result = await loadChanged(t, (p) => {
            p.status = status;
            p.progress = p.progress.filter((checkpoint) => keep.includes(checkpoint.status));
          });
          assert.deepEqual(result.errors, [], `errors:\n${list(result.errors)}`);
          assertWarning(
            result,
            `status is "${status}" but no checkpoint is in progress, not started or disputed: add the next step, or update the status`,
            'problems/sample-problem.json',
          );
          assert.equal(result.problems.length, 1);
        });
      }
    }
    await t.test('one checkpoint in progress, not started or disputed is enough', async (t) => {
      for (const open of ['in-progress', 'not-started', 'disputed']) {
        const result = await loadChanged(t, (p) => {
          p.progress = p.progress.filter((checkpoint) => ['done', 'dead-end', open].includes(checkpoint.status));
        });
        assertClean(result);
      }
    });
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

  test('two problems with the same name, ignoring spaces at the start and end', async (t) => {
    // The schema rejects such spaces in a name. The check does not rely on that, so this test allows them.
    const first = { ...baseProblem(), id: 'first-copy', name: 'Sample Problem' };
    const second = { ...baseProblem(), id: 'second-copy', name: ' sample problem  ' };
    const dir = await makeDataDir(t, problemFiles(first, second));
    const schemaFile = path.join(dir, 'schema', 'problem.schema.json');
    const schema = JSON.parse(await readFile(schemaFile, 'utf8'));
    schema.properties.name = { type: 'string', minLength: 3, maxLength: 120 };
    await writeFile(schemaFile, JSON.stringify(schema, null, 2));
    const result = await loadProblems({ dataDir: dir, latestDate: LATEST });
    assert.deepEqual(result.errors, [], `errors:\n${list(result.errors)}`);
    assertWarning(result, 'name " sample problem  " is also used by first-copy.json.', 'problems/second-copy.json');
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

  test("uses Ajv's own message for a pattern, format, false schema or not it does not know", () => {
    const errors = [
      { keyword: 'pattern', instancePath: '/orcid', schemaPath: '#/properties/orcid/pattern', params: { pattern: '^[0-9X-]+$' }, message: 'must match pattern "^[0-9X-]+$"' },
      { keyword: 'format', instancePath: '/email', schemaPath: '#/properties/email/format', params: { format: 'email' }, message: 'must match format "email"' },
      { keyword: 'false schema', instancePath: '/legacy', schemaPath: '#/properties/legacy/false schema', params: {}, message: 'boolean schema is false' },
      { keyword: 'not', instancePath: '/progress/0/id', schemaPath: '#/$defs/checkpoint/properties/id/not', params: {}, message: 'must NOT be valid' },
    ];
    assert.deepEqual(formatAjvErrors(errors), [
      '/orcid: must match pattern "^[0-9X-]+$"',
      '/email: must match format "email"',
      '/legacy: not allowed here',
      '/progress/0/id: must NOT be valid',
    ]);
  });

  test('explains a reserved id, year 0, a bad URL, and text with stray spaces or control characters', () => {
    const errors = [
      { keyword: 'not', instancePath: '/id', schemaPath: '#/properties/id/not', params: {}, message: 'must NOT be valid' },
      { keyword: 'not', instancePath: '/sources/3/year', schemaPath: '#/$defs/source/properties/year/not', params: {}, message: 'must NOT be valid' },
      { keyword: 'format', instancePath: '/sources/0/url', schemaPath: '#/$defs/url/format', params: { format: 'uri' }, message: 'must match format "uri"' },
      { keyword: 'pattern', instancePath: '/name', schemaPath: '#/$defs/line/pattern', params: { pattern: SCHEMA.$defs.line.pattern }, message: 'must match pattern' },
      { keyword: 'pattern', instancePath: '/summary', schemaPath: '#/$defs/text/pattern', params: { pattern: SCHEMA.$defs.text.pattern }, message: 'must match pattern' },
      { keyword: 'pattern', instancePath: '/updated', schemaPath: '#/$defs/date/pattern', params: { pattern: SCHEMA.$defs.date.pattern }, message: 'must match pattern' },
    ];
    assert.deepEqual(formatAjvErrors(errors), [
      '/id: is a reserved file name on Windows (con, prn, aux, nul, com0-com9, lpt0-lpt9). Choose another id',
      '/sources/3/year: there is no year 0 (use 1 for 1 CE or -1 for 1 BCE)',
      `/sources/0/url: ${URL_MESSAGE}`,
      `/name: ${LINE_MESSAGE}`,
      `/summary: ${TEXT_MESSAGE}`,
      `/updated: ${DATE_MESSAGE}`,
    ]);
  });
});

describe('the command line', () => {
  /** Runs scripts/validate.mjs from the repository root, outside GitHub Actions unless `env` says so. */
  const run = (args, env = {}) =>
    spawnSync(process.execPath, ['scripts/validate.mjs', ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...CHILD_ENV, GITHUB_ACTIONS: '', ...env },
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
    // The folder is outside the repository, so its path uses the system's separator.
    const [warning, error] = lines;
    assert.match(warning, /^::warning file=[^,]+[\\/]problems[\\/]sample-problem\.json::/);
    assert.ok(warning.endsWith('::source https://example.org/papers/sample%2520copy is listed more than once'), warning);
    assert.match(error, /^::error file=[^,]+[\\/]problems[\\/]notes%2C draft\.pdf::/);
    assert.ok(error.endsWith(`::${FILE_TYPE_MESSAGE}`), error);
  });

  test('prints every error on one line, even when the data holds line breaks', async (t) => {
    const forged = '\n::error file=README.md::forged';
    const problem = baseProblem();
    problem.name = `Sample Problem${forged}`;
    // An unknown property: the error message repeats its name.
    problem[`note${forged}\u001b[2J\t`] = 'x';
    const dir = await makeDataDir(t, problemFiles(problem));
    // A file name can hold a line break too, except on Windows.
    const forgedFile = await writeFile(path.join(dir, 'problems', `copy${forged}.pdf`), 'not really a PDF').then(
      () => true,
      () => false,
    );
    for (const env of [{}, { GITHUB_ACTIONS: 'true' }]) {
      const { status, stdout, stderr } = run(['--data', dir], env);
      assert.equal(status, 1);
      // GitHub reads a command from any line that starts with "::", after leading spaces.
      for (const line of `${stdout}\n${stderr}`.split(/\r\n|\r|\n/)) {
        assert.ok(!line.trimStart().startsWith('::error file=README.md'), `a line of output was forged:\n${line}`);
      }
      // The text is still shown, with the control characters escaped.
      const unknown = '(top level): unknown property "note\\n::error file=README.md::forged\\u001b[2J\\t"';
      assert.ok(stderr.includes(`/name: ${LINE_MESSAGE}`), stderr);
      assert.ok(stderr.includes(unknown), stderr);
      if (env.GITHUB_ACTIONS) assert.ok(annotations(stdout).some((line) => line.endsWith(`::${unknown}`)), stdout);
      if (forgedFile) assert.ok(stderr.includes(`copy\\n::error file=README.md::forged.pdf  ${FILE_TYPE_MESSAGE}`), stderr);
    }
  });

  test('never prints the runner\'s older "##[command]" form', async (t) => {
    const problem = baseProblem();
    problem['note ##[error file=README.md;line=1]forged'] = 'x';
    const dir = await makeDataDir(t, problemFiles(problem));
    for (const env of [{}, { GITHUB_ACTIONS: 'true' }]) {
      const { status, stdout, stderr } = run(['--data', dir], env);
      assert.equal(status, 1);
      assert.ok(!`${stdout}\n${stderr}`.includes('##['), `${stdout}\n${stderr}`);
      assert.ok(stderr.includes('unknown property "note ##\\[error file=README.md;line=1]forged"'), stderr);
    }
  });

  test('exits 1 when a schema file does not hold a JSON object', async (t) => {
    const dir = await makeDataDir(t, problemFiles(baseProblem()));
    await writeFile(path.join(dir, 'schema', 'vocabulary.json'), 'null\n');
    const { status, stdout, stderr } = run(['--data', dir]);
    assert.equal(status, 1);
    assert.equal(stdout, '');
    assert.ok(stderr.includes(`error    ${path.join(dir, 'schema', 'vocabulary.json')}  must hold a JSON object.`), stderr);
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

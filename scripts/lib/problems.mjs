// Loads and validates the problem index in data/. Shared by the validator
// (scripts/validate.mjs) and the site build (site/build.mjs), so both apply
// exactly the same rules.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DEFAULT_DATA_DIR = path.join(ROOT, 'data');

// Files allowed anywhere under data/. Sources are linked, never copied in.
const ALLOWED_EXTENSIONS = new Set(['.json', '.md']);
const ALLOWED_NAMES = new Set(['.gitkeep', '.DS_Store']); // .DS_Store is macOS Finder litter, ignored by git

// Where each vocabulary.json section's values live in the schema.
const VOCABULARY_ENUMS = {
  status: (s) => s.properties.status.enum,
  field: (s) => s.properties.field.enum,
  ai_effort: (s) => s.properties.ai_effort.enum,
  ratings: (s) => Object.keys(s.properties.ratings.properties),
  checkpoint_status: (s) => s.$defs.checkpoint.properties.status.enum,
  contributor_kind: (s) => s.$defs.contributor.properties.kind.enum,
  source_kind: (s) => s.$defs.source.properties.kind.enum,
};

const DATE_SHAPE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const DAY_MS = 24 * 60 * 60 * 1000;
// The schema's pattern for ids and tags.
const KEBAB_CASE = '^[a-z0-9]+(-[a-z0-9]+)*$';

/**
 * Reads every data/problems/*.json file and checks it against the schema and
 * the extra rules below.
 *
 * @param {object} [options]
 * @param {string} [options.dataDir] Directory holding schema/ and problems/.
 * @param {string|Date} [options.latestDate] Latest date allowed, as YYYY-MM-DD
 *   (a Date is read in UTC). Defaults to tomorrow (UTC), so contributors ahead
 *   of UTC are not rejected.
 * @returns {Promise<{problems: object[], vocabulary: object, schema: object,
 *   errors: {file: string, message: string}[], warnings: {file: string, message: string}[]}>}
 *   problems holds only entries that passed every check, sorted by name.
 */
export async function loadProblems({ dataDir = DEFAULT_DATA_DIR, latestDate } = {}) {
  const latest = resolveLatestDate(latestDate);
  const errors = [];
  const warnings = [];
  const rel = (file) => {
    const relative = path.relative(ROOT, file);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return file;
    return relative.split(path.sep).join('/');
  };
  const error = (file, message) => errors.push({ file: rel(file), message });
  const warn = (file, message) => warnings.push({ file: rel(file), message });

  const schemaFile = path.join(dataDir, 'schema', 'problem.schema.json');
  const vocabularyFile = path.join(dataDir, 'schema', 'vocabulary.json');
  const schema = await readJson(schemaFile, error);
  const vocabulary = await readJson(vocabularyFile, error);
  if (!schema || !vocabulary) return { problems: [], vocabulary, schema, errors, warnings };

  checkVocabulary(schema, vocabulary, (message) => error(vocabularyFile, message));

  let validate;
  try {
    const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false });
    addFormats(ajv);
    validate = ajv.compile(schema);
  } catch (err) {
    error(schemaFile, `schema does not compile: ${err.message}`);
    return { problems: [], vocabulary, schema, errors, warnings };
  }

  for (const file of await walk(dataDir)) {
    const name = path.basename(file);
    if (!ALLOWED_NAMES.has(name) && !ALLOWED_EXTENSIONS.has(path.extname(name).toLowerCase())) {
      error(file, 'data/ holds only JSON and Markdown. Link to papers and other sources instead of committing copies of them.');
    }
  }

  const problemsDir = path.join(dataDir, 'problems');
  let entries;
  try {
    entries = await readdir(problemsDir, { withFileTypes: true });
  } catch (err) {
    error(problemsDir, `cannot read the problems folder: ${err.message}`);
  }

  const problems = [];
  const idsLower = new Map();
  let problemFiles = 0;
  for (const entry of (entries ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(problemsDir, entry.name);
    if (entry.isDirectory()) {
      error(file, 'data/problems/ must be flat: one <id>.json file per problem, no subfolders.');
      continue;
    }
    const extension = path.extname(entry.name);
    if (extension.toLowerCase() !== '.json') continue; // Markdown notes and .gitkeep are not problems
    problemFiles += 1;
    if (extension !== '.json') {
      error(file, `problem files must end in ".json", in lowercase. Rename it to "${path.basename(entry.name, extension)}.json".`);
      continue;
    }

    const problem = await readJson(file, error);
    if (problem === undefined) continue;

    if (!validate(problem)) {
      for (const message of formatAjvErrors(validate.errors)) error(file, message);
      continue;
    }

    const before = errors.length;
    const expectedId = entry.name.slice(0, -'.json'.length);
    if (problem.id !== expectedId) {
      error(file, `id "${problem.id}" must match the file name "${expectedId}.json".`);
    }
    const lower = problem.id.toLowerCase();
    if (idsLower.has(lower)) error(file, `id "${problem.id}" is already used by ${idsLower.get(lower)}.`);
    idsLower.set(lower, rel(file));

    checkDates(problem, latest, (message) => error(file, message));
    checkCheckpoints(problem, (message) => error(file, message), (message) => warn(file, message));
    checkSources(problem, (message) => warn(file, message));

    if (errors.length === before) problems.push(problem);
  }

  const byName = new Map();
  for (const problem of problems) {
    const key = problem.name.toLowerCase();
    if (byName.has(key)) {
      warn(path.join(problemsDir, `${problem.id}.json`), `name "${problem.name}" is also used by ${byName.get(key)}.json.`);
    }
    byName.set(key, problem.id);
  }
  // A folder that cannot be read is already an error.
  if (entries && problemFiles === 0) warn(problemsDir, 'no problems found.');

  problems.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id));
  return { problems, vocabulary, schema, errors, warnings };
}

// Returns the latest allowed date as YYYY-MM-DD, or throws on a value that
// is not a date: that is a bug in the caller, not in the data.
function resolveLatestDate(latestDate) {
  if (latestDate === undefined || latestDate === null) return isoDate(new Date(Date.now() + DAY_MS));
  if (latestDate instanceof Date && !Number.isNaN(latestDate.getTime())) return isoDate(latestDate);
  if (typeof latestDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(latestDate)) return latestDate.slice(0, 10);
  throw new TypeError(`latestDate must be a date as YYYY-MM-DD, got ${JSON.stringify(latestDate)}.`);
}

async function readJson(file, error) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    error(file, `cannot read file: ${err.message}`);
    return undefined;
  }
  try {
    return JSON.parse(text.replace(/^\uFEFF/, '')); // ignore a byte order mark
  } catch (err) {
    error(file, `invalid JSON: ${err.message}`);
    return undefined;
  }
}

async function walk(dir) {
  const files = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

function checkVocabulary(schema, vocabulary, error) {
  for (const [section, enumOf] of Object.entries(VOCABULARY_ENUMS)) {
    let expected;
    try {
      expected = enumOf(schema);
    } catch {
      error(`cannot find the values for "${section}" in the schema.`);
      continue;
    }
    const actual = Object.keys(vocabulary[section] ?? {});
    const missing = expected.filter((value) => !actual.includes(value));
    const extra = actual.filter((value) => !expected.includes(value));
    if (missing.length) error(`"${section}" is missing labels for: ${missing.join(', ')}.`);
    if (extra.length) error(`"${section}" has labels for values the schema does not allow: ${extra.join(', ')}.`);
    for (const value of actual) {
      if (typeof vocabulary[section][value]?.label !== 'string') {
        error(`"${section}.${value}" needs a "label" string.`);
      }
    }
  }
  const ranks = Object.values(vocabulary.ai_effort ?? {}).map((entry) => entry?.rank);
  if (ranks.some((rank) => !Number.isInteger(rank)) || new Set(ranks).size !== ranks.length) {
    error('every "ai_effort" entry needs a unique integer "rank".');
  }
}

// Turns Ajv's errors into one readable line each.
export function formatAjvErrors(ajvErrors = []) {
  const messages = [];
  for (const err of ajvErrors ?? []) {
    if (err.keyword === 'if') continue; // always accompanied by the specific failure
    const where = err.instancePath || '(top level)';
    let message;
    switch (err.keyword) {
      case 'required':
        message = `${where}: missing required property "${err.params.missingProperty}"`;
        break;
      case 'additionalProperties':
        message = `${where}: unknown property "${err.params.additionalProperty}"`;
        break;
      case 'enum':
        message = `${where}: must be one of ${err.params.allowedValues.map((v) => JSON.stringify(v)).join(', ')}`;
        break;
      case 'false schema':
        if (err.instancePath === '/ratings') message = `${where}: ratings are only allowed when status is "open" or "unsolved"`;
        else if (/^\/progress\/\d+\/(by|date)$/.test(err.instancePath)) message = `${where}: not allowed on a "not-started" checkpoint`;
        else message = `${where}: not allowed here`;
        break;
      case 'pattern':
        if (err.schemaPath.startsWith('#/$defs/date/')) message = `${where}: must be a date as YYYY, YYYY-MM or YYYY-MM-DD`;
        else if (err.schemaPath.startsWith('#/$defs/url/')) message = `${where}: must be a full http:// or https:// address with a host name`;
        else if (err.params.pattern === KEBAB_CASE) message = `${where}: must be lowercase words joined by hyphens, like "my-problem-name"`;
        else message = `${where}: ${err.message}`;
        break;
      case 'format':
        message = err.params.format === 'uri' ? `${where}: must be an absolute URL` : `${where}: ${err.message}`;
        break;
      default:
        message = `${where}: ${err.message}`;
    }
    if (!messages.includes(message)) messages.push(message);
  }
  return messages;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year, month) {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return month === 2 && leap ? 29 : DAYS_IN_MONTH[month - 1];
}

function checkDates(problem, latestDate, error) {
  const dates = [];
  if (problem.updated) dates.push(['/updated', problem.updated]);
  problem.progress.forEach((checkpoint, i) => {
    if (checkpoint.date) dates.push([`/progress/${i}/date`, checkpoint.date]);
  });
  for (const [where, value] of dates) {
    const [, year, month, day] = value.match(DATE_SHAPE);
    if (day && Number(day) > daysInMonth(Number(year), Number(month))) {
      error(`${where}: "${value}" is not a real calendar date`);
      continue;
    }
    // A partial date is compared at its own precision: "2026" is not after "2026-06-30".
    if (value > latestDate.slice(0, value.length)) error(`${where}: "${value}" is in the future`);
  }
}

function checkCheckpoints(problem, error, warn) {
  const seen = new Set();
  problem.progress.forEach((checkpoint, i) => {
    if (seen.has(checkpoint.id)) error(`/progress/${i}/id: checkpoint id "${checkpoint.id}" is used more than once`);
    seen.add(checkpoint.id);
  });

  const done = problem.progress.filter((checkpoint) => checkpoint.status === 'done').length;
  if ((problem.status === 'solved' || problem.status === 'resolved') && done === 0) {
    warn(`status is "${problem.status}" but no checkpoint is "done"`);
  }
  if ((problem.status === 'open' || problem.status === 'unsolved') && done === problem.progress.length) {
    warn(`every checkpoint is "done" but status is "${problem.status}": add the next step, or update the status`);
  }
}

function checkSources(problem, warn) {
  const seen = new Set();
  for (const source of problem.sources) {
    if (seen.has(source.url)) warn(`source ${source.url} is listed more than once`);
    seen.add(source.url);
  }
}

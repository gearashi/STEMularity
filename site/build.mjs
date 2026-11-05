#!/usr/bin/env node
// Builds the static site from data/ into site/dist/.
//
// Usage: node site/build.mjs [--data <dir>] [--out <dir>]
//
// The output is plain files for Cloudflare Pages (build command "npm run build",
// output directory "site/dist"). The build is deterministic: the same data
// always gives byte-identical files. It stops without writing anything when
// the data has errors, using the same checks as `npm run validate`.

import { copyFile, mkdir, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DEFAULT_DATA_DIR, ROOT, loadProblems } from '../scripts/lib/problems.mjs';
import { renderSite } from './src/pages.mjs';

const SITE_DIR = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.join(SITE_DIR, 'src', 'static');
const SCHEMA_FILES = ['problem.schema.json', 'vocabulary.json'];
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const DEFAULT_OUT_DIR = path.join(SITE_DIR, 'dist');

/** Written into every output folder, so a later build knows it may replace that folder. */
export const BUILD_MARKER = '.stemularity-build';

const USAGE = `Usage: node site/build.mjs [--data <dir>] [--out <dir>]

  --data <dir>  folder that holds schema/ and problems/ (default: data)
  --out <dir>   output folder, replaced on every build (default: site/dist)`;

// File names and messages can hold text from the data. Control characters and
// Unicode line separators in them are printed as escapes (\n, \r, \t or
// \uXXXX), the same way as in scripts/validate.mjs, so every printed line stays
// one line: data can never start a line of its own, such as a forged GitHub
// Actions command.
const NAMED_ESCAPES = { '\n': '\\n', '\r': '\\r', '\t': '\\t' };
const oneLine = (text) =>
  String(text)
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, (ch) => NAMED_ESCAPES[ch] ?? `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`)
    // The Actions runner also reads its older "##[command]" form anywhere in a line.
    .replace(/##\[/g, '##\\[');

/** The data has errors, so nothing was built. */
export class BuildError extends Error {
  constructor(message, { errors = [], warnings = [] } = {}) {
    super(message);
    this.name = 'BuildError';
    this.errors = errors;
    this.warnings = warnings;
  }
}

/**
 * Builds the site into outDir. Throws BuildError, before touching outDir,
 * when the data has errors.
 *
 * @param {object} [options]
 * @param {string} [options.dataDir] Folder that holds schema/ and problems/.
 * @param {string} [options.outDir] Output folder. It is deleted and created again.
 * @param {string} [options.latestDate] Passed to loadProblems().
 * @returns {Promise<{outDir: string, problems: number, files: string[], warnings: {file: string, message: string}[]}>}
 */
export async function build({ dataDir = DEFAULT_DATA_DIR, outDir = DEFAULT_OUT_DIR, latestDate } = {}) {
  const data = path.resolve(dataDir);
  const out = path.resolve(outDir);
  await checkOutDir(out, { dataDir: data });

  const { problems, vocabulary, errors, warnings } = await loadProblems({ dataDir: data, latestDate });
  if (errors.length) {
    throw new BuildError(`${errors.length} error(s) found. Nothing was built. See docs/DATA_FORMAT.md for the rules.`, { errors, warnings });
  }
  for (const problem of problems) {
    // The schema already requires this. Checked again because ids become folder names.
    if (!ID_PATTERN.test(problem.id)) throw new BuildError(`unsafe problem id ${JSON.stringify(problem.id)}.`, { warnings });
  }

  // Everything to write: generated files, then files copied as they are.
  const generated = new Map(renderSite({ problems, vocabulary }));
  generated.set('problems.json', toJson({ license: 'CC-BY-4.0', count: problems.length, problems }));
  for (const problem of problems) generated.set(`problems/${problem.id}.json`, toJson(problem));

  const copied = new Map();
  for (const file of await listFiles(STATIC_DIR)) copied.set(file, path.join(STATIC_DIR, ...file.split('/')));
  for (const name of SCHEMA_FILES) copied.set(`schema/${name}`, path.join(data, 'schema', name));
  for (const file of copied.keys()) {
    if (generated.has(file)) throw new Error(`two outputs would be written to ${file}.`);
  }

  await resetOutDir(out, data);
  for (const file of [...generated.keys()].sort()) {
    const dest = await outputPath(out, file);
    await writeFile(dest, generated.get(file));
  }
  for (const file of [...copied.keys()].sort()) {
    await copyFile(copied.get(file), await outputPath(out, file));
  }

  return {
    outDir: out,
    problems: problems.length,
    files: [...generated.keys(), ...copied.keys()].sort(),
    warnings,
  };
}

/**
 * Throws unless outDir is safe to delete and build into: not the repository
 * root or a folder above it, not the data folder or near it, and either
 * missing, empty, or made by an earlier build (it holds BUILD_MARKER).
 * Only reads; never changes anything.
 */
export async function checkOutDir(outDir, { dataDir = DEFAULT_DATA_DIR } = {}) {
  const out = path.resolve(outDir);
  const data = path.resolve(dataDir);
  const candidates = new Set([out, await realpath(out).catch(() => out)]);
  for (const candidate of candidates) {
    if (isInside(candidate, ROOT)) {
      throw new Error(`refusing to build into ${out}: it is the repository root or a folder above it.`);
    }
    if (isInside(candidate, data) || isInside(data, candidate)) {
      throw new Error(`refusing to build into ${out}: it is the data folder, inside it, or above it.`);
    }
  }

  let entries;
  try {
    entries = await readdir(out);
  } catch (err) {
    if (err.code === 'ENOENT') return;
    if (err.code === 'ENOTDIR') throw new Error(`refusing to build into ${out}: it is a file, not a folder.`);
    throw err;
  }
  if (entries.length > 0 && !entries.includes(BUILD_MARKER)) {
    throw new Error(`refusing to build into ${out}: it is not empty and was not made by this build (it has no ${BUILD_MARKER} file).`);
  }
}

// true when `child` is `parent` or inside it.
function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function resetOutDir(out, dataDir) {
  await checkOutDir(out, { dataDir }); // check again, right before deleting
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, BUILD_MARKER), 'Made by site/build.mjs. This folder is deleted and rebuilt on every build.\n');
}

async function outputPath(out, file) {
  const dest = path.join(out, ...file.split('/'));
  if (!isInside(out, dest) || dest === out) throw new Error(`output path ${file} is outside the output folder.`);
  await mkdir(path.dirname(dest), { recursive: true });
  return dest;
}

// Stable, pretty JSON. <, > and & are written as \u escapes: the value is the
// same, and the files stay harmless even if someone pastes them into HTML.
function toJson(value) {
  const text = JSON.stringify(value, null, 2).replace(
    /[<>&\u2028\u2029]/g,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
  return `${text}\n`;
}

// Files under dir as sorted, '/'-separated relative paths. Skips dotfiles.
async function listFiles(dir, prefix = '') {
  const entries = await readdir(prefix ? path.join(dir, ...prefix.split('/')) : dir, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await listFiles(dir, relative)));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

function display(dir) {
  const relative = path.relative(process.cwd(), dir);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : dir;
}

async function main(args) {
  let values;
  try {
    ({ values } = parseArgs({
      args,
      options: {
        data: { type: 'string' },
        out: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    }));
  } catch (err) {
    console.error(`${oneLine(err.message)}\n\n${USAGE}`);
    return 1;
  }
  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  try {
    const result = await build({
      dataDir: values.data ? path.resolve(values.data) : DEFAULT_DATA_DIR,
      outDir: values.out ? path.resolve(values.out) : DEFAULT_OUT_DIR,
    });
    for (const { file, message } of result.warnings) console.warn(`warning  ${oneLine(file)}  ${oneLine(message)}`);
    console.log(`Built ${result.problems} problem page(s), ${result.files.length} files in ${oneLine(display(result.outDir))}.`);
    return 0;
  } catch (err) {
    if (!(err instanceof BuildError)) {
      console.error(`error    ${oneLine(err.message)}`);
      return 1;
    }
    for (const { file, message } of err.warnings) console.warn(`warning  ${oneLine(file)}  ${oneLine(message)}`);
    for (const { file, message } of err.errors) console.error(`error    ${oneLine(file)}  ${oneLine(message)}`);
    console.error(`\n${oneLine(err.message)}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}

#!/usr/bin/env node
// Checks every problem in data/problems/ against data/schema/problem.schema.json
// plus the extra rules in scripts/lib/problems.mjs.
//
// Usage: node scripts/validate.mjs [--data <dir>]
// Exits with 1 when any error is found. Warnings are printed but do not fail.

import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadProblems, DEFAULT_DATA_DIR } from './lib/problems.mjs';

const { values } = parseArgs({ options: { data: { type: 'string' } } });
const dataDir = values.data ? path.resolve(values.data) : DEFAULT_DATA_DIR;
const { problems, errors, warnings } = await loadProblems({ dataDir });

// On GitHub Actions, also emit annotations so problems show up on the PR diff.
const annotate = process.env.GITHUB_ACTIONS === 'true';
const escape = (text) => text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

for (const { file, message } of warnings) {
  console.warn(`warning  ${file}  ${message}`);
  if (annotate) console.log(`::warning file=${file}::${escape(message)}`);
}
for (const { file, message } of errors) {
  console.error(`error    ${file}  ${message}`);
  if (annotate) console.log(`::error file=${file}::${escape(message)}`);
}

if (errors.length) {
  console.error(`\n${errors.length} error(s) found. See docs/DATA_FORMAT.md for the rules.`);
  process.exit(1);
}

const counts = {};
for (const problem of problems) counts[problem.status] = (counts[problem.status] ?? 0) + 1;
const breakdown = Object.entries(counts).map(([status, n]) => `${n} ${status}`).join(', ');
console.log(`OK: ${problems.length} problem(s) valid${breakdown ? ` (${breakdown})` : ''}, ${warnings.length} warning(s).`);

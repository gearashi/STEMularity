#!/usr/bin/env node
// Checks every problem in data/problems/ against data/schema/problem.schema.json
// plus the extra rules in scripts/lib/problems.mjs.
//
// Usage: node scripts/validate.mjs [--data <dir>]
// Exits with 1 when any error is found, and 2 when the command line is wrong.
// Warnings are printed but do not fail.

import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadProblems, DEFAULT_DATA_DIR } from './lib/problems.mjs';

const USAGE = `Usage: node scripts/validate.mjs [--data <dir>]

  --data <dir>  folder that holds schema/ and problems/ (default: data/)
  -h, --help    show this help`;

// GitHub Actions workflow commands: the message and each property value are
// escaped the same way as in GitHub's own toolkit (@actions/core).
const escapeData = (text) => String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escapeProperty = (text) => escapeData(text).replace(/:/g, '%3A').replace(/,/g, '%2C');
const annotation = (level, file, message) => `::${level} file=${escapeProperty(file)}::${escapeData(message)}`;

async function main(args) {
  let values;
  try {
    ({ values } = parseArgs({
      args,
      options: {
        data: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    }));
  } catch (err) {
    console.error(`${err.message}\n\n${USAGE}`);
    return 2;
  }
  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  const dataDir = values.data ? path.resolve(values.data) : DEFAULT_DATA_DIR;
  const { problems, errors, warnings } = await loadProblems({ dataDir });

  // On GitHub Actions, also emit annotations so problems show up on the PR diff.
  const annotate = process.env.GITHUB_ACTIONS === 'true';

  for (const { file, message } of warnings) {
    console.warn(`warning  ${file}  ${message}`);
    if (annotate) console.log(annotation('warning', file, message));
  }
  for (const { file, message } of errors) {
    console.error(`error    ${file}  ${message}`);
    if (annotate) console.log(annotation('error', file, message));
  }

  if (errors.length) {
    console.error(`\n${errors.length} error(s) found. See docs/DATA_FORMAT.md for the rules.`);
    return 1;
  }

  const counts = {};
  for (const problem of problems) counts[problem.status] = (counts[problem.status] ?? 0) + 1;
  const breakdown = Object.entries(counts).map(([status, n]) => `${n} ${status}`).join(', ');
  console.log(`OK: ${problems.length} problem(s) valid${breakdown ? ` (${breakdown})` : ''}, ${warnings.length} warning(s).`);
  return 0;
}

// Setting exitCode instead of calling process.exit() lets piped output finish.
process.exitCode = await main(process.argv.slice(2));

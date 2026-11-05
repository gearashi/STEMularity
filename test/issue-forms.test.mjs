// Checks that the GitHub issue forms in .github/ISSUE_TEMPLATE/ stay in step
// with the site, which links to them with fields filled in, and with
// vocabulary.json. GitHub itself checks the form syntax once the forms are on
// the default branch; these tests only read the files as text, so they need
// no YAML parser.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../scripts/lib/problems.mjs';
import { NEW_PROBLEM_FORM, PROGRESS_FORM, PROGRESS_TITLE } from '../site/src/config.mjs';

const FORMS = path.join(ROOT, '.github', 'ISSUE_TEMPLATE');
const read = (name) => readFile(path.join(FORMS, name), 'utf8');
const vocabulary = JSON.parse(await readFile(path.join(ROOT, 'data', 'schema', 'vocabulary.json'), 'utf8'));

/** The ids of a form's fields, in order. */
const fieldIds = (form) => [...form.matchAll(/^    id: ([A-Za-z0-9_-]+)$/gm)].map((m) => m[1]);

describe('the issue forms', () => {
  it('include the progress form that the site fills in, with the fields it fills in', async () => {
    const form = await read(PROGRESS_FORM);
    const ids = fieldIds(form);
    for (const id of ['problem', 'checkpoint']) assert.ok(ids.includes(id), `${PROGRESS_FORM} has no "${id}" field`);
    assert.ok(form.includes(`\ntitle: "${PROGRESS_TITLE}"\n`), `${PROGRESS_FORM}'s title must start like the site's links: "${PROGRESS_TITLE}"`);
    assert.deepEqual(ids, [...new Set(ids)], 'field ids are unique');
  });

  it('list every field and status from vocabulary.json in the new-problem form', async () => {
    const form = await read(NEW_PROBLEM_FORM);
    for (const { label } of Object.values(vocabulary.field)) {
      assert.ok(form.includes(`        - "${label}"\n`), `${NEW_PROBLEM_FORM} has no field option "${label}"`);
    }
    for (const { label } of Object.values(vocabulary.status)) {
      assert.ok(form.includes(`        - "${label}: `), `${NEW_PROBLEM_FORM} has no status option "${label}"`);
    }
    for (const { label } of Object.values(vocabulary.ai_effort)) {
      assert.ok(form.includes(`        - "${label}"\n`), `${NEW_PROBLEM_FORM} has no AI effort option "${label}"`);
    }
    assert.deepEqual(fieldIds(form), [...new Set(fieldIds(form))], 'field ids are unique');
  });

  it('ask for links and a CC BY 4.0 agreement, never for copies of papers', async () => {
    for (const name of [PROGRESS_FORM, NEW_PROBLEM_FORM]) {
      const form = await read(name);
      assert.match(form, /\*\*Link, don't copy\.\*\*/, name);
      assert.ok(form.includes('can be added to STEMularity under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)'), name);
      assert.ok(!form.includes('\t'), `${name} has a tab, which YAML does not allow for indentation`);
    }
  });

  it('quote every dropdown option, so YAML never reads one as true, false or a number', async () => {
    for (const name of [PROGRESS_FORM, NEW_PROBLEM_FORM]) {
      const form = await read(name);
      const options = form.split('\n').filter((line) => /^        - (?!label:)/.test(line));
      assert.ok(options.length > 0, name);
      for (const line of options) assert.match(line, /^        - "[^"]+"$/, `${name}: ${line.trim()}`);
    }
  });
});

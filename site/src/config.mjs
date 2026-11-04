// Site-wide settings, kept in one place. Change them here if the repository
// moves or the default branch is renamed.

export const SITE_NAME = 'STEMularity';
export const REPO_URL = 'https://github.com/gearashi/STEMularity';
export const REPO_BRANCH = 'main';
export const CC_BY_URL = 'https://creativecommons.org/licenses/by/4.0/';

/** A file in the repository on GitHub, for example repoFileUrl('LICENSE'). */
export function repoFileUrl(file) {
  return `${REPO_URL}/blob/${REPO_BRANCH}/${file}`;
}

/** GitHub's "edit this file" page for a file in the repository. */
export function repoEditUrl(file) {
  return `${REPO_URL}/edit/${REPO_BRANCH}/${file}`;
}

// The issue forms in .github/ISSUE_TEMPLATE/. Most community updates arrive
// through them: someone reports progress, with links, and the report is
// turned into a change to the problem's file.
export const PROGRESS_FORM = 'progress-update.yml';
export const NEW_PROBLEM_FORM = 'new-problem.yml';

/**
 * GitHub's "new issue" page for an issue form, with fields filled in. Keys are
 * the form's field ids (or "title"); every key and value is percent-encoded.
 */
export function newIssueUrl(form, fields = {}) {
  const query = Object.entries({ template: form, ...fields })
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `${REPO_URL}/issues/new?${query}`;
}

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

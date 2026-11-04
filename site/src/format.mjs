// Text formatting for the site build. Everything here is deterministic: no
// locale-dependent formatting and no clock, so two builds of the same data
// produce the same bytes.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DATE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

/**
 * Formats a YYYY, YYYY-MM or YYYY-MM-DD date as "2019", "March 2019" or
 * "14 August 2023". Anything else is returned unchanged, as text.
 */
export function formatDate(value) {
  const text = value === null || value === undefined ? '' : String(value);
  const match = DATE.exec(text);
  if (!match) return text;
  const [, year, month, day] = match;
  if (!month) return year;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return text;
  return day ? `${Number(day)} ${monthName} ${year}` : `${monthName} ${year}`;
}

/**
 * Shortens text to at most `max` characters, cutting at a word boundary and
 * adding an ellipsis. Whitespace runs are collapsed first. Counts code points,
 * so a cut never splits an emoji or other astral character.
 */
export function truncate(text, max = 200) {
  const chars = Array.from(String(text ?? '').trim().replace(/\s+/g, ' '));
  if (chars.length <= max) return chars.join('');
  let cut = chars.slice(0, max).join('');
  if (chars[max] !== ' ') {
    const space = cut.lastIndexOf(' ');
    if (space >= max / 2) cut = cut.slice(0, space);
  }
  return `${cut.replace(/[\s.,;:!?(\-–—]+$/u, '')}…`;
}

/** "1 checkpoint", "2 checkpoints". */
export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

// Text formatting for the site build. Everything here is deterministic: no
// locale-dependent formatting and no clock, so two builds of the same data
// produce the same bytes.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
// The data's date shapes: -YYYY (a year BCE, year only), or YYYY, YYYY-MM or
// YYYY-MM-DD (CE). Captures the BCE year, or the CE year, month and day.
const DATE = /^(?:-(\d{4})|(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?)$/;

/**
 * Formats a year given as an integer: 2019 as "2019", 430 as "430 CE" and
 * -300 as "300 BCE". Years before 1000 get "CE", so they don't read as plain
 * numbers. Anything else (including 0, which is not a year) is returned as text.
 */
export function formatYear(year) {
  if (year === null || year === undefined) return '';
  if (!Number.isInteger(year) || year === 0) return String(year);
  if (year < 0) return `${-year} BCE`;
  return year < 1000 ? `${year} CE` : String(year);
}

/**
 * Formats a date from the data: "2019", "March 2019", "14 August 2023",
 * "14 May 430 CE" or "430 BCE" (from -0430). Anything else, such as year
 * 0000, is returned unchanged, as text.
 */
export function formatDate(value) {
  const text = value === null || value === undefined ? '' : String(value);
  const match = DATE.exec(text);
  if (!match) return text;
  const [, bceYear, ceYear, month, day] = match;
  if (Number(bceYear ?? ceYear) === 0) return text; // there is no year 0
  if (bceYear !== undefined) return formatYear(-Number(bceYear));
  const year = formatYear(Number(ceYear));
  if (!month) return year;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return text;
  return day ? `${Number(day)} ${monthName} ${year}` : `${monthName} ${year}`;
}

/** true for a date from the data that is a year BCE, such as "-0430". */
export function isBceDate(value) {
  return typeof value === 'string' && value.startsWith('-');
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

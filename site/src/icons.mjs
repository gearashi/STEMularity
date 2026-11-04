// Pixel-art markers for checkpoint statuses, drawn on a 9×9 grid.
//
// Each status has its own shape as well as its own color, so the progress
// map can be read without color vision:
//   done         a square with a tick
//   in-progress  a half-filled ring
//   not-started  an empty ring
//   disputed     a diamond with a question mark
//   dead-end     a cross
// "#" pixels take the marker color (set in styles.css by status). "o" pixels
// are left transparent: they cut out the tick and the question mark, and show
// the background inside the rings.

import { html } from './html.mjs';

const GRIDS = {
  done: [
    '.#######.',
    '#########',
    '#######o#',
    '######o##',
    '#o###o###',
    '##o#o####',
    '###o#####',
    '#########',
    '.#######.',
  ],
  'in-progress': [
    '..#####..',
    '.####oo#.',
    '#####ooo#',
    '#####ooo#',
    '#####ooo#',
    '#####ooo#',
    '#####ooo#',
    '.####oo#.',
    '..#####..',
  ],
  'not-started': [
    '..#####..',
    '.#ooooo#.',
    '#ooooooo#',
    '#ooooooo#',
    '#ooooooo#',
    '#ooooooo#',
    '#ooooooo#',
    '.#ooooo#.',
    '..#####..',
  ],
  disputed: [
    '....#....',
    '...###...',
    '..#oo##..',
    '.####o##.',
    '####o####',
    '.#######.',
    '..##o##..',
    '...###...',
    '....#....',
  ],
  'dead-end': [
    '##.....##',
    '###...###',
    '.###.###.',
    '..#####..',
    '...###...',
    '..#####..',
    '.###.###.',
    '###...###',
    '##.....##',
  ],
};

// Turns the "#" pixels into a single SVG path, one run per row.
function toPath(grid) {
  let d = '';
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '#') continue;
      let end = x;
      while (end < row.length && row[end] === '#') end++;
      d += `M${x} ${y}h${end - x}v1h${x - end}z`;
      x = end - 1;
    }
  });
  return d;
}

const PATHS = Object.fromEntries(Object.entries(GRIDS).map(([status, grid]) => [status, toPath(grid)]));

/** The statuses that have a marker. */
export const MARKER_STATUSES = Object.keys(GRIDS);

/**
 * The marker shapes, defined once per page as <symbol>s. Every page that
 * calls marker() must include this sprite before the first marker.
 */
export function markerSprite() {
  return html`<svg class="sprite" width="0" height="0" aria-hidden="true">
${MARKER_STATUSES.map((status) => html`<symbol id="mk-${status}" viewBox="0 0 9 9"><path fill="currentColor" d="${PATHS[status]}"/></symbol>
`)}</svg>`;
}

/**
 * A checkpoint marker. Decorative: the status is always written out as text
 * next to it. `size` is in CSS pixels; multiples of 9 keep the pixels square
 * and sharp. `title` becomes a tooltip. An unknown status gets the
 * not-started ring and a neutral color.
 */
export function marker(status, { size = 18, title } = {}) {
  const known = Object.hasOwn(PATHS, status);
  const symbol = known ? status : 'not-started';
  return html`<svg class="mk ${known ? `mk-${status}` : 'mk-unknown'}" viewBox="0 0 9 9" width="${size}" height="${size}" aria-hidden="true" shape-rendering="crispEdges">${title ? html`<title>${title}</title>` : ''}<use href="#mk-${symbol}"/></svg>`;
}

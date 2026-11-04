// STEMularity problem list: search, sort and filter.
//
// The build renders every problem as a card, in A-Z order, so the list works
// without JavaScript. This script only reorders and hides those cards, using
// the data-* attributes on each card. It fetches nothing. The current view is
// kept in the address (?q=&sort=&dir=&status=&field=, defaults left out), so
// it survives a reload and can be shared.

(() => {
  'use strict';

  const form = document.getElementById('controls');
  const list = document.getElementById('problem-list');
  if (!form || !list) return;

  const search = document.getElementById('q');
  const sortSelect = document.getElementById('sort');
  const dirButton = document.getElementById('sort-dir');
  const resetButton = document.getElementById('reset');
  const count = document.getElementById('result-count');
  const empty = document.getElementById('empty');
  const emptyReset = document.getElementById('empty-reset');
  const filters = document.getElementById('filters');
  const boxes = {
    status: Array.from(form.querySelectorAll('input[name="status"]')),
    field: Array.from(form.querySelectorAll('input[name="field"]')),
  };

  const collator = new Intl.Collator('en', { sensitivity: 'base' });
  const TEXT_KEYS = new Set(['name', 'category']);
  const MAX_QUERY = 200;

  // Sort keys, with their default direction and wording, from the <option>s.
  const sorts = new Map(Array.from(sortSelect.options, (option) => [option.value, {
    dir: option.dataset.dir === 'desc' ? 'desc' : 'asc',
    asc: option.dataset.asc || 'ascending',
    desc: option.dataset.desc || 'descending',
    noun: option.dataset.noun || option.value,
  }]));
  const DEFAULT_SORT = sortSelect.options[0].value;

  const toNumber = (value) => {
    if (value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const items = Array.from(list.children, (li) => ({
    li,
    id: li.dataset.id || '',
    name: li.dataset.name || '',
    category: li.dataset.category || '',
    field: li.dataset.field || '',
    status: li.dataset.status || '',
    search: li.dataset.search || '',
    effort: toNumber(li.dataset.effort),
    'work-left': toNumber(li.dataset.workLeft),
    significance: toNumber(li.dataset.significance),
  }));
  const total = items.length;

  const valuesOf = (group) => boxes[group].map((box) => box.value);

  const defaults = () => ({
    q: '',
    sort: DEFAULT_SORT,
    dir: sorts.get(DEFAULT_SORT).dir,
    status: new Set(valuesOf('status')),
    field: new Set(valuesOf('field')),
  });

  let state = defaults();

  const normalize = (text) => text.trim().replace(/\s+/g, ' ').toLowerCase();

  // Ties break by name A-Z, then id. Problems without ratings always come
  // after rated ones, in either direction.
  function compare(a, b) {
    const sign = state.dir === 'desc' ? -1 : 1;
    let primary = 0;
    if (TEXT_KEYS.has(state.sort)) {
      primary = sign * collator.compare(a[state.sort], b[state.sort]);
    } else {
      const x = a[state.sort];
      const y = b[state.sort];
      if (x === null || y === null) {
        if (x !== y) return x === null ? 1 : -1;
      } else {
        primary = sign * (x - y);
      }
    }
    if (primary) return primary;
    return collator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }

  function render() {
    const query = normalize(state.q);
    const sorted = items.slice().sort(compare);
    let shown = 0;
    for (const item of sorted) {
      const visible = state.status.has(item.status)
        && state.field.has(item.field)
        && (!query || item.search.includes(query));
      item.li.hidden = !visible;
      if (visible) shown += 1;
    }
    list.append(...sorted.map((item) => item.li));
    list.hidden = shown === 0;
    if (empty) empty.hidden = shown !== 0;

    // Must match countText() in site/src/pages.mjs.
    const sort = sorts.get(state.sort);
    const order = sort[state.dir];
    count.textContent = `Showing ${shown} of ${total} ${total === 1 ? 'problem' : 'problems'}, sorted by ${sort.noun} (${order}).`;
    dirButton.textContent = `Order: ${order}`;
  }

  function showState() {
    search.value = state.q;
    sortSelect.value = state.sort;
    for (const group of Object.keys(boxes)) {
      for (const box of boxes[group]) box.checked = state[group].has(box.value);
    }
  }

  // Reads the view from the address. Unknown or broken values are ignored.
  function readUrl() {
    const next = defaults();
    let params;
    try {
      params = new URLSearchParams(window.location.search);
    } catch {
      return next;
    }
    const q = params.get('q');
    if (q) next.q = q.slice(0, MAX_QUERY);
    const sort = params.get('sort');
    if (sort && sorts.has(sort)) next.sort = sort;
    next.dir = sorts.get(next.sort).dir;
    const dir = params.get('dir');
    if (dir === 'asc' || dir === 'desc') next.dir = dir;
    for (const group of Object.keys(boxes)) {
      if (!params.has(group)) continue;
      const value = params.get(group);
      if (value === '') {
        next[group] = new Set(); // everything unticked
        continue;
      }
      const known = new Set(valuesOf(group));
      const picked = value.split(',').filter((item) => known.has(item));
      if (picked.length) next[group] = new Set(picked);
    }
    return next;
  }

  function writeUrl() {
    const parts = [];
    const q = state.q.trim();
    if (q) parts.push(`q=${encodeURIComponent(q)}`);
    if (state.sort !== DEFAULT_SORT) parts.push(`sort=${encodeURIComponent(state.sort)}`);
    if (state.dir !== sorts.get(state.sort).dir) parts.push(`dir=${state.dir}`);
    for (const group of Object.keys(boxes)) {
      const all = valuesOf(group);
      const chosen = all.filter((value) => state[group].has(value));
      if (chosen.length !== all.length) parts.push(`${group}=${chosen.map(encodeURIComponent).join(',')}`);
    }
    const query = parts.length ? `?${parts.join('&')}` : '';
    try {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${query}${window.location.hash}`);
    } catch {
      // Some browsers refuse this on file:// pages. The list still works.
    }
  }

  function update() {
    render();
    writeUrl();
  }

  function reset() {
    state = defaults();
    showState();
    update();
  }

  form.addEventListener('submit', (event) => event.preventDefault());
  search.addEventListener('input', () => {
    state.q = search.value.slice(0, MAX_QUERY);
    update();
  });
  sortSelect.addEventListener('change', () => {
    if (!sorts.has(sortSelect.value)) return;
    state.sort = sortSelect.value;
    state.dir = sorts.get(state.sort).dir;
    update();
  });
  dirButton.addEventListener('click', () => {
    state.dir = state.dir === 'asc' ? 'desc' : 'asc';
    update();
  });
  for (const group of Object.keys(boxes)) {
    for (const box of boxes[group]) {
      box.addEventListener('change', () => {
        state[group] = new Set(boxes[group].filter((item) => item.checked).map((item) => item.value));
        update();
      });
    }
  }
  resetButton.addEventListener('click', reset);
  if (emptyReset) {
    emptyReset.addEventListener('click', () => {
      reset();
      search.focus();
    });
  }

  state = readUrl();
  showState();
  render();

  // On small screens the filters start folded away, unless some are in use.
  const filtersInUse = Object.keys(boxes).some((group) => state[group].size !== boxes[group].length);
  if (filters && !filtersInUse && window.matchMedia('(max-width: 59.99rem)').matches) filters.open = false;

  form.hidden = false;
})();

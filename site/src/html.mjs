// HTML helpers for the site build.
//
// Problem data will arrive through public pull requests, so every value that
// goes into a page is treated as untrusted. Pages are built with the html``
// tag, which escapes every interpolated value with escapeHtml() unless the
// value is markup that html`` itself produced. Templates always put attribute
// values in double quotes, so escaped values can never end an attribute early.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const UNSAFE = /[&<>"']/g;

/**
 * Escapes a value for HTML text and for quoted attribute values.
 * null and undefined become an empty string; other values are converted with String().
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(UNSAFE, (ch) => ESCAPES[ch]);
}

/** Markup that is safe to insert as it is. Only html`` and raw() create it. */
export class SafeHtml {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

/**
 * Tagged template for HTML. Interpolated values are escaped, except SafeHtml
 * (markup built by html`` or raw()). Arrays are joined, each item handled the
 * same way. null, undefined and false render as nothing.
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += interpolate(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

function interpolate(value) {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(interpolate).join('');
  return escapeHtml(value);
}

/** Marks trusted, hand-written markup as safe. Never pass problem data to it. */
export function raw(markup) {
  return new SafeHtml(String(markup));
}

/**
 * Returns the URL, normalized, when it is an absolute http: or https: URL.
 * Returns null for anything else: javascript:, data:, relative or broken URLs.
 */
export function safeUrl(value) {
  if (typeof value !== 'string') return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
}

/**
 * A link to another website. External links get rel="noopener noreferrer".
 * When the URL is not http(s), the text is shown without a link.
 */
export function externalLink(url, text, { className } = {}) {
  const href = safeUrl(url);
  const cls = className ? html` class="${className}"` : '';
  if (!href) return html`<span${cls}>${text}</span>`;
  return html`<a${cls} href="${href}" rel="noopener noreferrer">${text}</a>`;
}

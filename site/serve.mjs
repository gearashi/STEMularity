#!/usr/bin/env node
// A tiny static server for previewing the built site on your own computer.
//
// Usage: node site/serve.mjs [--port <n>] [--dir <folder>]
//   --port  port to listen on (default: the PORT variable, or 8788)
//   --dir   folder to serve (default: site/dist)
//
// It listens on 127.0.0.1 only and is not meant for public use. It serves
// index.html for folders, redirects /folder to /folder/, and answers unknown
// paths with 404.html. It also applies the rules in _headers whose pattern is
// an exact path or ends in /*, so the preview runs under the same Content
// Security Policy as Cloudflare Pages.
//
// A rebuild while the server runs deletes and rewrites the files. Each file is
// read in full before any header is sent, so a file that disappears gets the
// normal 404 answer, and any other read error a 500, instead of a crash.

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const SITE_DIR = path.dirname(fileURLToPath(import.meta.url));
const HOST = '127.0.0.1';
const DEFAULT_PORT = 8788;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

/**
 * Creates (but does not start) a server for the files in `root`.
 * @param {{root: string}} options
 */
export function createServer({ root }) {
  const base = path.resolve(root);
  return http.createServer((req, res) => {
    handle(req, res, base).catch((err) => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Internal error: ${err.message}\n`);
    });
  });
}

async function handle(req, res, root) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method not allowed\n');
    return;
  }

  let url;
  let pathname;
  try {
    url = new URL(req.url, 'http://localhost');
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return sendText(res, 400, 'Bad request\n');
  }
  if (pathname.includes('\0') || pathname.includes('\\')) return sendText(res, 400, 'Bad request\n');

  // Resolve the path and make sure it stays inside the served folder.
  let file = path.resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(root + path.sep)) return sendNotFound(req, res, root);

  let info = await stat(file).catch(() => null);
  if (info?.isDirectory()) {
    if (!pathname.endsWith('/')) {
      const location = `/${url.pathname.replace(/^\/+/, '')}/${url.search}`;
      res.writeHead(301, { Location: location, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Moved to ${location}\n`);
      return;
    }
    file = path.join(file, 'index.html');
    info = await stat(file).catch(() => null);
  }
  if (!info?.isFile()) return sendNotFound(req, res, root);

  const body = await readIfThere(file);
  if (body === null) return sendNotFound(req, res, root);
  await sendFile(req, res, root, file, body, 200, pathname);
}

// The file's contents, or null when it is gone (for example deleted by a
// rebuild after stat() saw it). Other errors are thrown, and become a 500.
async function readIfThere(file) {
  try {
    return await readFile(file);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return null;
    throw err;
  }
}

async function sendFile(req, res, root, file, body, status, pathname) {
  const headers = {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...(await headerRules(root, pathname)),
  };
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

async function sendNotFound(req, res, root) {
  const file = path.join(root, '404.html');
  const info = await stat(file).catch(() => null);
  const body = info?.isFile() ? await readIfThere(file) : null;
  if (body === null) return sendText(res, 404, 'Not found\n');
  await sendFile(req, res, root, file, body, 404, '/404.html');
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

// Headers from _headers that apply to this path. Supports exact paths and
// patterns ending in /* (Cloudflare Pages supports more).
async function headerRules(root, pathname) {
  let text;
  try {
    text = await readFile(path.join(root, '_headers'), 'utf8');
  } catch {
    return {};
  }
  const headers = {};
  let applies = false;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const pattern = line.trim();
      applies = pattern.endsWith('/*') ? pathname.startsWith(pattern.slice(0, -1)) : pattern === pathname;
      continue;
    }
    const colon = line.indexOf(':');
    if (applies && colon > 0) headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return headers;
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`invalid port: ${value}`);
  return port;
}

async function main(args) {
  let values;
  try {
    ({ values } = parseArgs({ args, options: { port: { type: 'string' }, dir: { type: 'string' } } }));
  } catch (err) {
    console.error(`${err.message}\nUsage: node site/serve.mjs [--port <n>] [--dir <folder>]`);
    return 1;
  }

  let port;
  try {
    port = parsePort(values.port ?? process.env.PORT ?? DEFAULT_PORT);
  } catch (err) {
    console.error(err.message);
    return 1;
  }
  const root = path.resolve(values.dir ?? path.join(SITE_DIR, 'dist'));
  const info = await stat(path.join(root, 'index.html')).catch(() => null);
  if (!info?.isFile()) {
    console.error(`Nothing to serve: ${root} has no index.html. Run "npm run build" first.`);
    return 1;
  }

  const server = createServer({ root });
  server.on('error', (err) => {
    console.error(`Could not start the server: ${err.message}`);
    process.exitCode = 1;
  });
  server.listen(port, HOST, () => {
    console.log(`Serving ${path.relative(process.cwd(), root) || root} at http://${HOST}:${server.address().port}/ (press Ctrl+C to stop)`);
  });
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const code = await main(process.argv.slice(2));
  if (code) process.exitCode = code;
}

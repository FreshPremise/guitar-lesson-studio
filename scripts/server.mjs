import { PUBLIC_FILES } from './public-files.mjs';
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, relative } from 'node:path';

const root = normalize(join(import.meta.dirname, '..'));
const port = Number(process.env.PORT || 4173);
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
const allowedFiles = new Set(PUBLIC_FILES.map(normalize));

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

createServer((request, response) => {
  if (!allowedHosts.has(request.headers.host)) {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Invalid host');
    return;
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Method not allowed');
    return;
  }
  let requested;
  try {
    requested = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Invalid request');
    return;
  }
  const resourcePath = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
  const target = normalize(join(root, resourcePath));

  const fromRoot = relative(root, target);
  if (
    fromRoot.startsWith('..') ||
    fromRoot.includes(':') ||
    !allowedFiles.has(fromRoot) ||
    !statIsFile(target)
  ) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': types[extname(target)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
    'X-Guitar-Studio': 'local',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; media-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  });
  if (request.method === 'HEAD') return response.end();
  const stream = createReadStream(target);
  stream.on('error', () => response.destroy());
  stream.pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`Guitar Lesson Studio: http://127.0.0.1:${port}`);
});

function statIsFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

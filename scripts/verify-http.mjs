import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
const base = 'http://127.0.0.1:4173';
await mkdir('verification/v6', { recursive: true });
let count = 0;
for (const path of [
  '/',
  '/styles.css',
  '/assets/fonts/Manrope.ttf',
  '/assets/fonts/OFL.txt',
  '/assets/guitar/D5.mp3',
  ...['E2', 'A2', 'C3', 'Ds3', 'Fs3', 'A3', 'C4', 'Ds4', 'Fs4', 'A4', 'C5', 'Ds5', 'Fs5', 'A5', 'C6'].map(
    (n) => `/assets/electric/${n}.mp3`,
  ),
  ...['arrangement', 'revision', 'fret-path'].map((n) => `/src/${n}.js`),
  '/src/app.js',
  '/src/theory.js',
  '/src/library.js',
  '/src/storage.js',
  '/src/tunings.js',
  '/src/learning.js',
  '/src/transport.js',
  '/src/samples.js',
  ...['rhythm', 'voicings', 'songs', 'audio-engine', 'exports', 'practice', 'studio'].map(
    (n) => `/src/${n}.js`,
  ),
  ...['E2', 'A2', 'C3', 'E3', 'A3', 'C4', 'E4', 'A4', 'C5'].map((n) => `/assets/guitar/${n}.mp3`),
]) {
  const r = await fetch(base + path);
  assert.equal(r.status, 200, path);
  assert.equal(r.headers.get('x-guitar-studio'), 'local');
  assert.ok(r.headers.get('content-security-policy').includes("connect-src 'self'"));
  if (path.endsWith('.mp3')) assert.equal(r.headers.get('content-type'), 'audio/mpeg');
  await r.arrayBuffer();
  count++;
}
for (const path of [
  '/credits.css',
  '/SAMPLE_CREDITS.html',
  '/README.md',
  '/WHERE_WE_LEFT_OFF.md',
  '/tests/storage.test.mjs',
  '/revisions/v0.3/index.html',
  '/scripts/server.mjs',
  '/.git/config',
  '/verification/v4/study-sheet.pdf',
  '/assets/guitar/SHA256.json',
]) {
  assert.equal((await fetch(base + path)).status, 404, path);
  count++;
}
await new Promise((resolve, reject) => {
  http
    .get(base, { headers: { Host: 'untrusted.example' } }, (r) => {
      try {
        assert.equal(r.statusCode, 400);
        r.resume();
        count++;
        resolve();
      } catch (e) {
        reject(e);
      }
    })
    .on('error', reject);
});
for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
  assert.equal((await fetch(base, { method })).status, 405);
  count++;
}
const head = await fetch(base, { method: 'HEAD' });
assert.equal(head.status, 200);
assert.equal(await head.text(), '');
count += 2;
const result = { result: 'PASS', assertions: count };
await writeFile('verification/v6/http-results.json', JSON.stringify(result, null, 2));
console.log(result);

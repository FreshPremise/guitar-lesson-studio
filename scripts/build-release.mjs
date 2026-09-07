import { mkdir, readFile, writeFile, lstat, readdir, realpath, rm } from 'node:fs/promises';
import { resolve, relative, dirname, isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';
import { HOSTING_FILES, SOURCE_FILES } from './release-files.mjs';
const root = await realpath(resolve(import.meta.dirname, '..'));
const mode = process.argv[2];
if (!['source', 'hosting'].includes(mode)) throw new Error('Choose source or hosting');
const files = mode === 'source' ? SOURCE_FILES : HOSTING_FILES;
const output = resolve(root, mode === 'source' ? 'release/github-source' : 'dist');
// Both output names are fixed. Reject links and escapes before replacing generated content.
const inside = (path) => {
  const rel = relative(root, path);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Unsafe release path');
};
inside(output);
async function noLinks(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw new Error('Release paths cannot contain symbolic links');
  if (info.isDirectory()) for (const name of await readdir(path)) await noLinks(join(path, name));
}
await mkdir(dirname(output), { recursive: true });
if ((await realpath(dirname(output))) !== dirname(output))
  throw new Error('Release parent must not be redirected');
// Validate all input paths and read them before touching a previous build.
const manifest = [];
const prepared = new Map();
for (const path of files) {
  const absolute = resolve(root, path);
  inside(absolute);
  if ((await realpath(absolute)) !== absolute) throw new Error('Source files must not be redirected');
  let data = await readFile(absolute);
  // The downloadable/local app stays unchanged; only the hosted copy carries the demo notice.
  if (mode === 'hosting' && path === 'index.html') {
    const original = '<h1>Guitar Lesson Studio</h1>';
    const html = data.toString('utf8');
    if (html.split(original).length !== 2) throw new Error('Expected one application title for demo build');
    data = Buffer.from(html.replace(original, `${original}
          <p class="demo-notice">Demo <span aria-hidden="true">·</span> Download from <a href="https://github.com/FreshPremise/guitar-lesson-studio" target="_blank" rel="noopener noreferrer" aria-label="Download Guitar Lesson Studio from GitHub (opens a new tab)">GitHub</a></p>`));
  }
  if (mode === 'hosting' && path === 'styles.css') {
    data = Buffer.concat([data, Buffer.from(`
/* Hosted demonstration notice: no extra requests or application permissions. */
.brand .demo-notice {
  display: block;
  margin: 2px 0 0;
  color: #fff;
  font-size: 17px;
  font-weight: 500;
  line-height: 1.25;
  letter-spacing: 0;
}
.demo-notice a { color: #fff; font-weight: 700; text-underline-offset: 3px; }
.demo-notice a:hover { text-decoration-thickness: 2px; }
.demo-notice a:focus-visible { outline: 2px solid #fff; outline-offset: 4px; border-radius: 2px; }
@media (min-width: 1600px) {
  .brand > div { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 16px; }
  .brand .demo-notice { margin: 0; }
}
`)]);
  }
  prepared.set(path, data);
  manifest.push({ path, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
}
try {
  await noLinks(output);
  await rm(output, { recursive: true });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await mkdir(output, { recursive: true });
for (const path of files) {
  await mkdir(dirname(resolve(output, path)), { recursive: true });
  await writeFile(resolve(output, path), prepared.get(path));
}
await writeFile(
  resolve(output, 'release-manifest.json'),
  JSON.stringify({ version: '0.9.3', kind: mode, files: manifest }, null, 2) + '\n',
);
console.log(
  `${mode}: ${files.length} allowlisted files prepared in ${relative(root, output).replaceAll('\\', '/')}`,
);

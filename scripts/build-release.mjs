import { mkdir, readFile, copyFile, writeFile, lstat, readdir, realpath, rm } from 'node:fs/promises';
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
for (const path of files) {
  const absolute = resolve(root, path);
  inside(absolute);
  if ((await realpath(absolute)) !== absolute) throw new Error('Source files must not be redirected');
  const data = await readFile(absolute);
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
  await copyFile(resolve(root, path), resolve(output, path));
}
await writeFile(
  resolve(output, 'release-manifest.json'),
  JSON.stringify({ version: '0.8.0', kind: mode, files: manifest }, null, 2) + '\n',
);
console.log(
  `${mode}: ${files.length} allowlisted files prepared in ${relative(root, output).replaceAll('\\', '/')}`,
);

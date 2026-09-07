import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const files = [];
for (const dir of ['guitar', 'electric', 'fonts'])
  for (const n of await readdir('assets/' + dir)) {
    if (!/\.(mp3|ttf|txt|md)$/.test(n)) continue;
    const path = `assets/${dir}/${n}`,
      data = await readFile(path);
    files.push({ path, sha256: createHash('sha256').update(data).digest('hex'), bytes: data.length });
  }
await writeFile(
  'assets/v6-manifest.json',
  JSON.stringify(
    {
      sampleRevision: '622c2f1c32c8cfce4158ddc3eb26e518ddef37e5',
      fontSource: 'https://github.com/google/fonts/tree/main/ofl/manrope',
      retrieved: '2026-09-06',
      files,
    },
    null,
    2,
  ),
);
console.log(files.length + ' asset hashes recorded');

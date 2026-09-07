import { readFile, readdir, lstat, realpath } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { createHash } from 'node:crypto';
import { SOURCE_FILES, HOSTING_FILES } from './release-files.mjs';
const root = await realpath(resolve(import.meta.dirname, '..'));
const findings = [];
// Heuristics supplement source review. Only filenames/categories are printed, never matched secrets.
const checks = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  [
    'access token',
    /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AIza[A-Za-z0-9_-]{30,}|sk-[A-Za-z0-9_-]{24,})/,
  ],
  ['home directory', /(?:[A-Z]:[\\/]+Users[\\/]+[^\s/\\"']+|\/home\/[^\s/"']+|\/Users\/[^\s/"']+)/i],
  ['cloud credential', /"(?:private_key|client_email)"\s*:/],
  ['personal backup', /"(?:schemaVersion|exportedAt)"\s*:/],
];
async function walk(dir) {
  const result = [];
  for (const name of await readdir(dir)) {
    const path = join(dir, name),
      info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error('Unexpected release link');
    if (info.isDirectory()) result.push(...(await walk(path)));
    else result.push(path);
  }
  return result;
}
for (const [directory, expected] of [
  ['release/github-source', SOURCE_FILES],
  ['dist', HOSTING_FILES],
]) {
  const base = resolve(root, directory),
    files = await walk(base),
    allowed = new Set([...expected, 'release-manifest.json']);
  const manifest = JSON.parse(await readFile(resolve(base, 'release-manifest.json'), 'utf8'));
  if (manifest.files.length !== expected.length) findings.push(`${directory}: manifest count mismatch`);
  for (const path of files) {
    const name = relative(base, path).replaceAll('\\', '/');
    if (!allowed.has(name)) findings.push(`${directory}/${name}: unexpected file`);
    const data = await readFile(path),
      record = manifest.files.find((f) => f.path === name);
    if (
      name !== 'release-manifest.json' &&
      (!record || record.sha256 !== createHash('sha256').update(data).digest('hex'))
    )
      findings.push(`${directory}/${name}: checksum mismatch`);
    if (/\.(?:js|mjs|json|md|html|css|txt|cmd)$/.test(name)) {
      // Tests deliberately contain synthetic backup fixtures; application code emits backup envelopes.
      for (const [label, pattern] of checks) {
        if (label === 'personal backup' && /^(?:src|tests|scripts)\//.test(name)) continue;
        if (pattern.test(data.toString('utf8'))) findings.push(`${directory}/${name}: ${label}`);
      }
    }
  }
  for (const name of allowed)
    if (!files.some((p) => relative(base, p).replaceAll('\\', '/') === name))
      findings.push(`${directory}/${name}: missing file`);
  console.log(`${directory}: ${files.length} files checked`);
}
if (findings.length) {
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    'PASS: exact file allowlists, checksums and credential/path/backup pattern checks. This is not a security guarantee.',
  );

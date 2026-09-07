import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = dirname(dirname(fileURLToPath(import.meta.url))),
  origin = 'http://127.0.0.1:4173/';
async function probe() {
  try {
    const response = await fetch(origin, { signal: AbortSignal.timeout(2500) });
    if (response.status !== 200 || response.headers.get('x-guitar-studio') !== 'local')
      throw new Error(
        'Port 4173 is occupied by a different app or an older studio server. Close that server before using this launcher.',
      );
    return true;
  } catch (e) {
    if (e.cause?.code === 'ECONNREFUSED') return false;
    throw e;
  }
}
try {
  let ready = await probe();
  if (!ready && process.argv.includes('--check')) throw new Error('The studio server is not running.');
  if (!ready) {
    const output = openSync(join(root, 'server-output.log'), 'a'),
      errors = openSync(join(root, 'server-error.log'), 'a');
    const child = spawn(process.execPath, [join(root, 'scripts', 'server.mjs')], {
      cwd: root,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', output, errors],
    });
    closeSync(output);
    closeSync(errors);
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    child.unref();
    for (let n = 0; n < 40 && !ready; n++) {
      await new Promise((r) => setTimeout(r, 100));
      ready = await probe();
    }
    if (!ready) throw new Error('The studio could not start. Check server-error.log.');
  }
  console.log(`Guitar Lesson Studio is ready at ${origin}`);
  if (!process.argv.includes('--check')) {
    console.log('Each browser has its own notebook. Import a backup if you are switching browsers.');
    const child = spawn('cmd.exe', ['/c', 'start', '', origin], {
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
    });
    child.on('error', (e) => console.error(`Open ${origin} manually: ${e.message}`));
    child.unref();
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

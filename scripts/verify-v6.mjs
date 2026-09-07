// Full workflow tests in a separate, muted Edge profile. Never uses the real notebook.
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : { channel: 'msedge' }),
  args: ['--mute-audio'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } }),
  page = await context.newPage(),
  errors = [],
  requests = [],
  report = {};
await mkdir('verification/v6', { recursive: true });
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => requests.push(r.url()));
await page.addInitScript(() => {
  Math.random = () => 0.25;
  window.audioProbe = { active: 0, max: 0, starts: 0 };
  const original = AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createBufferSource = function (...args) {
    const source = original.apply(this, args),
      start = source.start.bind(source);
    source.start = (...values) => {
      window.audioProbe.active++;
      window.audioProbe.starts++;
      window.audioProbe.max = Math.max(window.audioProbe.max, window.audioProbe.active);
      source.addEventListener('ended', () => window.audioProbe.active--, { once: true });
      return start(...values);
    };
    return source;
  };
});
const old = {
  dataVersion: 2,
  shape: ['x', 3, 2, 0, 1, 0],
  capo: 2,
  preferFlats: false,
  keyRoot: 'C',
  scaleType: 'major',
  saved: [
    {
      id: 'kept',
      title: 'Capo 2 C shape',
      note: 'Sounds as D major.',
      shape: ['x', 3, 2, 0, 1, 0],
      capo: 2,
      preferFlats: false,
      createdAt: '2026-09-06',
    },
  ],
  tab: [{ shape: ['x', 3, 2, 0, 1, 0], capo: 2, beats: 1, strum: 'down' }],
  mapVisible: false,
  flipped: false,
  tempo: 90,
  labelsMode: 'notes',
  repeat: false,
  countIn: false,
  metronome: false,
  sound: 'acoustic',
};
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('guitar-learning-studio-v5')));
const shot = async (name) => page.screenshot({ path: `verification/v6/${name}.png` });
try {
  await page.goto('http://127.0.0.1:4173/');
  await page.evaluate((old) => localStorage.setItem('guitar-learning-studio-v2', JSON.stringify(old)), old);
  await page.reload();
  await page.locator('#library-cards .shape-card').first().waitFor();
  await page.locator('#labels-mode').selectOption('degrees');
  await page.locator('#undo').click();
  let state = await stored();
  assert.equal(state.saved[0].id, 'kept');
  assert.deepEqual(
    state.tab,
    old.tab.map((e) => ({ ...e, tuning: 'standard' })),
  );
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem('guitar-learning-studio-v2'))),
    old,
  );
  report.migration = 'v2 original retained; v5 draft and notebook intact';
  for (const view of ['shapes', 'family', 'triads', 'finder']) {
    await page.locator('#library-view').selectOption(view);
    await page.waitForTimeout(100);
    const size = await page.evaluate(() => ({
      page: document.documentElement.scrollHeight,
      width: document.documentElement.scrollWidth,
      visible: document.querySelector('#library-cards').clientHeight,
      content: document.querySelector('#library-cards').scrollHeight,
    }));
    assert.ok(size.page >= 720);
    assert.equal(size.width, 1280);
    assert.ok(size.content <= size.visible + 1, `${view} card clipping`);
    report[view] = size;
    await shot(`laptop-${view}`);
  }
  await page.locator('#finder-quality').selectOption('maj7');
  await page.locator('#finder-open').check();
  assert.ok(await page.locator('#library-cards .shape-card').count());
  await page.locator('#tool-sequence').click();
  await page.locator('#progressions-open').click();
  await page.locator('#progression-key').selectOption('G');
  await page.locator('#progression-capo').selectOption('0');
  await page.getByRole('button', { name: 'Use Four-chord flow', exact: true }).click();
  state = await stored();
  assert.equal(state.tab.length, 4);
  assert.deepEqual(
    state.tab.map((e) => e.capo),
    [0, 0, 0, 0],
  );
  assert.equal(state.songKey, 'G');
  assert.equal(state.songTitle, 'G · Four-chord flow');
  await page.locator('#song-title').fill('Guitar QA study');
  await page.locator('#song-title').blur();
  await page.locator('#rhythm').selectOption('folk');
  await page.locator('#save-song').click();
  state = await stored();
  const id = state.activeSongId;
  assert.ok(id);
  assert.equal(state.songs[0].rhythm, 'folk');
  assert.equal(await page.locator('#song-save-state').textContent(), 'Saved song');
  await shot('laptop-sequence');
  await page.getByRole('button', { name: 'Edit sequence step 2', exact: true }).click();
  await page.getByLabel('Beats for step 2', { exact: true }).selectOption('2');
  await page.getByLabel('Strum for step 2', { exact: true }).selectOption('up');
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await page.getByRole('button', { name: 'Move step 3 earlier', exact: true }).click();
  await page.locator('#step-close').click();
  assert.equal((await stored()).tab.length, 5);
  await page.locator('#save-song').click();
  assert.equal((await stored()).songs[0].id, id);
  await page.locator('#sequence-tools').click();
  await page.locator('#song-note').fill('Listen for smooth changes.');
  await page.locator('#song-note').blur();
  await page.locator('#song-save-copy').click();
  assert.equal((await stored()).songs.length, 2);
  await page.locator('#add-rest').click();
  assert.ok((await stored()).tab.at(-1).shape.every((f) => f === 'x'));
  await page.locator('#sequence-tools-close').click();
  await page.locator('#undo').click();
  assert.equal((await stored()).tab.length, 5);
  await page.locator('#songbook-open').click();
  await page.locator('#song-search').fill('missing song');
  assert.equal(await page.locator('.song-card').count(), 0);
  await page.locator('#song-search').fill('Guitar QA');
  assert.equal(await page.locator('.song-card').count(), 2);
  await shot('songbook');
  await page.locator('#songbook-close').click();
  await page.locator('#sequence-tools').click();
  const beforeTranspose = await stored();
  await page.locator('#transpose-up').click();
  assert.equal((await stored()).songKey, 'G#');
  await page.locator('#sequence-tools-close').click();
  await page.locator('#undo').click();
  assert.deepEqual((await stored()).tab, beforeTranspose.tab);
  await page.locator('#sequence-tools').click();
  await page.locator('#capo-lab-open').click();
  assert.ok(await page.locator('.capo-choice').count());
  await shot('capo-lab');
  await page.getByRole('button', { name: 'Use capo 2', exact: true }).click();
  assert.ok((await stored()).tab.every((e) => e.capo === 2));
  await page.locator('#undo').click();
  await page.locator('#tempo').fill('180');
  await page.locator('#tempo').blur();
  await page.locator('#repeat').check();
  await page.locator('#metronome').check();
  await page.locator('#stage-open').click();
  await shot('playing-view');
  const beforePlay = await stored();
  await page.locator('#stage-play').click();
  await page.waitForFunction(() => document.querySelector('#stage-position').textContent === 'Step 2 of 5');
  await shot('playing-active');
  assert.equal(await page.locator('#save-note').isDisabled(), true);
  assert.equal(await page.locator('#hear-chord').isDisabled(), true);
  await page.locator('#stage-stop').click();
  await page.waitForTimeout(120);
  assert.deepEqual(await stored(), beforePlay);
  assert.equal(await page.locator('#fretboard').getAttribute('inert'), null);
  assert.equal(await page.locator('#save-note').isDisabled(), false);
  await page.locator('#stage-next').click();
  await page.locator('#stage-close').click();
  report.audio = await page.evaluate(() => window.audioProbe);
  assert.ok(report.audio.starts > 10);
  assert.equal(report.audio.active, 0);
  assert.ok(report.audio.max <= 24);
  await page.locator('#studio-settings').click();
  await page.locator('#volume').fill('55');
  await page.locator('#tone').selectOption('warm');
  await page.locator('#settings-close').click();
  assert.equal((await stored()).volume, 55);
  assert.equal((await stored()).tone, 'warm');
  await page.locator('#sequence-tools').click();
  for (const [id, ext] of [
    ['export-midi', 'mid'],
    ['export-tab', 'txt'],
    ['export-wav', 'wav'],
  ]) {
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#' + id).click()]);
    assert.equal(await download.failure(), null);
    await download.saveAs(`verification/v6/exported-study.${ext}`);
  }
  const wav = await readFile('verification/v6/exported-study.wav');
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(24), 44100);
  report.wav = { bytes: wav.length, seconds: (wav.length - 44) / 2 / 44100 };
  assert.ok(report.wav.seconds > 3);
  await page.locator('#sequence-tools-close').click();
  await page.locator('#tool-practice').click();
  await shot('practice-home');
  await page.locator('#practice-find').click();
  await page.locator('#exercise-start').click();
  await shot('find-note');
  assert.equal(await page.locator('#exercise-board .string-row').first().locator('[data-fret]').count(), 6);
  const prompt = await page.locator('#exercise-prompt').textContent(),
    target = prompt.match(/^Find (\S+) on/)[1],
    pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[target],
    fret = Array.from({ length: 6 }, (_, i) => i).find((f) => (40 + f) % 12 === pc);
  await page.locator(`#exercise-board .question-string [data-fret="${fret}"]`).click();
  assert.ok((await page.locator('#exercise-feedback').textContent()).startsWith('Correct.'));
  await page.locator('#exercise-next').click();
  await page.locator('#exercise-reveal').click();
  assert.ok((await page.locator('#exercise-feedback').textContent()).includes('string'));
  await page.locator('#exercise-close').click();
  await page.locator('#practice-name').click();
  await page.locator('#exercise-start').click();
  const namePrompt = await page.locator('#exercise-prompt').textContent(),
    namedFret = Number(namePrompt.match(/fret (\d+)/)[1]),
    answer = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][(40 + namedFret) % 12];
  assert.equal(await page.locator('#exercise-board .note-dot').textContent(), '?');
  await page.getByRole('button', { name: answer, exact: true }).click();
  assert.equal(await page.locator('#exercise-board .note-dot').textContent(), answer);
  await page.locator('#exercise-close').click();
  await page.locator('#practice-ear').click();
  await page.locator('#exercise-start').click();
  await page.locator('#exercise-listen').click();
  await page.waitForFunction(
    () => document.querySelector('#status').textContent === 'Playing notes in order.',
  );
  await page.getByRole('button', { name: 'Major 3rd', exact: true }).click();
  assert.ok((await page.locator('#exercise-feedback').textContent()).includes('4 semitones'));
  await shot('ear-practice');
  for (let i = 1; i < 10; i++) {
    await page.locator('#exercise-next').click();
    await page.getByRole('button', { name: 'Major 3rd', exact: true }).click();
  }
  await page.locator('#exercise-next').click();
  assert.equal(await page.locator('#exercise-prompt').textContent(), '10 of 10 correct on the first try');
  await page.locator('#exercise-close').click();
  await page.locator('#tool-saved').click();
  await page.getByRole('button', { name: 'Edit saved Capo 2 C shape', exact: true }).click();
  await page.locator('#shape-title').fill('Preserved discovery');
  await page.locator('#save-note').click();
  assert.equal((await stored()).saved[0].id, 'kept');
  assert.deepEqual((await stored()).saved[0].shape, old.saved[0].shape);
  await page.locator('#undo').click();
  await page.locator('#recall-start').click();
  assert.equal(await page.locator('#recall-card h3').textContent(), 'What sounds here?');
  await page.locator('#recall-reveal').click();
  assert.ok((await page.locator('#recall-card').textContent()).includes('Capo 2 C shape'));
  await page.locator('#recall-known').click();
  assert.equal(await page.locator('#recall-progress').textContent(), 'Practice complete.');
  await page.locator('#recall-end').click();
  for (let i = 0; i < 5; i++)
    await page.getByRole('button', { name: 'Duplicate saved Capo 2 C shape', exact: true }).click();
  await page.locator('#study-sheet').click();
  await page.pdf({ path: 'verification/v6/study-sheet.pdf', format: 'A4', printBackground: true });
  await page.locator('#close-study').click();
  for (let i = 0; i < 5; i++) await page.locator('#undo').click();
  await page.locator('#export-data').click();
  const backup = JSON.parse(await page.locator('#backup-json').inputValue());
  assert.equal(backup.schemaVersion, 5);
  assert.equal(backup.data.songs.length, 2);
  assert.equal(backup.data.saved[0].id, 'kept');
  await page.locator('#merge-json').click();
  assert.ok((await page.locator('#backup-status').textContent()).includes('successfully'));
  await page.locator('#close-backup').click();
  await page.reload();
  await page.locator('#tool-sequence').click();
  assert.equal((await stored()).songs.length, 2);
  assert.equal((await stored()).saved[0].note, old.saved[0].note);
  for (const [width, height] of [
    [1920, 1080],
    [1024, 768],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    const metrics = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));
    assert.equal(metrics.width, width, `Page overflow at ${width}`);
    if (width > 1000) assert.ok(metrics.height >= height);
    report[`viewport${width}`] = metrics;
    await shot(`sequence-${width}`);
    if (width === 390) {
      await page.locator('#tool-practice').click();
      await shot('phone-practice');
    }
  }
  assert.deepEqual(errors, []);
  assert.ok(
    requests.every(
      (url) => url.startsWith('http://127.0.0.1:4173/') || url.startsWith('blob:http://127.0.0.1:4173/'),
    ),
  );
  report.errors = errors;
  report.localOnly = true;
  report.result = 'PASS';
} catch (e) {
  report.result = 'FAIL';
  report.error = e.stack;
  await shot('failure');
  throw e;
} finally {
  await writeFile('verification/v6/browser-results.json', JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}

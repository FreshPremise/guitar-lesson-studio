// Synthetic data in an isolated, muted browser. Never touches an existing browser profile.
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.env.GUITAR_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : { channel: 'msedge' }),
  args: ['--mute-audio'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage(),
  errors = [],
  requests = [],
  report = {};
const $ = (id) => page.locator('#' + id);
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('guitar-learning-studio-v5')));
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => requests.push(r.url()));
await mkdir('verification/v8', { recursive: true });
try {
  await page.goto(base);
  await page.locator('[data-focus="fret-0-0"]').click();
  const one = await stored();
  const ring = await page.locator('[data-focus="fret-0-0"] .note-dot').evaluate((e) => {
    const s = getComputedStyle(e);
    return { border: s.borderColor, outline: s.outlineColor, fill: s.backgroundColor };
  });
  assert.equal(ring.border, 'rgb(245, 43, 53)');
  assert.equal(ring.outline, ring.border);
  await page.locator('[data-focus="fret-1-2"]').click();
  const two = await stored();
  await $('undo').click();
  assert.deepEqual(await stored(), one);
  await $('redo').click();
  assert.deepEqual(await stored(), two);
  await page.keyboard.press('Control+z');
  assert.deepEqual(await stored(), one);
  await page.keyboard.press('Control+Shift+z');
  assert.deepEqual(await stored(), two);
  await $('undo').click();
  await page.locator('[data-focus="fret-2-2"]').click();
  assert.ok(await $('redo').isDisabled(), 'new edits invalidate the redo branch');
  const grip = (await stored()).shape;
  await $('capo-select').selectOption('2');
  await $('fret-range').selectOption('4-8');
  assert.deepEqual((await stored()).shape, grip);
  assert.equal(await page.locator('#fretboard .fret-position').count(), 30);
  assert.equal(await page.locator('#fretboard .capo-hardware').count(), 0, 'no fake capo at cropped edge');
  assert.match(await $('capo-readout').textContent(), /2 selected outside view/);
  assert.deepEqual(
    await page
      .locator('#fretboard .fret-labels > span')
      .evaluateAll((es) => es.map((e) => e.firstChild.textContent)),
    ['4', '5', '6', '7', '8'],
  );
  assert.equal(await page.locator('#fretboard .fret-position[tabindex="0"]').count(), 6);
  await page.locator('[data-focus="fret-0-4"]').focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.fret), '4');
  await page.keyboard.press('End');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.fret), '8');
  await $('fret-range').selectOption('0-4');
  const hardware = await page.locator('#fretboard .capo-hardware').boundingBox();
  const open = await page.locator('[data-focus="fret-0-0"]').boundingBox();
  assert.ok(hardware.x > open.x && hardware.x + hardware.width < open.x + open.width, 'capo is behind wire');
  await page.screenshot({ path: 'verification/v8/focused-neck.png' });
  await $('fret-range').selectOption('4-8');
  const beforeSound = await stored();
  await $('hear-chord').click();
  await page.waitForFunction(() => document.querySelector('#fretboard .sounding-note'));
  assert.equal(await page.locator('#fretboard .fret-position').count(), 78);
  assert.ok(await $('fret-range').isDisabled());
  assert.equal(
    await page
      .locator('#fretboard .sounding-note[aria-pressed="true"]')
      .first()
      .evaluate((e) => getComputedStyle(e, '::after').outlineColor),
    ring.border,
  );
  await $('stop-audio').click();
  assert.deepEqual(await stored(), beforeSound);
  assert.equal(await page.locator('#fretboard .fret-position').count(), 30);
  await $('add-tab').click();
  await $('tool-sequence').click();
  await $('tempo').fill('120');
  await $('tempo').press('Tab');
  await $('repeat').check();
  await $('studio-settings').click();
  await $('ramp-enabled').check();
  await $('ramp-increment').selectOption('5');
  await $('ramp-every').selectOption('1');
  await $('ramp-target').fill('130');
  await $('ramp-target').press('Tab');
  await page.screenshot({ path: 'verification/v8/settings.png' });
  await $('settings-close').click();
  const practiceState = await stored();
  await $('play-tab').click();
  await page.waitForFunction(() =>
    document.querySelector('#transport-position').textContent.includes('130 BPM'),
  );
  await $('pause-audio').click();
  const position = await $('transport-position').textContent();
  await page.waitForTimeout(150);
  assert.equal(await $('transport-position').textContent(), position);
  await $('pause-audio').click();
  await $('stop-audio').click();
  assert.deepEqual(await stored(), practiceState, 'practice must not rewrite saved tempo or grip');
  await $('play-tab').click();
  await page.waitForFunction(() =>
    document.querySelector('#transport-position').textContent.includes('120 BPM'),
  );
  await $('stop-audio').click();
  // The same ramp applies to repeated arpeggios, using their own starting tempo.
  if (await $('scale-menu').isVisible()) await $('scale-menu').click();
  await $('hear-path').click();
  await $('path-tempo').fill('120');
  await $('path-repeat').check();
  await $('path-arpeggio').click();
  await page.waitForFunction(() =>
    document.querySelector('#transport-position').textContent.includes('130 BPM'),
  );
  await $('stop-audio').click();
  assert.deepEqual(await stored(), practiceState);
  await $('studio-settings').click();
  assert.match(await $('last-backup').textContent(), /No confirmed backup/);
  await $('settings-backup').click();
  assert.ok(await $('confirm-backup').isDisabled());
  const downloaded = page.waitForEvent('download');
  await $('download-backup').click();
  const backup = JSON.parse(await readFile(await (await downloaded).path(), 'utf8'));
  assert.deepEqual(backup.data, practiceState);
  assert.equal(
    await page.evaluate(() => localStorage.getItem('guitar-lesson-studio-confirmed-backup')),
    null,
  );
  await $('confirm-backup').click();
  assert.ok(await $('confirm-backup').isDisabled());
  await $('close-backup').click();
  await page.reload();
  assert.deepEqual(await stored(), practiceState);
  assert.ok(await $('redo').isDisabled());
  await $('studio-settings').click();
  assert.match(await $('last-backup').textContent(), /Last confirmed backup:/);
  await $('ramp-target').fill('181');
  await $('ramp-target').press('Tab');
  assert.equal((await stored()).practiceRamp.target, 130);
  assert.equal(await $('ramp-target').inputValue(), '130');
  await $('settings-close').click();
  for (const [width, height] of [
    [1280, 720],
    [1024, 768],
    [1920, 1080],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await $('fret-range').selectOption('0-4');
    await page.waitForTimeout(150);
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      contentWidth: document.documentElement.scrollWidth,
      contentHeight: document.documentElement.scrollHeight,
    }));
    assert.ok(layout.contentWidth <= width, JSON.stringify(layout));
    if (width >= 1024) assert.ok(layout.contentHeight <= height, JSON.stringify(layout));
    report[`${width}x${height}`] = layout;
    await page.screenshot({ path: `verification/v8/layout-${width}.png`, fullPage: width < 1024 });
  }
  // Another tab's edit must still block history writes, including Redo.
  await page.setViewportSize({ width: 1280, height: 720 });
  await $('undo').click();
  const other = await context.newPage();
  await other.goto(base);
  await other.locator('#flip-neck').click();
  const otherData = await stored();
  await $('redo').click();
  assert.deepEqual(await stored(), otherData);
  assert.match(await $('status').textContent(), /Redo paused/);
  assert.deepEqual(errors, []);
  assert.ok(requests.every((u) => u.startsWith(new URL(base).origin + '/') || u.startsWith('blob:')));
  await writeFile(
    'verification/v8/results.json',
    JSON.stringify({ passed: true, ring, report, errors }, null, 2),
  );
  console.log(
    'PASS: red rings, zoom/capo/keyboard, Redo/conflicts, tempo ramps/Pause/restart, confirmed backups, responsive layouts',
  );
} finally {
  await browser.close();
}

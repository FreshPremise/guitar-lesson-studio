// Uses a new, muted browser context and synthetic music only.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const base = (process.env.GUITAR_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : { channel: 'msedge' }),
  args: ['--mute-audio'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } }),
  page = await context.newPage();
const errors = [],
  requests = [],
  report = {};
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => requests.push(r.url()));
const $ = (id) => page.locator('#' + id);
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('guitar-learning-studio-v5')));
await mkdir('verification/v7', { recursive: true });
await mkdir('docs', { recursive: true });
try {
  await page.goto(base);
  await $('tuning-select').selectOption('drop-d');
  assert.equal(await page.title(), 'Guitar Lesson Studio');
  assert.equal(await page.locator('footer a').count(), 0);
  assert.equal((await $('stop-audio').textContent()).trim(), 'Stop sound');
  assert.ok(await $('stop-audio').isDisabled());
  const labels = await page.locator('#fretboard .string-name').allTextContents();
  assert.deepEqual(labels, ['D', 'A', 'D', 'G', 'B', 'e']);
  const palette = await page.locator('#fretboard .fret-position').evaluateAll(es =>
    Array.from({length:12},(_,pc)=>getComputedStyle(es.find(e=>e.classList.contains('pitch-'+pc))).getPropertyValue('--note-color').trim()));
  assert.equal(new Set(palette).size,12);
  assert.ok(palette.every(c=>/^#[0-9a-f]{6}$/i.test(c)));
  const borders=await page.locator('.fretboard-panel,.analysis-card,.workspace').evaluateAll(es=>es.map(e=>({color:getComputedStyle(e).borderTopColor,style:getComputedStyle(e).borderTopStyle})));
  assert.ok(borders.every(b=>b.color==='rgb(0, 0, 0)' && b.style==='solid'));
  await page.locator('[data-focus="fret-0-0"]').click();
  assert.equal(await $('analysis-name').textContent(), 'D2');
  await $('add-tab').click();
  await $('tuning-select').selectOption('open-d');
  for (let i = 1; i < 6; i++) await page.locator(`[data-focus="fret-${i}-0"]`).click();
  assert.equal(await $('analysis-name').textContent(), 'D');
  const colors = await page
    .locator('#fretboard .fret-position[aria-pressed="true"] .note-dot')
    .evaluateAll((es) => es.map((e) => getComputedStyle(e).backgroundColor));
  assert.equal(new Set(colors).size, 3);
  await $('save-shape').click();
  await $('shape-title').fill('Open D study');
  await $('save-note').click();
  await $('add-tab').click();
  await $('tuning-select').selectOption('half-down');
  assert.deepEqual(
    (await stored()).tab.map((e) => e.tuning),
    ['drop-d', 'open-d'],
  );
  assert.equal((await stored()).saved[0].tuning, 'open-d');
  await page.getByRole('button', { name: 'Load saved Open D study', exact: true }).click();
  assert.equal(await $('tuning-select').inputValue(), 'open-d');
  await $('tool-library').click();
  for (const tuning of ['drop-d', 'dadgad', 'open-g', 'open-d', 'half-down', 'standard']) {
    await $('tuning-select').selectOption(tuning);
    for (const view of ['finder', 'family', 'triads']) {
      await $('library-view').selectOption(view);
      assert.ok(await page.locator('#library-cards .shape-card').count());
      await page.locator('#library-cards .shape-card').first().click();
      assert.equal((await stored()).tuning, tuning);
    }
  }
  await $('tuning-select').selectOption('dadgad');
  await $('tool-sequence').click();
  await $('progressions-open').click();
  await page.getByRole('button', { name: 'Use Four-chord flow', exact: true }).click();
  assert.ok((await stored()).tab.every((e) => e.tuning === 'dadgad'));
  // Exercise actual audio scheduling without speaker output; Stop must preserve data.
  const before = await stored();
  await $('play-tab').click();
  await page.waitForFunction(() => document.querySelector('.sounding-note'));
  await $('stop-audio').click();
  assert.deepEqual(await stored(), before);
  assert.equal(await page.locator('.sounding-note').count(), 0);
  await $('hear-path').click();
  assert.equal(await $('path-coverage').inputValue(),'six-strings');
  await $('path-range').selectOption('0,4');
  await $('path-tempo').fill('180');
  await page.evaluate(() => {
    window.seenScaleStrings = new Set();
    window.scaleObserver = new MutationObserver(() => {
      document.querySelectorAll('#fretboard .sounding-note').forEach(e => window.seenScaleStrings.add(e.closest('.string-row').dataset.string));
    });
    window.scaleObserver.observe(document.querySelector('#fretboard'), {subtree:true,attributes:true,attributeFilter:['class']});
  });
  await $('path-scale').click();
  await page.waitForFunction(() => document.querySelector('.sounding-note'));
  await page.waitForFunction(() => document.querySelector('#stop-audio').disabled);
  assert.equal(await page.evaluate(() => { window.scaleObserver.disconnect(); return window.seenScaleStrings.size; }),6);
  assert.deepEqual(await stored(), before);
  // Import text that looks like markup; it must stay text, without execution or requests.
  await $('tool-saved').click();
  await $('export-data').click();
  const backup = JSON.parse(await $('backup-json').inputValue());
  backup.data.saved[0].title = '<img src=x onerror=alert(1)>';
  backup.data.saved[0].id = 'synthetic-xss-check';
  await $('backup-json').fill(JSON.stringify(backup));
  await $('merge-json').click();
  await $('close-backup').click();
  assert.equal(await page.locator('#saved-list img').count(), 0);
  assert.ok((await page.locator('#panel-saved').textContent()).includes('<img src=x onerror=alert(1)>'));
  await $('undo').click();
  // Public README screenshot: create a separate synthetic composition, never a real notebook.
  await $('tuning-select').selectOption('standard');
  await $('tool-sequence').click();
  await $('progressions-open').click();
  await $('progression-key').selectOption('C');
  await page.getByRole('button', { name: 'Use Four-chord flow', exact: true }).click();
  await $('song-title').fill('Evening practice');
  await $('song-title').blur();
  await $('arrange-open').click();
  await $('section-to').fill('2');
  await $('section-name').fill('Verse');
  await $('section-repeats').selectOption('2');
  await $('section-apply').click();
  await $('arrange-close').click();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'docs/guitar-lesson-studio.png' });
  report.layouts = [];
  for (const [width, height] of [
    [1280, 720],
    [1024, 768],
    [1920, 1080],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `verification/v7/layout-${width}.png` });
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      header: document.querySelector('header').getBoundingClientRect().toJSON(),
    }));
    assert.ok(dimensions.width <= width, `page overflow at ${width}: ${dimensions.width}`);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    assert.ok(await page.locator('.workspace').evaluate((e) => e.getBoundingClientRect().bottom <= innerHeight + 1));
    await page.evaluate(() => window.scrollTo(0, 0));
    report.layouts.push({ width, height, ...dimensions });
  }
  assert.deepEqual(errors, []);
  assert.ok(requests.every((url) => url.startsWith(base + '/') || url.startsWith('blob:')));
  report.result =
    'PASS: tuning propagation, mixed tuning persistence, playback/Stop, colors, import escaping and responsive layouts';
  report.errors = errors;
  await writeFile('verification/v7/browser-report.json', JSON.stringify(report, null, 2));
  console.log(report.result);
} finally {
  await browser.close();
}

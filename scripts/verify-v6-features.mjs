import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
await mkdir('verification/v6', { recursive: true });
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : { channel: 'msedge' }),
  args: ['--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }),
  errors = [],
  report = {};
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  const Native = window.AudioContext;
  window.contexts = [];
  window.probe = { starts: 0, active: 0 };
  window.AudioContext = class extends Native {
    constructor(...args) {
      super(...args);
      window.contexts.push(this);
    }
    createBufferSource() {
      const source = super.createBufferSource(),
        start = source.start.bind(source);
      source.start = (...a) => {
        window.probe.starts++;
        window.probe.active++;
        source.addEventListener('ended', () => window.probe.active--, { once: true });
        return start(...a);
      };
      return source;
    }
  };
});
const $ = (id) => page.locator('#' + id),
  shot = (name) => page.screenshot({ path: `verification/v6/${name}.png` }),
  stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('guitar-learning-studio-v5')));
try {
  await page.goto('http://127.0.0.1:4173');
  await page.evaluate(() => document.fonts.ready);
  assert.equal(
    await $('sound')
      .locator('option')
      .allTextContents()
      .then((x) => x.join(',')),
    'Acoustic,Clean electric',
  );
  await $('guide-open').click();
  assert.equal(await $('guide-dialog').isVisible(), true);
  await shot('guide');
  await page.keyboard.press('Escape');
  assert.equal(await $('guide-open').evaluate((e) => e === document.activeElement), true);
  await $('studio-settings').click();
  assert.equal(await $('settings-dialog').locator('#spelling-select').count(), 1);
  await $('settings-close').click();
  await $('tool-sequence').click();
  await $('progressions-open').click();
  await page.getByRole('button', { name: 'Use Four-chord flow', exact: true }).click();
  await $('arrange-open').click();
  await $('section-from').fill('1');
  await $('section-to').fill('2');
  await $('section-name').fill('Verse');
  await $('section-repeats').selectOption('2');
  await $('section-apply').click();
  await $('section-from').fill('3');
  await $('section-to').fill('4');
  await $('section-name').fill('Chorus');
  await $('section-repeats').selectOption('1');
  await $('section-apply').click();
  assert.equal(await $('section-list').locator('article').count(), 2);
  await shot('arrange');
  await $('section-list')
    .locator('article')
    .first()
    .getByRole('button', { name: 'Copy', exact: true })
    .click();
  assert.equal((await stored()).tab.length, 6);
  await $('arrange-close').click();
  await $('undo').click();
  await $('arrange-open').click();
  await $('section-list')
    .locator('article')
    .last()
    .getByRole('button', { name: 'Earlier', exact: true })
    .click();
  assert.equal((await stored()).tab[0].section, 'Chorus');
  await $('arrange-close').click();
  await $('undo').click();
  await $('pattern-open').click();
  const pattern = ['D', 'u', '-', 'd', '-', 'u', 'D', '-'];
  for (let i = 0; i < 8; i++) await $('pattern-' + i).selectOption(pattern[i]);
  await shot('custom-pattern');
  await $('pattern-save').click();
  assert.deepEqual((await stored()).pattern, pattern);
  await page.getByRole('button', { name: 'Edit sequence step 2', exact: true }).click();
  await page.getByLabel('Step rhythm', { exact: true }).selectOption('arpeggio');
  assert.equal((await stored()).tab[1].rhythm, 'arpeggio');
  assert.ok(await page.getByRole('button', { name: /Use smoother grip/ }).count());
  await shot('step-options');
  await $('step-close').click();
  await $('song-title').fill('Sections and rhythm');
  await $('save-song').click();
  await page.reload();
  await $('tool-sequence').click();
  assert.deepEqual((await stored()).songs[0].pattern, pattern);
  assert.equal((await stored()).tab[0].sectionRepeats, 2);
  await $('sequence-tools').click();
  assert.equal(await $('tab-display').locator('table').count(), 1);
  await $('song-sheet').click();
  await page.pdf({ path: 'verification/v6/song-sheet.pdf', format: 'A4', printBackground: true });
  await $('close-study').click();
  await $('sequence-tools-close').click();
  await $('sound').selectOption('electric');
  await $('tempo').fill('180');
  await $('tempo').blur();
  await $('passage-open').click();
  await $('passage-from').fill('1');
  await $('passage-to').fill('2');
  await $('passage-enabled').check();
  await $('passage-apply').click();
  const before = await stored();
  await $('play-tab').click();
  await page.waitForFunction(() => document.querySelector('.sounding-note'));
  await shot('electric-highlight');
  await $('pause-audio').click();
  await page.waitForFunction(() => window.contexts.at(-1).state === 'suspended');
  const pausedTime = await page.evaluate(() => window.contexts.at(-1).currentTime);
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => window.contexts.at(-1).currentTime), pausedTime);
  assert.equal(await $('pause-audio').textContent(), 'Resume');
  await $('pause-audio').click();
  await page.waitForFunction(() => window.contexts.at(-1).state === 'running');
  await page.waitForTimeout(5800);
  assert.ok((await $('transport-position').textContent()).match(/Step [12]/));
  await $('stop-audio').click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.sounding-note').count(), 0);
  assert.deepEqual(await stored(), before);
  assert.equal(await page.evaluate(() => window.probe.active), 0);
  await $('hear-path').click();
  await $('path-range').selectOption('0,12');
  await $('path-repeat').check();
  await $('path-scale').click();
  await page.waitForFunction(() => document.querySelector('.sounding-note'));
  await shot('scale-playing');
  const active = await page.locator('#fretboard .sounding-note').first().getAttribute('data-focus');
  assert.match(active, /fret-\d-\d+/);
  await $('stop-audio').click();
  assert.deepEqual(await stored(), before);
  await $('hear-path').click();
  await $('path-arpeggio').click();
  await page.waitForFunction(() => document.querySelector('.sounding-note'));
  await $('stop-audio').click();
  report.sound = await page.evaluate(async () => {
    const { prepareSamples, sampledVoice } = await import('/src/samples.js');
    const c = new OfflineAudioContext(1, 44100, 44100);
    await prepareSamples(c, 'electric');
    const voices = [40, 60, 88].map((m) => sampledVoice(c, m, 'electric'));
    return voices.map((v) => ({
      duration: v.buffer.duration,
      rate: v.rate,
      peak: Math.max(...v.buffer.getChannelData(0).slice(0, 44100).map(Math.abs)),
    }));
  });
  assert.ok(report.sound.every((s) => s.duration > 0 && s.peak > 0 && s.rate > 0));
  await $('sequence-tools').click();
  const download = page.waitForEvent('download');
  await $('export-midi').click();
  await (await download).saveAs('verification/v6/arrangement-electric.mid');
  const wave = page.waitForEvent('download');
  await $('export-wav').click();
  await (await wave).saveAs('verification/v6/arrangement-electric.wav');
  await $('sequence-tools-close').click();
  await shot('composer-final');
  report.text = await page.evaluate(() =>
    [...document.querySelectorAll('body *')]
      .filter(
        (e) =>
          e.getClientRects().length &&
          [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) &&
          !(e instanceof SVGElement),
      )
      .map((e) => ({
        tag: e.tagName,
        font: getComputedStyle(e).fontFamily,
        size: parseFloat(getComputedStyle(e).fontSize),
      })),
  );
  assert.ok(report.text.every((t) => t.font.includes('Manrope')));
  assert.ok(report.text.every((t) => t.size >= 16));
  report.minimumText = Math.min(...report.text.map((t) => t.size));
  delete report.text;
  assert.deepEqual(errors, []);
  report.result = 'PASS';
} catch (e) {
  report.result = 'FAIL';
  report.error = e.stack;
  await shot('new-feature-failure');
  throw e;
} finally {
  report.errors = errors;
  await writeFile('verification/v6/new-feature-results.json', JSON.stringify(report, null, 2));
  console.log(report);
  await browser.close();
}

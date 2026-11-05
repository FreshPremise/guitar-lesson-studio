// Synthetic music in a fresh, headless, muted browser. No user profile or playback.
// PLAYWRIGHT_PATH may point to an existing Playwright installation.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { defaultState, STORAGE_KEY, MAX_TAB } from '../src/storage.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = (process.env.GUITAR_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const output = 'verification/chord-forms';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : { channel: 'msedge' }),
  args: ['--mute-audio'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const errors = [], requests = [], checks = [], layouts = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => requests.push(request.url()));
const $ = (id) => page.locator(`#${id}`);
const stored = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
const cShape = ['x', 3, 2, 0, 1, 0];
const grip = ({ shape, capo, tuning }) => ({ shape, capo, tuning });
const withMetadata = {
  shape: cShape, capo: 2, tuning: 'standard', beats: 4, strum: 'up',
  rhythm: 'hold', section: 'Synthetic verse', sectionStart: true, sectionRepeats: 2,
};
const fixture = (changes = {}) => ({ ...defaultState(), ...changes });
const seed = async (data) => {
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: STORAGE_KEY, value: data,
  });
  await page.reload();
  await $('tool-library').waitFor();
};
const cCard = () => page.locator('#library-cards .learning-card').filter({
  has: page.getByRole('button', { name: 'Add C major to sequence', exact: true }),
});
const openLibrary = async (expanded = true) => {
  await $('tool-library').click();
  await $('library-view').selectOption('shapes');
  await $('library-search').fill('C major');
  if (expanded && !(await $('workspace-dialog').evaluate((dialog) => dialog.open)))
    await $('workspace-expand').click();
  await cCard().waitFor();
};
const openForms = async () => {
  await cCard().getByRole('button', { name: 'Other shapes for C major', exact: true }).click();
  await $('chord-forms-dialog').waitFor({ state: 'visible' });
  assert.ok(await page.locator('#chord-forms-dialog .common-chord-form').count() > 1,
    'a familiar major chord has both its original grip and another common shape');
};
const alternate = () => page.locator('#chord-forms-dialog .common-chord-form').nth(1);
const modalAdd = () => alternate().getByRole('button', { name: /sequence/i });
const modalUse = () => alternate().getByRole('button', { name: /^Use / });
const closeForms = async () => {
  if (await $('chord-forms-dialog').evaluate((dialog) => dialog.open)) await page.keyboard.press('Escape');
};
const openStep = async () => {
  await $('tool-sequence').click();
  await page.getByRole('button', { name: 'Edit sequence step 1', exact: true }).click();
  await $('step-dialog').waitFor({ state: 'visible' });
};
const stepAlternate = () => page.locator('#step-dialog .common-chord-forms .voicing-choices button').first();
const assertExpanded = async () => {
  assert.equal(await $('workspace-dialog').evaluate((dialog) => dialog.open), true);
  assert.equal(await $('tool-library').getAttribute('aria-selected'), 'true');
};
const check = (name) => { checks.push(name); console.log(`PASS: ${name}`); };
const layout = async (name, dialogId) => {
  const metrics = await page.evaluate((id) => {
    const element = document.getElementById(id), box = element.getBoundingClientRect();
    return {
      width: innerWidth, height: innerHeight, pageWidth: document.documentElement.scrollWidth,
      dialogLeft: box.left, dialogRight: box.right, dialogWidth: element.clientWidth,
      dialogContentWidth: element.scrollWidth,
    };
  }, dialogId);
  assert.ok(metrics.pageWidth <= metrics.width, `${name}: page overflows ${JSON.stringify(metrics)}`);
  assert.ok(metrics.dialogLeft >= -1 && metrics.dialogRight <= metrics.width + 1,
    `${name}: dialog is outside the viewport ${JSON.stringify(metrics)}`);
  assert.ok(metrics.dialogContentWidth <= metrics.dialogWidth + 1,
    `${name}: dialog overflows horizontally ${JSON.stringify(metrics)}`);
  layouts.push({ name, ...metrics });
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: false });
};

await mkdir(output, { recursive: true });
try {
  await page.goto(base);
  await seed(fixture({ tuning: 'dadgad', capo: 2, shape: [0, 0, 0, 0, 0, 0] }));
  await openLibrary();
  const beforeAdd = await stored();
  await cCard().getByRole('button', { name: 'Add C major to sequence', exact: true }).click();
  const afterAdd = await stored();
  assert.equal(afterAdd.tab.length, 1);
  assert.deepEqual(afterAdd.tab[0], { shape: cShape, capo: 2, tuning: 'standard', beats: 1, strum: 'down' });
  assert.deepEqual(grip(afterAdd), grip(beforeAdd), 'direct add must not change the active neck');
  assert.match(await $('library-feedback').textContent(), /Added .*to sequence/);
  await assertExpanded();
  check('Expanded familiar-shape add preserves the neck and retains Standard tuning plus capo');

  await openForms();
  const beforeAlternate = await stored();
  await modalAdd().click();
  const afterAlternate = await stored();
  assert.equal(afterAlternate.tab.length, 2);
  assert.deepEqual(grip(afterAlternate), grip(beforeAlternate));
  assert.notDeepEqual(afterAlternate.tab[1].shape, cShape);
  assert.equal(afterAlternate.tab[1].tuning, 'standard');
  assert.equal(afterAlternate.tab[1].capo, 2);
  assert.match(await $('chord-forms-status').textContent(), /Added .*to sequence/);
  assert.equal(await $('chord-forms-dialog').evaluate((dialog) => dialog.open), true);
  await modalUse().click();
  const loaded = await stored();
  assert.deepEqual(grip(loaded), grip(afterAlternate.tab[1]));
  assert.equal(loaded.tab.length, 2, 'loading an alternate must not append another step');
  assert.equal(await modalUse().getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Control+z');
  assert.deepEqual(await stored(), afterAlternate);
  assert.equal(await modalUse().getAttribute('aria-pressed'), 'false');
  await page.keyboard.press('Control+Shift+z');
  assert.deepEqual(await stored(), loaded);
  assert.equal(await modalUse().getAttribute('aria-pressed'), 'true');
  await closeForms();
  assert.equal(await $('chord-forms-dialog').evaluate((dialog) => dialog.open), false,
    'Escape closes only the top chord-form dialog');
  await assertExpanded();
  check('Library alternate shapes can be appended and loaded while the Library stays expanded');
  check('Chord-form pressed state follows keyboard Undo/Redo and Escape preserves the expanded Library');

  await seed(fixture({ tuning: 'dadgad', capo: 3, shape: [0, 0, 0, 0, 0, 0], tab: [withMetadata] }));
  const beforeReplace = await stored();
  await openStep();
  assert.ok(await stepAlternate().isVisible(), 'the first sequence step must offer alternate chord shapes');
  await stepAlternate().click();
  const replaced = await stored();
  assert.notDeepEqual(replaced.tab[0].shape, withMetadata.shape);
  const { shape: originalShape, ...originalMetadata } = beforeReplace.tab[0];
  const { shape: replacementShape, ...replacementMetadata } = replaced.tab[0];
  assert.deepEqual(replacementMetadata, originalMetadata);
  assert.deepEqual(grip(replaced), grip(beforeReplace), 'a step replacement must not change the active neck');
  await $('step-close').click();
  await $('undo').click();
  assert.deepEqual(await stored(), beforeReplace);
  await $('redo').click();
  assert.deepEqual(await stored(), replaced);
  await page.reload();
  assert.deepEqual(await stored(), replaced);
  check('First-step alternatives retain metadata and support Undo, Redo, and reload persistence');

  for (const [width, height] of [[1280, 800], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await seed(fixture({ tab: [withMetadata] }));
    await openLibrary();
    await layout(`expanded-library-${width}`, 'workspace-dialog');
    await openForms();
    await layout(`library-forms-${width}`, 'chord-forms-dialog');
    await closeForms();
    await openStep();
    await layout(`sequence-forms-${width}`, 'step-dialog');
    await $('step-close').click();
    await $('workspace-expand').click();
  }
  check('Expanded Library and both chord-form dialogs fit desktop and 390px viewports');

  await page.setViewportSize({ width: 1280, height: 800 });
  await seed(fixture({ tab: Array.from({ length: MAX_TAB }, () => ({
    shape: cShape, capo: 0, tuning: 'standard', beats: 1, strum: 'down',
  })) }));
  await openLibrary();
  const atCapacity = await stored();
  await cCard().getByRole('button', { name: 'Add C major to sequence', exact: true }).click();
  assert.deepEqual(await stored(), atCapacity);
  assert.match(await $('status').textContent(), /limit|128/i);
  assert.match(await $('library-feedback').textContent(), /limit|128/i);
  await openForms();
  await modalAdd().click();
  assert.deepEqual(await stored(), atCapacity);
  assert.match(await $('status').textContent(), /limit|128/i);
  assert.match(await $('chord-forms-status').textContent(), /limit|128/i);
  await closeForms();
  check('Both Library add paths enforce the sequence limit without false success');

  for (const action of ['library-add', 'library-form-add', 'library-form-load', 'step-form']) {
    await seed(fixture({ tab: [withMetadata] }));
    if (action === 'step-form') await openStep();
    else {
      await openLibrary();
      if (action !== 'library-add') await openForms();
    }
    const other = await context.newPage();
    await other.goto(base);
    await other.locator('#flip-neck').click();
    const external = await stored();
    await page.waitForFunction(() => /another tab/i.test(document.getElementById('status').textContent));
    if (action === 'library-add')
      await cCard().getByRole('button', { name: 'Add C major to sequence', exact: true }).click();
    else if (action === 'library-form-add') await modalAdd().click();
    else if (action === 'library-form-load') await modalUse().click();
    else await stepAlternate().click();
    assert.deepEqual(await stored(), external, `${action} must not overwrite another tab's change`);
    assert.match(await $('status').textContent(), /paused|protect|another tab/i,
      `${action} must not falsely report success`);
    if (action.startsWith('library-form'))
      assert.match(await $('chord-forms-status').textContent(), /paused|protect|another tab/i);
    else if (action === 'library-add')
      assert.match(await $('library-feedback').textContent(), /paused|protect|another tab/i);
    await other.close();
  }
  check('Library add/load and step alternatives respect cross-tab storage conflicts');

  assert.deepEqual(errors, []);
  assert.ok(requests.every((url) => url.startsWith(`${new URL(base).origin}/`) || url.startsWith('blob:')),
    'verification must not request remote assets');
  await writeFile(`${output}/results.json`, JSON.stringify({ passed: true, checks, layouts, errors }, null, 2));
  console.log(`PASS: ${checks.length} chord-form regression groups; screenshots in ${output}`);
} catch (error) {
  await writeFile(`${output}/results.json`, JSON.stringify({
    passed: false, checks, layouts, errors, failure: error.stack,
  }, null, 2));
  await page.screenshot({ path: `${output}/failure.png`, fullPage: false }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}

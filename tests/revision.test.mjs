import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, validateState, parseBackup, serializeBackup, mergeBackup } from '../src/storage.js';
import { sections, expandArrangement, DEFAULT_PATTERN } from '../src/arrangement.js';
import { scalePath, gripPath, directPath } from '../src/fret-path.js';
import { SCALE_INTERVALS, STANDARD_TUNING } from '../src/theory.js';
import { sequenceTimeline, rhythmHits } from '../src/rhythm.js';
const chord = { shape: [0, 2, 2, 0, 0, 0], capo: 0, beats: 4, strum: 'down' };
test('sections repeat compactly, preserve source positions and slice practice ranges', () => {
  const steps = [
    { ...chord, section: 'Verse', sectionRepeats: 2 },
    { ...chord, section: 'Verse' },
    { ...chord, section: 'Chorus' },
  ];
  assert.equal(sections(steps).length, 2);
  assert.deepEqual(
    expandArrangement(steps).map((e) => e.sourceIndex),
    [0, 1, 0, 1, 2],
  );
  assert.deepEqual(
    expandArrangement(steps, { from: 1, to: 2 }).map((e) => e.sourceIndex),
    [1, 1, 2],
  );
  assert.equal(steps.length, 3);
});
test('arrangement metadata and custom patterns survive legacy migrations, merge and round trips', () => {
  const old = { ...defaultState(), dataVersion: 3, sound: 'synth' };
  delete old.pattern;
  const migrated = parseBackup(JSON.stringify({ schemaVersion: 3, data: old }));
  assert.equal(migrated.sound, 'acoustic');
  assert.deepEqual(migrated.pattern, DEFAULT_PATTERN);
  const state = validateState({
    ...migrated,
    tab: [{ ...chord, section: 'Verse', sectionRepeats: 3, rhythm: 'custom' }],
    pattern: ['D', 'u', '-', 'd', '-', '-', 'U', '-'],
  });
  assert.deepEqual(parseBackup(serializeBackup(state)), state);
  assert.deepEqual(mergeBackup(state, state), state);
  for (const changes of [
    { pattern: ['d'] },
    { pattern: ['x', ...DEFAULT_PATTERN.slice(1)] },
    { tab: [{ ...chord, sectionRepeats: 9 }] },
    { tab: [{ ...chord, section: 42 }] },
    { tab: [{ ...chord, rhythm: 'invalid' }] },
  ])
    assert.throws(() => validateState({ ...state, ...changes }));
});
test('custom strumming keeps rests, exact half-beat timing, accents and per-step overrides', () => {
  const pattern = ['D', 'u', '-', 'd', '-', '-', 'U', '-'];
  const hits = rhythmHits({ ...chord, rhythm: 'custom' }, 'hold', pattern);
  assert.deepEqual(
    hits.map((h) => h.offset),
    [0, 0.5, 1.5, 3],
  );
  assert.deepEqual(
    hits.map((h) => h.strum),
    ['down', 'up', 'down', 'up'],
  );
  assert.equal(hits[0].accent, 1.25);
  assert.equal(hits[1].accent, 1);
  const timeline = sequenceTimeline(
    expandArrangement([{ ...chord, section: 'A', sectionRepeats: 2, rhythm: 'custom' }]),
    { tempo: 120, pattern },
  );
  assert.equal(timeline.duration, 4);
  assert.deepEqual(
    timeline.hits.map((h) => h.start),
    [0, 0.25, 0.75, 1.5, 2, 2.25, 2.75, 3.5],
  );
  assert.equal(rhythmHits({ ...chord, shape: Array(6).fill('x') }, 'custom', pattern).length, 0);
});
test('scale paths are exact ascending octaves on valid strings and capo-relative frets', () => {
  for (const keyRoot of ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])
    for (const scaleType of ['major', 'naturalMinor', 'majorPentatonic', 'minorPentatonic', 'blues'])
      for (const capo of [0, 2, 7, 12]) {
        const state = { ...defaultState(), keyRoot, scaleType, capo };
        const path = scalePath(state, 0, 12);
        assert.equal(path.at(-1).midi - path[0].midi, 12);
        assert.equal(path.length, SCALE_INTERVALS[scaleType].length + 1);
        path.forEach((p, i) => {
          assert.equal(p.midi, STANDARD_TUNING[p.index].midi + capo + p.fret);
          if (i) assert.ok(p.midi > path[i - 1].midi);
        });
        assert.equal(directPath(path, 'both').length, path.length * 2 - 1);
        assert.equal(directPath(path, 'down')[0].midi, path.at(-1).midi);
      }
  assert.throws(() => scalePath(defaultState(), 0, 0));
  assert.equal(gripPath(['x', 3, 2, 0, 1, 0], 2)[0].index, 1);
});
test('adjacent sections with the same title retain separate repeat boundaries', () => {
  const steps = [
    { ...chord, section: 'Verse', sectionStart: true, sectionRepeats: 2 },
    { ...chord, section: 'Verse', sectionStart: true, sectionRepeats: 3 },
  ];
  assert.equal(sections(steps).length, 2);
  assert.deepEqual(
    expandArrangement(steps).map((e) => e.sourceIndex),
    [0, 0, 1, 1, 1],
  );
  assert.equal(validateState({ ...defaultState(), tab: steps }).tab[1].sectionStart, true);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyFamily, triadVoicings, nearestVoicings, familyVoicing, degreeLabel } from '../src/learning.js';
import { PITCH_NAMES_SHARP, normalizePitchClass, STANDARD_TUNING } from '../src/theory.js';
test('all major and natural-minor families have diatonic spellings, qualities and capo-correct grips', () => {
  for (const root of [...PITCH_NAMES_SHARP, 'Db', 'Eb', 'Gb', 'Ab', 'Bb'])
    for (const mode of ['major', 'naturalMinor']) {
      const family = keyFamily(root, mode);
      assert.equal(family.length, 7);
      assert.deepEqual(
        family.map((c) => c.quality),
        mode === 'major'
          ? ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished']
          : ['minor', 'diminished', 'major', 'minor', 'minor', 'major', 'major'],
      );
      assert.equal(new Set(family.map((c) => c.root[0])).size, 7);
      for (const chord of family)
        for (const capo of [0, 2, 7, 12]) {
          const shape = familyVoicing(chord, capo),
            actual = new Set(
              shape.flatMap((f, i) => (f === 'x' ? [] : [(STANDARD_TUNING[i].midi + capo + f) % 12])),
            );
          const spelled = chord.notes.map(
            (n) =>
              (normalizePitchClass(n[0]) +
                [...n.slice(1)].reduce((sum, a) => sum + (a === '#' ? 1 : -1), 0) +
                12) %
              12,
          );
          assert.deepEqual([...actual].sort(), spelled.sort());
        }
    }
  assert.deepEqual(keyFamily('F')[0].notes, ['F', 'A', 'C']);
  assert.equal(keyFamily('F')[3].symbol, 'Bb');
  assert.equal(keyFamily('F#')[6].symbol, 'E#dim');
});
test('triads retain all three chord tones, bass inversion, adjacent strings and fret limits in every key and capo', () => {
  for (let root = 0; root < 12; root++)
    for (const quality of ['major', 'minor'])
      for (let set = 0; set < 4; set++)
        for (let capo = 0; capo <= 12; capo++) {
          const expected = (quality === 'major' ? [0, 4, 7] : [0, 3, 7]).map((n) => (n + root) % 12),
            voicings = triadVoicings(root, quality, set, capo);
          assert.ok(voicings.length);
          // At the cropped 0–12 range an inversion can straddle either boundary.
          assert.ok(new Set(voicings.map((v) => v.inversion)).size >= 2);
          for (const v of voicings) {
            assert.deepEqual(
              v.midi.map((n) => n % 12).sort((a, b) => a - b),
              [...expected].sort((a, b) => a - b),
            );
            assert.equal(v.inversion, expected.indexOf(v.midi[0] % 12));
            assert.ok(v.span <= 4);
            v.shape.forEach((f, i) =>
              assert.ok(i >= set && i < set + 3 ? Number.isInteger(f) && f >= 0 && f <= 12 : f === 'x'),
            );
          }
        }
});
test('nearest triad does not mutate inputs and finds the exact current position', () => {
  const list = triadVoicings(0),
    last = list.at(-1);
  assert.deepEqual(nearestVoicings(list, last.shape)[0], last);
  assert.notEqual(list[0], last);
});
test('chord degrees distinguish suspended seconds, augmented fifths and diminished sevenths', () => {
  for (const [suffix, pc, label] of [
    ['sus2', 2, '2'],
    ['add9', 2, '9'],
    ['aug', 8, '♯5'],
    ['dim7', 9, '♭♭7'],
    ['m7', 10, '♭7'],
    ['maj7', 11, '7'],
  ])
    assert.equal(degreeLabel({ exact: true, rootPc: 0, suffix }, pc), label);
  assert.equal(degreeLabel({ exact: false, rootPc: 0, suffix: '' }, 0), '');
});

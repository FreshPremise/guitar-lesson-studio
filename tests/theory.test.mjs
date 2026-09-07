import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { resolve } from 'node:path';

// The project keeps the source as a browser ES module without requiring a
// package-level Node setting. Import it as a data module for this test file.
const sourcePath = resolve('src/theory.js');
const theory = await import(`${pathToFileURL(sourcePath).href}?test=${Date.now()}`);

test('open C shape resolves to C major notes and expected frequencies', () => {
  const result = theory.analyzeSelection(['x', 3, 2, 0, 1, 0]);
  assert.deepEqual(result.pitchClasses, ['C', 'E', 'G']);
  assert.equal(result.chords[0].symbol, 'C');
  assert.equal(result.notes[1].note, 'C3');
  assert.ok(Math.abs(result.notes[1].frequency - 130.8128) < 0.01);
});

test('C shape at capo 2 sounds D major', () => {
  const result = theory.analyzeSelection(['x', 3, 2, 0, 1, 0], { capo: 2 });
  assert.equal(result.chords[0].symbol, 'D');
  assert.equal(result.notes[1].note, 'D3');
  assert.deepEqual(result.pitchClasses, ['D', 'F#', 'A']);
});

test('dyad keeps direction and octave information', () => {
  const fifth = theory.identifyDyad(['C3', 'G3']);
  assert.equal(fifth.direction, 'ascending');
  assert.equal(fifth.shortName, 'P5');
  assert.equal(fifth.semitones, 7);

  const fourth = theory.identifyDyad(['G3', 'C4']);
  assert.equal(fourth.direction, 'ascending');
  assert.equal(fourth.shortName, 'P4');
  assert.equal(fourth.semitones, 5);
});

test('selection derives lowest pitch and dyad direction from MIDI order', () => {
  // Deliberately provide the upper voice first, as can happen when notes are
  // selected in a UI. Display order remains intact while musical order is C3
  // then G3.
  const result = theory.analyzeSelection(['G3', 'C3']);
  assert.equal(result.notes[0].note, 'G3');
  assert.equal(result.lowest.note, 'C3');
  assert.equal(result.dyad.direction, 'ascending');
  assert.deepEqual(result.dyad.midi, [48, 55]);
});

test('an exact octave is named P8 cleanly', () => {
  const octave = theory.identifyDyad(['C3', 'C4']);
  assert.equal(octave.shortName, 'P8');
  assert.equal(octave.quality, 'octave');
  assert.equal(octave.name, 'octave');
});

test('A minor triad is identified from a compact guitar voicing', () => {
  const result = theory.analyzeSelection(['x', 0, 2, 2, 1, 0]);
  assert.equal(result.chords[0].symbol, 'Am');
  assert.deepEqual(result.pitchClasses, ['A', 'E', 'C']);
});

test('scale helpers return expected major, minor pentatonic, and blues notes', () => {
  assert.deepEqual(theory.scaleNotes('C', 'major'), ['C', 'D', 'E', 'F', 'G', 'A', 'B']);
  assert.deepEqual(theory.scaleNotes('A', 'minorPentatonic'), ['A', 'C', 'D', 'E', 'G']);
  assert.deepEqual(theory.scaleNotes('E', 'blues'), ['E', 'G', 'A', 'A#', 'B', 'D']);
});

test('shape transposition and flat spelling are deterministic', () => {
  assert.deepEqual(theory.transposeShape(['x', 0, 2, 2, 1, 0], 2), ['x', 2, 4, 4, 3, 2]);
  assert.equal(theory.pitchName(1, { preferFlats: true }), 'Db');
  assert.equal(theory.midiToFrequency(69), 440);
});

test('common acoustic shapes have the expected best match, including omitted fifths', () => {
  const cases = [
    [['x', 0, 2, 0, 2, 0], 'A7'],
    [['x', 2, 1, 2, 0, 2], 'B7'],
    [['x', 3, 2, 3, 1, 0], 'C7(no5)'],
    [['x', 'x', 0, 2, 1, 2], 'D7'],
    [[0, 2, 0, 1, 0, 0], 'E7'],
    [[3, 2, 0, 0, 0, 1], 'G7'],
    [['x', 3, 2, 0, 0, 0], 'Cmaj7'],
    [['x', 0, 2, 0, 1, 0], 'Am7'],
    [['x', 'x', 0, 2, 1, 1], 'Dm7'],
    [['x', 3, 2, 0, 3, 3], 'Cadd9'],
    [['x', 'x', 0, 2, 3, 0], 'Dsus2'],
    [['x', 'x', 0, 2, 3, 3], 'Dsus4'],
    [['x', 0, 2, 2, 0, 0], 'Asus2'],
    [['x', 0, 2, 2, 3, 0], 'Asus4'],
    [['x', 0, 2, 2, 2, 2], 'A6'],
    [['x', 0, 2, 2, 1, 2], 'Am6'],
    [[2, 'x', 0, 2, 3, 2], 'D/F#'],
    [[3, 3, 2, 0, 1, 0], 'C/G'],
    [[0, 2, 2, 'x', 'x', 'x'], 'E5'],
    [['x', 2, 3, 2, 3, 'x'], 'Bm7b5'],
    [['x', 2, 3, 1, 3, 'x'], 'Bdim7'],
    [[0, 2, 0, 1, 0, 2], 'E9'],
    [['x', 0, 5, 5, 0, 0], 'Am9'],
  ];
  for (const [shape, symbol] of cases) {
    const result = theory.analyzeSelection(shape);
    assert.equal(result.chords[0].symbol, symbol, JSON.stringify(shape));
    assert.equal(result.chords[0].exact, true);
  }
});
test('unrecognized notes never become an empty selection or an asserted exact chord', () => {
  const r = theory.analyzeSelection([0, 0, 0, 1, 2, 1]);
  assert.equal(r.summary, '6 notes');
  assert.ok(!r.chords[0]?.exact);
  assert.equal(theory.analyzeSelection(['x', 'x', 'x', 'x', 'x', 0]).summary, 'E4');
});
test('enharmonic octave boundaries and multiple octaves are correct', () => {
  assert.equal(theory.noteToMidi('B#3'), 60);
  assert.equal(theory.noteToMidi('Cb4'), 59);
  assert.equal(theory.identifyDyad(['C3', 'C5']).name, '2 octaves');
});
test('all exact chord matches transpose correctly through all capo positions', () => {
  for (let capo = 0; capo <= 12; capo++) {
    const r = theory.analyzeSelection(['x', 0, 2, 0, 1, 0], { capo });
    assert.equal(r.chords[0].rootPc, (9 + capo) % 12);
    assert.equal(r.chords[0].suffix, 'm7');
    assert.equal(r.chords[0].exact, true);
  }
});

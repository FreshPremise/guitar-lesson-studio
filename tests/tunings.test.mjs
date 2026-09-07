import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNINGS, tuningStrings } from '../src/tunings.js';
import { analyzeSelection, stringStateToMidi } from '../src/theory.js';
import { findVoicings, revoiceEvent } from '../src/voicings.js';
import { keyFamily, familyVoicing, triadVoicings } from '../src/learning.js';
import { buildProgression, eventName } from '../src/songs.js';
import { defaultState, validateState, parseBackup, serializeBackup } from '../src/storage.js';
import { gripPath, scalePath, directPath } from '../src/fret-path.js';
import { pitches } from '../src/audio-engine.js';
import { sampleMapping } from '../src/samples.js';
import { encodeMidi, sequenceText } from '../src/exports.js';
import { expandArrangement } from '../src/arrangement.js';

test('six-string scales cover every string and selected scale position in either direction', () => {
  for (const { id: tuning } of TUNINGS) for (const scaleType of ['major','naturalMinor','majorPentatonic','minorPentatonic','blues']) {
    const state={...defaultState(),tuning,scaleType,keyRoot:'D',capo:3};
    for (const [min,max] of [[0,4],[4,8],[8,12],[0,12]]) {
      const path=scalePath(state,min,max,'six-strings');
      assert.deepEqual([...new Set(path.map(p=>p.index))],[0,1,2,3,4,5]);
      assert.ok(path.every(p=>p.fret>=min && p.fret<=max));
      assert.equal(new Set(path.map(p=>`${p.index}:${p.fret}`)).size,path.length);
      assert.deepEqual(directPath(path,'down',true),[...path].reverse());
      const both=directPath(path,'both',true);
      assert.equal(both.length,path.length*2-1);
      assert.deepEqual(both[0],both.at(-1));
    }
  }
  assert.throws(()=>scalePath(defaultState(),8,4,'six-strings'));
});
test('new orientation defaults to treble at bottom once and retains subsequent Flip choices', () => {
  const old={...defaultState(),flipped:false}; delete old.orientationVersion;
  const migrated=validateState(old);
  assert.equal(migrated.flipped,true);
  assert.equal(migrated.orientationVersion,1);
  assert.equal(validateState({...migrated,flipped:false}).flipped,false);
  assert.equal(parseBackup(serializeBackup({...migrated,flipped:false})).flipped,false);
});

test('alternate open strings have known pitches and chords, including capo', () => {
  assert.deepEqual(pitches([0, 0, 0, 0, 0, 0], 0, 'dadgad'), [38, 45, 50, 55, 57, 62]);
  assert.equal(eventName({ shape: [0, 0, 0, 0, 0, 0], capo: 0, tuning: 'open-d' }), 'D');
  assert.equal(eventName({ shape: [0, 0, 0, 0, 0, 0], capo: 0, tuning: 'open-g' }), 'G/D');
  assert.equal(stringStateToMidi(0, 0, 2, 'drop-d'), 40);
  assert.equal(stringStateToMidi(5, 12, 12, 'standard'), 88);
  assert.throws(() => tuningStrings('unknown'));
});
test('every tuning supports correct generated chords, families, triads and progression pitches', () => {
  for (const { id: tuning } of TUNINGS) {
    for (const root of ['C', 'F#', 'Bb']) {
      for (const type of ['', 'm', '7', 'maj7']) {
        const options = findVoicings(root, type, { tuning, capo: 2, limit: 4 });
        assert.ok(options.length, `${tuning} ${root}${type}`);
        for (const v of options)
          assert.ok(
            analyzeSelection(v.shape, { capo: 2, tuning }).chords.some((c) => c.exact && c.suffix === type),
          );
      }
    }
    for (const c of keyFamily('C'))
      assert.ok(
        analyzeSelection(familyVoicing(c, 0, tuning), { tuning }).chords.some(
          (m) => m.exact && m.rootPc === c.rootPc && m.quality === c.quality,
        ),
      );
    const triads = triadVoicings(2, 'minor', 3, 0, tuning);
    assert.ok(triads.length);
    for (const t of triads)
      assert.deepEqual(
        [...new Set(t.midi.map((n) => n % 12))].sort((a, b) => a - b),
        [2, 5, 9],
      );
    const built = buildProgression('pop', 'C', 0, tuning);
    assert.deepEqual(
      built.steps.map((e) => eventName(e)),
      ['C', 'G', 'Am', 'F'],
    );
    for (const e of built.steps) assert.equal(e.tuning, tuning);
    const shifted = revoiceEvent(built.steps[0], 2, 1);
    assert.equal(eventName(shifted), 'C#');
    assert.equal(shifted.tuning, tuning);
  }
});
test('paths and both sample banks cover every tuning, capo and displayed fret', () => {
  for (const { id: tuning } of TUNINGS) {
    for (const capo of [0, 12])
      for (const fret of [0, 12]) {
        const path = gripPath(Array(6).fill(fret), capo, tuning);
        assert.deepEqual(
          path.map((p) => p.midi),
          pitches(Array(6).fill(fret), capo, tuning),
        );
        for (const p of path)
          for (const bank of ['acoustic', 'electric']) assert.ok(sampleMapping(p.midi, bank));
      }
    const path = scalePath({ ...defaultState(), tuning, keyRoot: 'D' }, 0, 12);
    assert.equal(path.at(-1).midi - path[0].midi, 12);
    for (const p of path) assert.equal(p.midi, stringStateToMidi(p.index, p.fret, 0, tuning));
  }
});
test('schema 5 preserves mixed tunings and rejects invalid tuning without changing old data', () => {
  const old = { ...defaultState(), dataVersion: 4, tab: [{ shape: [0, 0, 0, 0, 0, 0], capo: 0, beats: 4 }] };
  delete old.tuning;
  const before = JSON.stringify(old),
    migrated = parseBackup(JSON.stringify({ schemaVersion: 4, data: old }));
  assert.equal(JSON.stringify(old), before);
  assert.equal(migrated.tuning, 'standard');
  assert.equal(migrated.tab[0].tuning, 'standard');
  const mixed = validateState({
    ...migrated,
    tuning: 'drop-d',
    tab: [...migrated.tab, { shape: [0, 0, 0, 0, 0, 0], capo: 0, tuning: 'open-d', beats: 4 }],
  });
  assert.deepEqual(parseBackup(serializeBackup(mixed)), mixed);
  assert.throws(() => validateState({ ...mixed, tuning: null }));
  assert.throws(() => validateState({ ...mixed, tab: [{ ...mixed.tab[0], tuning: 'bad' }] }));
});
test('MIDI uses low D and text tab preserves tuning changes and expanded repeats', () => {
  const event = { shape: [0, 'x', 'x', 'x', 'x', 'x'], capo: 0, tuning: 'drop-d', beats: 4, strum: 'down' };
  const bytes = encodeMidi([event]);
  assert.ok(bytes.some((b, i) => b === 0x90 && bytes[i + 1] === 38));
  const expanded = expandArrangement([
    { ...event, section: 'Verse', sectionStart: true, sectionRepeats: 2 },
    { ...event, tuning: 'standard', section: 'Chorus', sectionStart: true },
  ]);
  const tab = sequenceText(expanded);
  assert.ok(tab.includes('Drop D: D2 A2 D3 G3 B3 E4'));
  assert.ok(tab.includes('Standard: E2 A2 D3 G3 B3 E4'));
  assert.ok(tab.includes('Step     1    2'));
  assert.ok(tab.includes('Step     3'));
});

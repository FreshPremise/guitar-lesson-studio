import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findVoicings, CHORD_TYPES, revoiceEvent, capoSuggestions, commonChordForms } from '../src/voicings.js';
import { STANDARD_TUNING, analyzeSelection } from '../src/theory.js';
import { tuningStrings } from '../src/tunings.js';
import { buildProgression, PROGRESSIONS } from '../src/songs.js';
import { RHYTHMS, rhythmHits, sequenceTimeline } from '../src/rhythm.js';
import { practiceDeck, checkPractice } from '../src/practice.js';
import {
  defaultState,
  validateState,
  serializeBackup,
  parseBackup,
  mergeBackup,
  MAX_BACKUP_BYTES,
  MAX_SONGS,
} from '../src/storage.js';
import { encodeWav, encodeMidi, sequenceText } from '../src/exports.js';
const event = { shape: ['x', 3, 2, 0, 1, 0], capo: 2, beats: 4, strum: 'down' };
test('common chord forms offer familiar open, barre and triad shapes without changing the source event', () => {
  const c = { ...event, capo: 0, tuning: 'standard', rhythm: 'folk', section: 'Verse', sectionRepeats: 2 },
    before = structuredClone(c),
    forms = commonChordForms(c),
    signatures = forms.map((form) => form.shape.join(','));
  assert.ok(signatures.includes('x,3,5,5,5,3'), 'familiar C A-shape barre');
  assert.ok(signatures.includes('8,10,10,9,8,8'), 'familiar C E-shape barre');
  assert.ok(signatures.includes('x,x,x,5,5,3'), 'compact C triad');
  assert.ok(!signatures.includes(c.shape.join(',')));
  assert.equal(new Set(signatures).size, forms.length);
  assert.deepEqual(c, before);
  const g = commonChordForms({ shape: [3, 2, 0, 0, 0, 3] });
  assert.deepEqual(g[0].shape, [3, 2, 0, 0, 3, 3], 'alternate four-finger open G appears first');
  forms[0].shape[0] = 99;
  assert.ok(commonChordForms(c).every((form) => !form.shape.includes(99)), 'results are independent');
  assert.equal(commonChordForms(c, { limit: 1 }).length, 1);
});
test('common forms support C7 with or without its fifth and keep the other chord tones', () => {
  const open = { shape: ['x', 3, 2, 3, 1, 0], capo: 0, tuning: 'standard' },
    barre = { ...open, shape: ['x', 3, 5, 3, 5, 3] },
    alternatives = commonChordForms(open);
  assert.ok(alternatives.some((form) => form.shape.join(',') === barre.shape.join(',')));
  const openAgain = commonChordForms(barre).find((form) => form.shape.join(',') === open.shape.join(','));
  assert.ok(openAgain);
  assert.equal(openAgain.omittedFifth, true);
  assert.match(openAgain.source, /no fifth/);
  for (const form of alternatives) {
    const analysis = analyzeSelection(form.shape);
    assert.ok(analysis.pitchClasses.includes('C'));
    assert.ok(analysis.pitchClasses.includes('E'));
    assert.ok(analysis.pitchClasses.includes('A#'));
    assert.ok(analysis.pitchClasses.every((pc) => ['C', 'E', 'G', 'A#'].includes(pc)));
    assert.equal(analysis.lowest.midi % 12, 0);
  }
});
test('common forms preserve slash bass and do not reinterpret an inverted minor triad as a sixth chord', () => {
  for (const [shape, bass, pcs] of [
    [[3, 3, 2, 0, 1, 0], 7, ['C', 'E', 'G']],
    [[2, 'x', 0, 2, 3, 2], 6, ['A', 'D', 'F#']],
    [['x', 'x', 'x', 5, 5, 5], 0, ['A', 'C', 'E']],
  ]) {
    const forms = commonChordForms({ shape, capo: 0, tuning: 'standard' });
    assert.ok(forms.length);
    for (const form of forms) {
      const actual = analyzeSelection(form.shape);
      assert.equal(actual.lowest.midi % 12, bass);
      assert.deepEqual([...actual.pitchClasses].sort(), pcs);
    }
  }
});
test('common forms honor capo, tuning and the physical neck boundary', () => {
  const source = ['x', 3, 2, 0, 1, 0];
  for (const tuning of ['standard', 'half-down', 'drop-d'])
    for (const capo of [0, 2, 7, 12]) {
      const base = analyzeSelection(source, { tuning, capo }),
        forms = commonChordForms({ shape: source, capo, tuning });
      assert.ok(forms.length, `${tuning} capo ${capo}`);
      for (const form of forms) {
        const actual = analyzeSelection(form.shape, { tuning, capo });
        assert.equal(form.tuning, tuning);
        assert.equal(form.capo, capo);
        assert.equal(actual.lowest.midi % 12, base.lowest.midi % 12);
        assert.deepEqual([...actual.pitchClasses].sort(), [...base.pitchClasses].sort());
        assert.ok(form.shape.every((f) => f === 'x' || (f >= 0 && f + capo <= 24)));
        if (tuning === 'drop-d' && form.shape[0] !== 'x')
          assert.match(form.source, /^Drop D /, 'the lowered sixth string uses its own curated form');
      }
    }
  for (const tuning of ['open-d', 'open-g']) {
    const shape = [0, 0, 0, 0, 0, 0],
      expected = analyzeSelection(shape, { tuning }),
      forms = commonChordForms({ shape, tuning });
    assert.ok(forms.length);
    for (const form of forms) {
      const actual = analyzeSelection(form.shape, { tuning });
      assert.deepEqual([...actual.pitchClasses].sort(), [...expected.pitchClasses].sort());
      assert.equal(actual.lowest.midi % 12, expected.lowest.midi % 12);
    }
  }
});
test('common forms cover rooted major and minor triads throughout the pitch range without invented grips', () => {
  for (const tuning of ['standard', 'half-down'])
    for (const capo of [0, 5, 12])
      for (let fret = 0; fret < 12; fret++)
        for (const third of [0, 1]) {
          if (fret + 2 + capo > 24) continue;
          const shape = [fret, fret + 2, fret + 2, fret + third, fret, fret],
            root = (tuningStrings(tuning)[0].midi + capo + fret) % 12,
            target = [root, (root + (third ? 4 : 3)) % 12, (root + 7) % 12].sort((a, b) => a - b),
            forms = commonChordForms({ shape, capo, tuning });
          assert.ok(forms.length, `${tuning}, capo ${capo}, root ${root}, third ${third}`);
          for (const form of forms) {
            const actual = analyzeSelection(form.shape, { capo, tuning });
            assert.deepEqual([...new Set(actual.notes.filter((n) => n.midi !== null).map((n) => n.midi % 12))].sort((a, b) => a - b), target);
            assert.equal(actual.lowest.midi % 12, root);
            assert.ok(!form.source.includes('Compact voicing'), 'no unconstrained search results');
          }
        }
});
test('common forms return no choices for rests, single notes, unknown grips or unsupported tuning families', () => {
  for (const candidate of [
    { shape: ['x', 'x', 'x', 'x', 'x', 'x'] },
    { shape: [0, 'x', 'x', 'x', 'x', 'x'] },
    { shape: [0, 1, 2, 3, 4, 5] },
    { shape: [0, 0, 0, 0, 0, 0], tuning: 'dadgad' },
  ]) assert.deepEqual(commonChordForms(candidate), []);
});
test('chord finder covers every requested quality, root and tested capo with exact pitch sets', () => {
  for (const type of CHORD_TYPES)
    for (let root = 0; root < 12; root++)
      for (const capo of [0, 2, 7, 12]) {
        const voices = findVoicings(root, type.id, { capo, limit: 10 }),
          target = type.intervals.map((n) => (n + root) % 12).sort((a, b) => a - b);
        assert.ok(voices.length, `${root}${type.id} capo ${capo}`);
        for (const voice of voices) {
          const pcs = [
            ...new Set(
              voice.shape.flatMap((f, i) => (f === 'x' ? [] : [(STANDARD_TUNING[i].midi + capo + f) % 12])),
            ),
          ].sort((a, b) => a - b);
          assert.deepEqual(pcs, target);
          assert.ok(voice.shape.every((f) => f === 'x' || (f >= 0 && f <= 12)));
        }
      }
});
test('finder preserves cache isolation and open-grip filtering', () => {
  const first = findVoicings('C', '', { openOnly: true });
  assert.ok(first.length);
  for (const v of first) {
    assert.ok(v.shape.includes(0));
    assert.ok(Math.max(...v.shape.filter(Number.isInteger)) <= 4);
  }
  first[0].shape[0] = 99;
  assert.notEqual(findVoicings('C', '', { openOnly: true })[0].shape[0], 99);
});
test('capo suggestions retain exact harmony and bass class; transposition changes all classes equally', () => {
  const result = analyzeSelection(event.shape, { capo: event.capo });
  for (const suggestion of capoSuggestions([event])) {
    const changed = analyzeSelection(suggestion.steps[0].shape, { capo: suggestion.capo });
    assert.deepEqual([...changed.pitchClasses].sort(), [...result.pitchClasses].sort());
    assert.equal(changed.lowest.midi % 12, result.lowest.midi % 12);
    assert.equal(suggestion.steps[0].beats, 4);
  }
  const up = revoiceEvent(event, 2, 1),
    changed = analyzeSelection(up.shape, { capo: 2 });
  assert.deepEqual(
    changed.notes
      .filter((n) => n.midi !== null)
      .map((n) => n.midi % 12)
      .filter((n, i, a) => a.indexOf(n) === i)
      .sort((a, b) => a - b),
    [3, 7, 10],
  );
});
test('preset progressions preserve their declared functions and have useful complete grips', () => {
  for (const preset of PROGRESSIONS)
    for (const key of ['C', 'G', 'D', 'F', 'Bb', 'F#'])
      for (const capo of [0, 2, 7]) {
        const song = buildProgression(preset.id, key, capo);
        assert.equal(song.steps.length, preset.degrees.length);
        assert.ok(song.steps.every((e) => e.beats === 4 && e.capo === capo));
        for (const e of song.steps)
          assert.ok(analyzeSelection(e.shape, { capo }).chords.some((c) => c.exact));
      }
  assert.deepEqual(buildProgression('pop', 'G').steps[3].shape, ['x', 3, 2, 0, 1, 0]);
});
test('rhythms fit each step, and export and playback share the same gate model', () => {
  for (const beats of [1, 2, 4])
    for (const rhythm of RHYTHMS) {
      const hits = rhythmHits({ ...event, beats }, rhythm.id);
      assert.ok(hits.length);
      for (let i = 0; i < hits.length; i++) {
        assert.ok(hits[i].offset >= 0 && hits[i].gate > 0);
        assert.equal(hits[i].offset + hits[i].gate, hits[i + 1]?.offset ?? beats);
      }
    }
  assert.deepEqual(
    rhythmHits(event, 'folk').map((h) => h.offset),
    [0, 1, 1.5, 2.5, 3, 3.5],
  );
  assert.equal(sequenceTimeline([event, event], { tempo: 120, rhythm: 'eighths' }).duration, 4);
});
test('practice decks stay in range, accept equivalent fret locations, and keep the answer deterministic', () => {
  for (const mode of ['find', 'name', 'ear']) {
    const deck = practiceDeck(mode, { random: () => 0.25 });
    assert.equal(deck.length, 10);
    for (const q of deck) {
      assert.ok(checkPractice(q, mode === 'find' ? q.fret : q.answer));
      assert.equal(checkPractice(q, mode === 'find' ? -1 : 'wrong'), false);
      if (mode !== 'ear') assert.ok(q.fret <= 5);
    }
  }
  const q = { mode: 'find', string: 0, pc: 4, maxFret: 12 };
  assert.ok(checkPractice(q, 0));
  assert.ok(checkPractice(q, 12));
  assert.equal(checkPractice(q, 1), false);
});
test('songs, working draft, audio preferences and old records survive version 4 round trips and merges', () => {
  const state = {
    ...defaultState(),
    tab: [event],
    songTitle: 'Current study',
    songNote: 'Practice slowly',
    songKey: 'D',
    rhythm: 'folk',
    volume: 42,
    tone: 'warm',
    songs: [
      {
        id: 'song-one',
        title: 'Kept song',
        note: 'Retain this',
        key: 'D',
        mode: 'major',
        steps: [event],
        tempo: 80,
        rhythm: 'arpeggio',
        createdAt: '2026',
        updatedAt: '2026',
      },
    ],
    activeSongId: 'song-one',
  };
  assert.deepEqual(parseBackup(serializeBackup(state)), validateState(state));
  assert.deepEqual(mergeBackup(state, parseBackup(serializeBackup(state))), validateState(state));
  const incoming = structuredClone(state);
  incoming.songs[0].note = 'Conflicting note';
  const merged = mergeBackup(state, incoming);
  assert.equal(merged.songs.length, 2);
  assert.notEqual(merged.songs[1].id, state.songs[0].id);
  assert.equal(merged.songs[0].note, 'Retain this');
  for (const mutate of [
    (s) => (s.songs[0].steps[0].beats = 8),
    (s) => (s.activeSongId = 'missing'),
    (s) => (s.volume = 101),
    (s) => (s.songs[0].rhythm = 'bad'),
    (s) => s.songs.push({ ...s.songs[0] }),
  ]) {
    const invalid = structuredClone(state);
    mutate(invalid);
    assert.throws(() => validateState(invalid));
  }
  const maximum = {
    ...state,
    songs: Array.from({ length: MAX_SONGS }, (_, i) => ({
      ...state.songs[0],
      id: 'song' + i,
      steps: Array.from({ length: 128 }, () => ({ ...event })),
    })),
    activeSongId: null,
  };
  assert.ok(new TextEncoder().encode(serializeBackup(maximum)).length < MAX_BACKUP_BYTES);
});
test('WAV has valid PCM headers, exact length and peak protection', () => {
  const samples = new Float32Array([0, -2, 2, 0.1, 0]),
    encoded = encodeWav({ sampleRate: 44100, getChannelData: () => samples }),
    view = new DataView(encoded);
  assert.equal(new TextDecoder().decode(new Uint8Array(encoded, 0, 4)), 'RIFF');
  assert.equal(view.getUint32(24, true), 44100);
  assert.equal(view.getUint32(40, true), 10);
  assert.equal(encoded.byteLength, 54);
  assert.ok(view.getInt16(46, true) > -32768);
  assert.ok(view.getInt16(48, true) < 32767);
});
test('MIDI header, tempo, note-on/off counts and total duration parse independently', () => {
  const bytes = encodeMidi([event, { ...event, shape: ['x', 'x', 'x', 'x', 'x', 'x'], beats: 2 }], {
      tempo: 120,
      title: 'D study',
      rhythm: 'hold',
    }),
    view = new DataView(bytes.buffer);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'MThd');
  assert.equal(view.getUint16(8), 0);
  assert.equal(view.getUint16(10), 1);
  assert.equal(view.getUint16(12), 480);
  let i = 22,
    tick = 0,
    on = 0,
    off = 0;
  const pitches = [];
  const vl = () => {
    let n = 0,
      b;
    do {
      b = bytes[i++];
      n = n * 128 + (b & 127);
    } while (b & 128);
    return n;
  };
  while (i < bytes.length) {
    tick += vl();
    const status = bytes[i++];
    if (status === 255) {
      const kind = bytes[i++],
        length = vl();
      if (kind === 0x51) assert.equal(bytes[i] * 65536 + bytes[i + 1] * 256 + bytes[i + 2], 500000);
      i += length;
    } else if ((status & 240) === 192) {
      assert.equal(bytes[i++], 25);
    } else {
      const pitch = bytes[i++];
      i++;
      if ((status & 240) === 144) {
        on++;
        pitches.push(pitch);
      } else if ((status & 240) === 128) off++;
      else assert.fail('Unexpected MIDI event');
    }
  }
  assert.equal(tick, 6 * 480);
  assert.equal(on, 5);
  assert.equal(off, 5);
  assert.deepEqual(pitches, [50, 54, 57, 62, 66]);
  assert.ok(sequenceText([event], { title: 'My study' }).includes('Capo     2'));
});

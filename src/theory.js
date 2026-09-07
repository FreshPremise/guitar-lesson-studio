/**
 * Small, deterministic guitar-theory engine for the browser prototype.
 *
 * The module intentionally has no external dependencies, network access, dynamic code,
 * or mutable global state. String states use guitar order (low E to high E):
 * "x" means muted, 0 means open relative to the capo, and a positive number
 * is a fret relative to the capo.
 */
import { tuningStrings } from './tunings.js';
export const STANDARD_TUNING = Object.freeze([
  Object.freeze({ string: 6, name: 'E2', midi: 40 }),
  Object.freeze({ string: 5, name: 'A2', midi: 45 }),
  Object.freeze({ string: 4, name: 'D3', midi: 50 }),
  Object.freeze({ string: 3, name: 'G3', midi: 55 }),
  Object.freeze({ string: 2, name: 'B3', midi: 59 }),
  Object.freeze({ string: 1, name: 'E4', midi: 64 }),
]);
export const PITCH_NAMES_SHARP = Object.freeze([
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
]);
export const PITCH_NAMES_FLAT = Object.freeze([
  'C',
  'Db',
  'D',
  'Eb',
  'E',
  'F',
  'Gb',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
]);
export const SCALE_INTERVALS = Object.freeze({
  major: Object.freeze([0, 2, 4, 5, 7, 9, 11]),
  naturalMinor: Object.freeze([0, 2, 3, 5, 7, 8, 10]),
  minor: Object.freeze([0, 2, 3, 5, 7, 8, 10]),
  majorPentatonic: Object.freeze([0, 2, 4, 7, 9]),
  minorPentatonic: Object.freeze([0, 3, 5, 7, 10]),
  blues: Object.freeze([0, 3, 5, 6, 7, 10]),
});
const NOTE_TO_PC = Object.freeze({
  C: 0,
  'B#': 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  'E#': 5,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11,
});
const CHORD_TEMPLATES = Object.freeze([
  { quality: 'major', suffix: '', intervals: [0, 4, 7], priority: 30 },
  { quality: 'minor', suffix: 'm', intervals: [0, 3, 7], priority: 30 },
  { quality: 'diminished', suffix: 'dim', intervals: [0, 3, 6], priority: 20 },
  { quality: 'augmented', suffix: 'aug', intervals: [0, 4, 8], priority: 20 },
  { quality: 'suspended 2', suffix: 'sus2', intervals: [0, 2, 7], priority: 25 },
  { quality: 'suspended 4', suffix: 'sus4', intervals: [0, 5, 7], priority: 25 },
  { quality: 'power', suffix: '5', intervals: [0, 7], priority: 10 },
  { quality: 'dominant seventh', suffix: '7', intervals: [0, 4, 7, 10], priority: 40 },
  { quality: 'major seventh', suffix: 'maj7', intervals: [0, 4, 7, 11], priority: 40 },
  { quality: 'minor seventh', suffix: 'm7', intervals: [0, 3, 7, 10], priority: 40 },
  { quality: 'sixth', suffix: '6', intervals: [0, 4, 7, 9], priority: 35 },
  { quality: 'add nine', suffix: 'add9', intervals: [0, 2, 4, 7], priority: 35 },
  { quality: 'minor sixth', suffix: 'm6', intervals: [0, 3, 7, 9], priority: 35 },
  { quality: 'minor add nine', suffix: 'madd9', intervals: [0, 2, 3, 7], priority: 35 },
  { quality: 'diminished seventh', suffix: 'dim7', intervals: [0, 3, 6, 9], priority: 40 },
  { quality: 'half-diminished seventh', suffix: 'm7b5', intervals: [0, 3, 6, 10], priority: 40 },
  { quality: 'minor major seventh', suffix: 'm(maj7)', intervals: [0, 3, 7, 11], priority: 40 },
  { quality: 'seventh suspended fourth', suffix: '7sus4', intervals: [0, 5, 7, 10], priority: 40 },
  { quality: 'dominant ninth', suffix: '9', intervals: [0, 2, 4, 7, 10], priority: 42 },
  { quality: 'major ninth', suffix: 'maj9', intervals: [0, 2, 4, 7, 11], priority: 42 },
  { quality: 'minor ninth', suffix: 'm9', intervals: [0, 2, 3, 7, 10], priority: 42 },
  { quality: 'six nine', suffix: '6/9', intervals: [0, 2, 4, 7, 9], priority: 38 },
]);
const INTERVAL_NAMES = Object.freeze({
  0: { number: 1, quality: 'unison', short: 'P1' },
  1: { number: 2, quality: 'minor second', short: 'm2' },
  2: { number: 2, quality: 'major second', short: 'M2' },
  3: { number: 3, quality: 'minor third', short: 'm3' },
  4: { number: 3, quality: 'major third', short: 'M3' },
  5: { number: 4, quality: 'perfect fourth', short: 'P4' },
  6: { number: 4, quality: 'tritone', short: 'TT' },
  7: { number: 5, quality: 'perfect fifth', short: 'P5' },
  8: { number: 6, quality: 'minor sixth', short: 'm6' },
  9: { number: 6, quality: 'major sixth', short: 'M6' },
  10: { number: 7, quality: 'minor seventh', short: 'm7' },
  11: { number: 7, quality: 'major seventh', short: 'M7' },
  12: { number: 8, quality: 'octave', short: 'P8' },
});
const asInteger = (value, label) => {
  const number = Number(value);
  if (!Number.isInteger(number)) throw new TypeError(`${label} must be an integer`);
  return number;
};
/** Convert a pitch class, note name, or MIDI number into 0..11. */
export function normalizePitchClass(value) {
  if (typeof value === 'number') return ((asInteger(value, 'pitch class') % 12) + 12) % 12;
  if (typeof value !== 'string') throw new TypeError('pitch class must be a number or note name');
  const normalized = value.trim().replace('♯', '#').replace('♭', 'b');
  const match = normalized.match(/^([A-Ga-g](?:#|b)?)(?:-?\d+)?$/);
  if (!match) throw new RangeError(`Invalid note name: ${value}`);
  const pc = NOTE_TO_PC[match[1][0].toUpperCase() + match[1].slice(1)];
  if (pc === undefined) throw new RangeError(`Unsupported accidental: ${value}`);
  return pc;
}
/** Name a pitch class using either sharps (default) or flats. */
export function pitchName(pitchClass, { preferFlats = false } = {}) {
  return (preferFlats ? PITCH_NAMES_FLAT : PITCH_NAMES_SHARP)[normalizePitchClass(pitchClass)];
}
/** Parse a note such as C#4, or a MIDI number, into a MIDI note number. */
export function noteToMidi(note) {
  if (typeof note === 'number') return asInteger(note, 'MIDI note');
  if (typeof note !== 'string') throw new TypeError('note must be a MIDI number or note name');
  const match = note
    .trim()
    .replace('♯', '#')
    .replace('♭', 'b')
    .match(/^([A-Ga-g](?:#|b)?)(-?\d+)$/);
  if (!match) throw new RangeError(`A note with an octave is required: ${note}`);
  const letter = match[1][0].toUpperCase();
  const accidental = match[1].slice(1);
  return (
    (asInteger(match[2], 'octave') + 1) * 12 +
    NOTE_TO_PC[letter] +
    (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0)
  );
}
/** Convert MIDI to a note name, retaining its octave. */
export function midiToNote(midi, { preferFlats = false } = {}) {
  const value = asInteger(midi, 'MIDI note');
  return `${pitchName(value, { preferFlats })}${Math.floor(value / 12) - 1}`;
}
/** Convert MIDI to frequency using equal temperament (A4 = 440 Hz by default). */
export function midiToFrequency(midi, referenceA4 = 440) {
  const value = Number(midi);
  const reference = Number(referenceA4);
  if (!Number.isFinite(value) || !Number.isFinite(reference) || reference <= 0) {
    throw new RangeError('MIDI and reference frequency must be finite; reference must be positive');
  }
  return reference * 2 ** ((value - 69) / 12);
}
/** Return the MIDI note for a string (0 = low E) and fret relative to a capo. */
export function stringStateToMidi(stringIndex, state, capo = 0, tuning = 'standard') {
  const index = asInteger(stringIndex, 'string index');
  const capoFret = asInteger(capo, 'capo');
  if (index < 0 || index >= STANDARD_TUNING.length) throw new RangeError('string index must be 0..5');
  if (state === 'x' || state === 'X' || state === null || state === undefined) return null;
  const fret = asInteger(state, 'fret');
  if (fret < 0) throw new RangeError('fret cannot be negative');
  if (capoFret < 0) throw new RangeError('capo cannot be negative');
  return tuningStrings(tuning)[index].midi + capoFret + fret;
}
/** Resolve six string states to playable notes and frequencies. */
export function statesToNotes(
  states,
  capo = 0,
  { preferFlats = false, referenceA4 = 440, tuning = 'standard' } = {},
) {
  if (!Array.isArray(states) || states.length !== 6) throw new RangeError('six string states are required');
  return states.map((state, index) => {
    const midi = stringStateToMidi(index, state, capo, tuning);
    return Object.freeze({
      string: STANDARD_TUNING[index].string,
      stringIndex: index,
      state: state === 'X' ? 'x' : state,
      midi,
      note: midi === null ? null : midiToNote(midi, { preferFlats }),
      frequency: midi === null ? null : midiToFrequency(midi, referenceA4),
    });
  });
}
function toMidiList(notes) {
  if (!Array.isArray(notes)) throw new TypeError('notes must be an array');
  return notes.map((value) => {
    if (value && typeof value === 'object' && 'midi' in value) return noteToMidi(value.midi);
    return noteToMidi(value);
  });
}
/** Identify the directed, octave-aware interval between two notes. */
export function identifyDyad(notes) {
  const midi = toMidiList(notes);
  if (midi.length !== 2) throw new RangeError('a dyad requires exactly two notes');
  const distance = midi[1] - midi[0];
  const ascendingSemitones = Math.abs(distance);
  const withinOctave = ascendingSemitones % 12;
  // An exact octave is P8, not a unison with an octave annotation. For
  // compound intervals with a non-zero remainder, retain the simple interval
  // class and expose the extra octave count below.
  const descriptor =
    ascendingSemitones > 0 && withinOctave === 0 ? INTERVAL_NAMES[12] : INTERVAL_NAMES[withinOctave];
  return Object.freeze({
    notes: Object.freeze(midi.map((value) => midiToNote(value))),
    midi: Object.freeze(midi),
    semitones: ascendingSemitones,
    direction: distance > 0 ? 'ascending' : distance < 0 ? 'descending' : 'unison',
    octaves: Math.floor(ascendingSemitones / 12),
    intervalClass: withinOctave,
    number: descriptor.number,
    quality: descriptor.quality,
    shortName: descriptor.short,
    name:
      ascendingSemitones > 12 && withinOctave === 0
        ? `${ascendingSemitones / 12} octaves`
        : `${descriptor.quality}${ascendingSemitones >= 12 && withinOctave !== 0 ? ` + ${Math.floor(ascendingSemitones / 12)} octave${Math.floor(ascendingSemitones / 12) === 1 ? '' : 's'}` : ''}`,
  });
}
function compareCandidates(a, b) {
  return (
    b.matchScore - a.matchScore ||
    b.coverage - a.coverage ||
    a.extra.length - b.extra.length ||
    a.rootPc - b.rootPc
  );
}
// Guitar seventh/ninth voicings commonly omit the perfect fifth. Name that
// omission explicitly, and require every remaining tone including the root.
const VOICING_TEMPLATES = CHORD_TEMPLATES.flatMap((template) => [
  template,
  ...(template.intervals.length >= 4 && template.intervals.includes(7)
    ? [
        {
          ...template,
          quality: `${template.quality} (no fifth)`,
          suffix: `${template.suffix}(no5)`,
          intervals: template.intervals.filter((n) => n !== 7),
          priority: template.priority - 5,
        },
      ]
    : []),
]);
/**
 * Find common chord interpretations for a set of notes. Exact matches are
 * returned first; when no exact match exists, useful partial candidates are
 * returned with explicit missing/extra tones. The lowest sounding note is
 * used for slash-chord naming.
 */
export function identifyChord(notes, { preferFlats = false, includePartial = true, maxCandidates = 8 } = {}) {
  const midi = toMidiList(notes);
  if (midi.length === 0) return [];
  const pcs = [...new Set(midi.map((value) => ((value % 12) + 12) % 12))];
  const bassPc = ((Math.min(...midi) % 12) + 12) % 12;
  const candidates = [];
  for (let rootPc = 0; rootPc < 12; rootPc += 1) {
    for (const template of VOICING_TEMPLATES) {
      const expected = new Set(template.intervals.map((interval) => (rootPc + interval) % 12));
      const present = pcs.filter((pc) => expected.has(pc));
      const missing = [...expected].filter((pc) => !pcs.includes(pc));
      const extra = pcs.filter((pc) => !expected.has(pc));
      const exact = missing.length === 0 && extra.length === 0;
      const coverage = present.length / expected.size;
      const matchScore =
        (exact ? 1000 : 0) +
        coverage * 100 +
        template.priority +
        (bassPc === rootPc ? 15 : 0) -
        extra.length * 20 -
        missing.length * 4;
      if (!exact && (!includePartial || coverage < 0.66 || extra.length > 1)) continue;
      const root = pitchName(rootPc, { preferFlats });
      const bass = pitchName(bassPc, { preferFlats });
      candidates.push({
        root,
        rootPc,
        quality: template.quality,
        suffix: template.suffix,
        symbol: `${root}${template.suffix}${bassPc === rootPc ? '' : `/${bass}`}`,
        bass,
        bassPc,
        exact,
        coverage,
        matchScore,
        present: present.map((pc) => pitchName(pc, { preferFlats })),
        missing: missing.map((pc) => pitchName(pc, { preferFlats })),
        extra: extra.map((pc) => pitchName(pc, { preferFlats })),
        inversion: bassPc === rootPc ? 'root position' : 'inversion/slash voicing',
      });
    }
  }
  return candidates.sort(compareCandidates).slice(0, Math.max(1, maxCandidates));
}
function looksLikeStates(values) {
  return (
    Array.isArray(values) &&
    values.length === 6 &&
    values.every(
      (value) =>
        value === 'x' ||
        value === 'X' ||
        value === null ||
        value === undefined ||
        (typeof value === 'number' && Number.isInteger(value)),
    )
  );
}
/** Analyze either six guitar string states or an array of notes. */
export function analyzeSelection(
  selection,
  { capo = 0, preferFlats = false, referenceA4 = 440, tuning = 'standard' } = {},
) {
  const fromStrings = looksLikeStates(selection);
  const resolved = fromStrings
    ? statesToNotes(selection, capo, { preferFlats, referenceA4, tuning })
    : toMidiList(selection).map((midi) =>
        Object.freeze({
          string: null,
          stringIndex: null,
          state: null,
          midi,
          note: midiToNote(midi, { preferFlats }),
          frequency: midiToFrequency(midi, referenceA4),
        }),
      );
  const sounding = resolved.filter((note) => note.midi !== null);
  const midi = sounding.map((note) => note.midi);
  // Keep `notes` in string order for the fretboard, but use pitch order for
  // musical lowest-note and interval interpretation. This matters when a
  // caller supplies crossed voices or a selected note sequence.
  const pitchOrdered = [...sounding].sort((a, b) => a.midi - b.midi);
  const chords = identifyChord(midi, { preferFlats });
  return Object.freeze({
    capo,
    states: fromStrings ? Object.freeze([...selection].map((state) => (state === 'X' ? 'x' : state))) : null,
    notes: Object.freeze(resolved),
    pitchClasses: Object.freeze(
      [...new Set(midi.map((value) => value % 12))].map((pc) => pitchName(pc, { preferFlats })),
    ),
    chords: Object.freeze(chords),
    dyad: midi.length === 2 ? identifyDyad(pitchOrdered.map((note) => note.midi)) : null,
    lowest: pitchOrdered[0] ?? null,
    summary:
      midi.length === 0
        ? 'No notes selected'
        : midi.length === 1
          ? sounding[0].note
          : midi.length === 2
            ? identifyDyad(pitchOrdered.map((note) => note.midi)).name
            : chords[0]?.exact
              ? chords[0].symbol
              : `${midi.length} notes`,
  });
}
/** Return named scale notes beginning on root. */
export function scaleNotes(root, scale = 'major', { preferFlats = false } = {}) {
  const intervals = SCALE_INTERVALS[scale];
  if (!intervals) throw new RangeError(`Unknown scale: ${scale}`);
  const rootPc = normalizePitchClass(root);
  return intervals.map((interval) => pitchName(rootPc + interval, { preferFlats }));
}
export const getScaleNotes = scaleNotes;
/** Transpose a six-string shape by fret semitones, preserving muted strings. */
export function transposeShape(shape, semitones, { clampAtZero = false } = {}) {
  const amount = asInteger(semitones, 'transpose amount');
  const input = Array.isArray(shape) ? shape : shape?.states;
  if (!looksLikeStates(input)) throw new RangeError('shape must contain six integer string states');
  const states = input.map((state) => {
    if (state === 'x' || state === 'X' || state === null || state === undefined) return 'x';
    const fret = state + amount;
    if (fret < 0 && !clampAtZero) throw new RangeError('transposed shape would use a negative fret');
    return Math.max(0, fret);
  });
  if (Array.isArray(shape)) return states;
  return { ...shape, states };
}
export const transposeFingering = transposeShape;

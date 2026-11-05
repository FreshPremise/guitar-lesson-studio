import { tuningStrings } from './tunings.js';
import { STANDARD_TUNING, normalizePitchClass, analyzeSelection } from './theory.js';
import { guitarLibrary } from './library.js';
export const CHORD_TYPES = Object.freeze([
  { id: '', title: 'Major', intervals: [0, 4, 7] },
  { id: 'm', title: 'Minor', intervals: [0, 3, 7] },
  { id: '7', title: 'Dominant 7', intervals: [0, 4, 7, 10] },
  { id: 'maj7', title: 'Major 7', intervals: [0, 4, 7, 11] },
  { id: 'm7', title: 'Minor 7', intervals: [0, 3, 7, 10] },
  { id: 'sus2', title: 'Suspended 2', intervals: [0, 2, 7] },
  { id: 'sus4', title: 'Suspended 4', intervals: [0, 5, 7] },
  { id: 'add9', title: 'Add 9', intervals: [0, 2, 4, 7] },
  { id: '6', title: 'Sixth', intervals: [0, 4, 7, 9] },
  { id: 'm6', title: 'Minor sixth', intervals: [0, 3, 7, 9] },
  { id: 'dim', title: 'Diminished', intervals: [0, 3, 6] },
  { id: 'm7b5', title: 'Half-diminished', intervals: [0, 3, 6, 10] },
  { id: 'aug', title: 'Augmented', intervals: [0, 4, 8] },
  { id: 'dim7', title: 'Diminished 7', intervals: [0, 3, 6, 9] },
  { id: '9', title: 'Dominant 9', intervals: [0, 2, 4, 7, 10] },
]);
const cache = new Map(),
  mod = (n) => ((n % 12) + 12) % 12;
export function gripCost(shape) {
  const frets = shape.filter((f) => Number.isInteger(f) && f > 0),
    active = shape.filter(Number.isInteger),
    span = frets.length ? Math.max(...frets) - Math.min(...frets) : 0;
  return (
    Math.max(...frets, 0) * 0.65 +
    span * 1.6 +
    new Set(frets).size * 0.5 +
    (6 - active.length) * 0.6 -
    active.filter((f) => f === 0).length * 0.45
  );
}
// These are familiar movable guitar forms, not arbitrary combinations of chord
// tones. Zero is the barre position, so muted strings stay muted when moved.
const COMMON_MOVABLE_FORMS = [
  { source: 'E-shape barre', shape: [0, 2, 2, 1, 0, 0] },
  { source: 'E-shape minor barre', shape: [0, 2, 2, 0, 0, 0] },
  { source: 'E-shape seventh barre', shape: [0, 2, 0, 1, 0, 0] },
  { source: 'E-shape minor seventh barre', shape: [0, 2, 0, 0, 0, 0] },
  { source: 'E-shape suspended barre', shape: [0, 2, 2, 2, 0, 0] },
  { source: 'Sixth-string major seventh form', shape: [0, 'x', 1, 1, 0, 'x'] },
  { source: 'Sixth-string sixth form', shape: [0, 2, 2, 1, 2, 0] },
  { source: 'Sixth-string minor sixth form', shape: [0, 2, 2, 0, 2, 0] },
  { source: 'Sixth-string augmented form', shape: [0, 'x', 2, 1, 1, 'x'] },
  { source: 'Sixth-string half-diminished form', shape: [0, 'x', 0, 0, -1, 'x'] },
  { source: 'Sixth-string diminished seventh form', shape: [0, 'x', -1, 0, -1, 'x'] },
  { source: 'Sixth-string power chord', shape: [0, 2, 2, 'x', 'x', 'x'] },
  { source: 'A-shape barre', shape: ['x', 0, 2, 2, 2, 0] },
  { source: 'A-shape minor barre', shape: ['x', 0, 2, 2, 1, 0] },
  { source: 'A-shape seventh barre', shape: ['x', 0, 2, 0, 2, 0] },
  { source: 'A-shape major seventh barre', shape: ['x', 0, 2, 1, 2, 0] },
  { source: 'A-shape minor seventh barre', shape: ['x', 0, 2, 0, 1, 0] },
  { source: 'A-shape suspended second barre', shape: ['x', 0, 2, 2, 0, 0] },
  { source: 'A-shape suspended fourth barre', shape: ['x', 0, 2, 2, 3, 0] },
  { source: 'A-shape sixth barre', shape: ['x', 0, 2, 2, 2, 2] },
  { source: 'A-shape minor sixth barre', shape: ['x', 0, 2, 2, 1, 2] },
  { source: 'Fifth-string ninth form', shape: ['x', 0, -1, 0, 0, 0] },
  { source: 'Fifth-string major ninth form', shape: ['x', 0, -1, 1, 0, 'x'] },
  { source: 'Fifth-string minor ninth form', shape: ['x', 0, -2, 0, 0, 'x'] },
  { source: 'Fifth-string power chord', shape: ['x', 0, 2, 2, 'x', 'x'] },
];
const COMMON_OPEN_FORMS = [
  { source: 'Open add-nine form', shape: ['x', 3, 2, 0, 3, 0] },
  { source: 'Open seventh form', shape: [0, 2, 2, 1, 3, 0] },
  { source: 'Open seventh form', shape: ['x', 0, 2, 2, 2, 3] },
  { source: 'Open minor seventh form', shape: [0, 2, 2, 0, 3, 0] },
  { source: 'Open minor seventh form', shape: ['x', 0, 2, 2, 1, 3] },
  { source: 'Open minor form', shape: [0, 2, 2, 0, 0, 3] },
  { source: 'Open inversion form', shape: ['x', 2, 0, 0, 3, 3] },
  { source: 'Open inversion form', shape: ['x', 'x', 0, 0, 0, 3] },
  { source: 'Open inversion form', shape: [2, 0, 0, 2, 3, 2] },
  { source: 'Open inversion form', shape: [3, 3, 2, 0, 1, 3] },
];
const COMMON_TRIAD_FORMS = [
  ['x', 'x', 'x', 0, 0, -2], ['x', 'x', 'x', 0, -1, -1], ['x', 'x', 'x', 0, 1, 0],
  ['x', 'x', 'x', 0, -1, -2], ['x', 'x', 'x', 0, 0, 0], ['x', 'x', 'x', 0, 1, -1],
  ['x', 'x', 0, -1, -2, 'x'], ['x', 'x', 0, -2, -1, 'x'], ['x', 'x', 0, 0, 0, 'x'],
  ['x', 'x', 0, -2, -2, 'x'], ['x', 'x', 0, -1, 0, 'x'], ['x', 'x', 0, 0, -1, 'x'],
];
const FIFTH_OPTIONAL = new Set([
  '7', 'maj7', 'm7', '6', 'm6', 'add9', 'madd9', 'm(maj7)', '7sus4', '9', 'maj9', 'm9', '6/9',
]);
function commonLibraryLabel(item) {
  if (item.category.startsWith('E-shaped')) return 'E-shape barre';
  if (item.category.startsWith('A-shaped')) return 'A-shape barre';
  if (item.category.startsWith('Triads')) return 'Upper-string triad';
  if (item.id === 'open-f') return 'Small four-string form';
  if (item.id === 'open-g-four') return 'Four-finger open form';
  if (item.category === 'Power & jazz') return 'Familiar jazz or power form';
  return 'Open-position form';
}
/**
 * Other common ways to play an identified chord at the same capo and tuning.
 * The bass pitch class is retained, including slash chords. Extended chords may
 * omit/add their perfect fifth, as in open C7; all other chord tones are required.
 * An empty list means no curated equivalent is available, not that none exists.
 */
export function commonChordForms(event, { limit = 8 } = {}) {
  const { shape, capo = 0, tuning = 'standard' } = event,
    analysis = analyzeSelection(shape, { capo, tuning }),
    // Prefer a complete triad over a more speculative extended chord with its
    // fifth omitted (Am/C can also be named C6(no5)). C7(no5) still works when
    // its notes do not describe a complete chord of another quality.
    chord = analysis.chords.find((c) => c.exact && !c.suffix.endsWith('(no5)')) ??
      analysis.chords.find((c) => c.exact);
  if (!chord?.exact || !Number.isInteger(limit) || limit <= 0) return [];
  const family = chord.suffix.replace(/\(no5\)$/, ''),
    target = new Set(chord.present.map((pc) => normalizePitchClass(pc))),
    fifth = mod(chord.rootPc + 7),
    fifthOptional = FIFTH_OPTIONAL.has(family),
    strings = tuningStrings(tuning),
    results = new Map(),
    current = shape.join(','),
    maximum = Math.min(15, 24 - capo);
  if (fifthOptional) target.add(fifth);
  const consider = (candidate, source, rank = 1) => {
    const signature = candidate.join(',');
    if (
      signature === current ||
      candidate.some((f) => f !== 'x' && (!Number.isInteger(f) || f < 0 || f > maximum))
    ) return;
    const midi = candidate.flatMap((f, i) => f === 'x' ? [] : [strings[i].midi + capo + f]),
      pcs = new Set(midi.map(mod));
    if (
      !midi.length || mod(Math.min(...midi)) !== chord.bassPc ||
      [...pcs].some((pc) => !target.has(pc)) ||
      [...target].some((pc) => !pcs.has(pc) && !(fifthOptional && pc === fifth))
    ) return;
    const omittedFifth = fifthOptional && !pcs.has(fifth),
      entry = {
        shape: [...candidate], capo, tuning, rootPc: chord.rootPc, bassPc: chord.bassPc,
        source: source + (omittedFifth ? ' · no fifth' : ''),
        omittedFifth,
        cost: gripCost(candidate),
        rank,
      };
    if (!results.has(signature) || rank < results.get(signature).rank) results.set(signature, entry);
  };
  const move = (form, rank = 1) => {
    for (let fret = 0; fret <= 12; fret++)
      consider(form.shape.map((f) => f === 'x' ? f : f + fret), form.source, rank);
  };
  // Half-step down retains Standard's fingering relationships. Drop D retains
  // those relationships only on the upper five strings: never reuse a Standard
  // low-string barre there under a misleading label.
  if (['standard', 'half-down', 'drop-d'].includes(tuning)) {
    for (const item of guitarLibrary) {
      if (item.category === 'Scales & keys' || (tuning === 'drop-d' && item.shape[0] !== 'x')) continue;
      const source = commonLibraryLabel(item),
        rank = item.category.startsWith('Triads') ? 3 : item.shape.includes(0) ? 0 : 1;
      consider(item.shape, source, rank);
      if (!item.shape.includes(0)) {
        const firstFret = Math.min(...item.shape.filter(Number.isInteger));
        move({
          shape: item.shape.map((f) => f === 'x' ? f : f - firstFret),
          source: source === 'Open-position form' ? 'Movable compact form' : source,
        }, rank);
      }
    }
    for (const form of COMMON_MOVABLE_FORMS)
      if (tuning !== 'drop-d' || form.shape[0] === 'x') move(form);
    for (const form of COMMON_OPEN_FORMS)
      if (tuning !== 'drop-d' || form.shape[0] === 'x') consider(form.shape, form.source, 0);
    for (const triad of COMMON_TRIAD_FORMS)
      move({ source: 'Three-string triad', shape: triad }, 3);
  }
  if (tuning === 'drop-d') {
    move({ source: 'Drop D major form', shape: [0, 0, 0, 2, 3, 2] });
    move({ source: 'Drop D minor form', shape: [0, 0, 0, 2, 3, 1] });
    move({ source: 'Drop D power chord', shape: [0, 0, 0, 'x', 'x', 'x'] });
  }
  if (tuning === 'open-d' || tuning === 'open-g') {
    move({ source: 'Straight-barre form', shape: [0, 0, 0, 0, 0, 0] });
    move({ source: 'Five-string straight-barre form', shape: ['x', 0, 0, 0, 0, 0] });
    move({ source: 'Upper-string straight-barre form', shape: ['x', 'x', 0, 0, 0, 0] }, 3);
  }
  return [...results.values()]
    .sort((a, b) => a.rank - b.rank || a.cost - b.cost || a.shape.join(',').localeCompare(b.shape.join(',')))
    .slice(0, limit)
    .map(({ rank, ...entry }) => entry);
}
export function findVoicings(
  root,
  type = '',
  { capo = 0, bass = null, openOnly = false, limit = 36, tuning = 'standard' } = {},
) {
  const rootPc = normalizePitchClass(root),
    template = CHORD_TYPES.find((t) => t.id === type);
  if (!template || !Number.isInteger(capo) || capo < 0 || capo > 12)
    throw new RangeError('Unsupported chord or capo');
  const bassPc = bass === null ? null : normalizePitchClass(bass),
    key = JSON.stringify([rootPc, type, capo, bassPc, openOnly, tuning]);
  if (cache.has(key)) return structuredClone(cache.get(key).slice(0, limit));
  const target = template.intervals.map((n) => mod(rootPc + n)),
    results = new Map();
  const consider = (shape, source = 'Compact voicing') => {
    const midi = shape.flatMap((f, i) => (f === 'x' ? [] : [tuningStrings(tuning)[i].midi + capo + f]));
    if (
      midi.length < target.length ||
      new Set(midi.map(mod)).size !== target.length ||
      midi.some((n) => !target.includes(mod(n)))
    )
      return;
    const low = mod(Math.min(...midi));
    if (bassPc !== null && bassPc !== low) return;
    if (openOnly && (!shape.includes(0) || Math.max(...shape.filter(Number.isInteger)) > 4)) return;
    const entry = {
      shape: [...shape],
      capo,
      tuning,
      bassPc: low,
      rootPc,
      source,
      cost: gripCost(shape) + (low === rootPc ? 0 : 1.5) - (source === 'Compact voicing' ? 0 : 2),
    };
    const signature = shape.join(',');
    if (!results.has(signature) || source !== 'Compact voicing') results.set(signature, entry);
  };
  for (const item of tuning === 'standard' ? guitarLibrary : [])
    if (item.category !== 'Scales & keys') consider(item.shape, item.title);
  // Consecutive sounding strings and a four-fret window constrain search and avoid
  // presenting arbitrary, scattered pitch sets as practical full guitar chords.
  for (let start = 0; start <= 6 - target.length; start++)
    for (let end = start + target.length - 1; end < 6; end++)
      for (let position = 1; position <= 10; position++) {
        const choices = [];
        for (let s = start; s <= end; s++) {
          const values = [];
          for (let f = 0; f <= 12; f++)
            if (
              (f === 0 || (f >= position && f < position + 4)) &&
              target.includes(mod(tuningStrings(tuning)[s].midi + capo + f))
            )
              values.push(f);
          choices.push(values);
        }
        const shape = ['x', 'x', 'x', 'x', 'x', 'x'];
        const walk = (depth) => {
          if (depth === choices.length) {
            consider(shape);
            return;
          }
          for (const f of choices[depth]) {
            shape[start + depth] = f;
            walk(depth + 1);
          }
        };
        walk(0);
      }
  const sorted = [...results.values()]
    .sort((a, b) => a.cost - b.cost || a.shape.join(',').localeCompare(b.shape.join(',')))
    .slice(0, 100);
  if (cache.size >= 160) cache.delete(cache.keys().next().value);
  cache.set(key, sorted);
  return structuredClone(sorted.slice(0, limit));
}
export function revoiceEvent(event, capo, semitones = 0) {
  if (event.shape.every((f) => f === 'x')) return { ...event, shape: [...event.shape], capo };
  const analysis = analyzeSelection(event.shape, { capo: event.capo, tuning: event.tuning }),
    match = analysis.chords[0];
  if (!match?.exact || !CHORD_TYPES.some((t) => t.id === match.suffix)) {
    const delta = event.capo + semitones - capo,
      shape = event.shape.map((f) => (f === 'x' ? f : f + delta));
    if (shape.some((f) => f !== 'x' && (f < 0 || f + capo > 24)))
      throw new Error('A note or unrecognized grip cannot keep its pitches in this fret range.');
    return { ...event, shape, capo };
  }
  const candidates = findVoicings(match.rootPc + semitones, match.suffix, {
    capo,
    tuning: event.tuning,
    bass: match.bassPc + semitones,
    limit: 1,
  });
  if (!candidates.length) throw new Error(`No compact voicing for ${match.symbol} at capo ${capo}.`);
  return { ...event, shape: candidates[0].shape, capo };
}
export function capoSuggestions(events) {
  if (!events.length || events.every((e) => e.shape.every((f) => f === 'x'))) return [];
  return Array.from({ length: 13 }, (_, capo) => {
    try {
      const steps = events.map((e) => revoiceEvent(e, capo));
      return {
        capo,
        steps,
        cost: steps.reduce((sum, e) => sum + gripCost(e.shape), 0) / steps.length,
        openGrips: steps.filter((e) => e.shape.includes(0)).length,
      };
    } catch {
      return null;
    }
  })
    .filter(Boolean)
    .sort((a, b) => b.openGrips - a.openGrips || a.cost - b.cost || a.capo - b.capo);
}

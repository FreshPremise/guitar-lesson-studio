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
    if (shape.some((f) => f !== 'x' && (f < 0 || f > 12)))
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

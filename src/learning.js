import { tuningStrings } from './tunings.js';
import { STANDARD_TUNING, normalizePitchClass, pitchName, analyzeSelection } from './theory.js';
import { guitarLibrary } from './library.js';
const mod = (n) => ((n % 12) + 12) % 12;
export function degreeLabel(chord, pc) {
  if (!chord?.exact) return '';
  const interval = mod(pc - chord.rootPc),
    suffix = chord.suffix;
  if (interval === 2) return suffix.includes('sus2') ? '2' : '9';
  if (interval === 8) return suffix.includes('aug') ? '♯5' : '♭6';
  if (interval === 9) return suffix.startsWith('dim7') ? '♭♭7' : '6';
  return { 0: '1', 1: '♭9', 3: '♭3', 4: '3', 5: '4', 6: '♭5', 7: '5', 10: '♭7', 11: '7' }[interval] ?? '';
}
export function keyFamily(root, mode = 'major') {
  if (!['major', 'naturalMinor'].includes(mode)) throw new RangeError('Choose major or natural minor');
  const pc = normalizePitchClass(root),
    scale = mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
    naturals = [0, 2, 4, 5, 7, 9, 11],
    start = letters.indexOf(root[0]);
  const names = scale.map((interval, i) => {
    const letter = (start + i) % 7,
      target = mod(pc + interval);
    let accidental = mod(target - naturals[letter]);
    if (accidental > 6) accidental -= 12;
    return letters[letter] + (accidental > 0 ? '#'.repeat(accidental) : 'b'.repeat(-accidental));
  });
  const roman =
    mode === 'major'
      ? ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']
      : ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];
  return scale.map((interval, i) => {
    const rootPc = mod(pc + interval),
      intervals = [0, mod(scale[(i + 2) % 7] - interval), mod(scale[(i + 4) % 7] - interval)];
    const quality = intervals[1] === 4 ? 'major' : intervals[2] === 6 ? 'diminished' : 'minor';
    return {
      rootPc,
      root: names[i],
      symbol: names[i] + { major: '', minor: 'm', diminished: 'dim' }[quality],
      quality,
      roman: roman[i],
      notes: [names[i], names[(i + 2) % 7], names[(i + 4) % 7]],
    };
  });
}
export function triadVoicings(rootPc, quality = 'major', stringSet = 3, capo = 0, tuning = 'standard') {
  if (
    !['major', 'minor', 'diminished'].includes(quality) ||
    !Number.isInteger(stringSet) ||
    stringSet < 0 ||
    stringSet > 3 ||
    !Number.isInteger(capo) ||
    capo < 0 ||
    capo > 12
  )
    throw new RangeError('Invalid triad context');
  rootPc = normalizePitchClass(rootPc);
  const offsets = quality === 'major' ? [0, 4, 7] : quality === 'minor' ? [0, 3, 7] : [0, 3, 6],
    pcs = offsets.map((n) => mod(rootPc + n));
  const choices = [0, 1, 2].map((n) =>
    Array.from({ length: 13 }, (_, f) => f).filter((f) =>
      pcs.includes(mod(tuningStrings(tuning)[stringSet + n].midi + capo + f)),
    ),
  );
  const result = [];
  for (const a of choices[0])
    for (const b of choices[1])
      for (const c of choices[2]) {
        const frets = [a, b, c],
          midi = frets.map((f, n) => tuningStrings(tuning)[stringSet + n].midi + capo + f);
        if (new Set(midi.map(mod)).size !== 3 || midi[0] >= midi[1] || midi[1] >= midi[2]) continue;
        const pressed = frets.filter((f) => f > 0),
          span = pressed.length ? Math.max(...pressed) - Math.min(...pressed) : 0;
        if (span > 4) continue;
        const shape = ['x', 'x', 'x', 'x', 'x', 'x'];
        frets.forEach((f, n) => (shape[stringSet + n] = f));
        result.push({
          shape,
          capo,
          inversion: pcs.indexOf(mod(midi[0])),
          position: Math.min(...frets),
          midi,
          span,
        });
      }
  return result.sort((a, b) => a.position - b.position || a.span - b.span || a.inversion - b.inversion);
}
export function nearestVoicings(voicings, current) {
  const distance = (v) =>
    v.shape.reduce(
      (sum, f, i) =>
        sum + (f === 'x' ? 0 : typeof current[i] === 'number' ? Math.abs(f - current[i]) : f * 0.1),
      0,
    );
  return [...voicings].sort((a, b) => distance(a) - distance(b) || a.position - b.position);
}
const cache = new Map();
export function familyVoicing(chord, capo = 0, tuning = 'standard') {
  const key = `${chord.rootPc}:${chord.quality}:${capo}:${tuning}`;
  if (cache.has(key)) return [...cache.get(key)];
  const options = guitarLibrary
    .filter((e) => !e.category.startsWith('Scales'))
    .filter((e) =>
      analyzeSelection(e.shape, { capo, tuning }).chords.some(
        (c) => c.exact && c.rootPc === chord.rootPc && c.quality === chord.quality,
      ),
    )
    .map((e) => e.shape);
  const inversion = (shape) =>
    (tuningStrings(tuning)[shape.findIndex(Number.isInteger)].midi + capo + shape.find(Number.isInteger)) %
      12 !==
    chord.rootPc;
  options.sort(
    (a, b) =>
      Number(inversion(a)) - Number(inversion(b)) ||
      Math.max(...a.filter(Number.isInteger)) - Math.max(...b.filter(Number.isInteger)) ||
      b.filter(Number.isInteger).length - a.filter(Number.isInteger).length,
  );
  const shape =
    options[0] ??
    [3, 2, 1, 0]
      .flatMap((set) => triadVoicings(chord.rootPc, chord.quality, set, capo, tuning))
      .sort(
        (a, b) =>
          Math.max(...a.shape.filter(Number.isInteger)) - Math.max(...b.shape.filter(Number.isInteger)) ||
          a.inversion - b.inversion ||
          a.span - b.span,
      )[0]?.shape;
  if (!shape) throw new Error(`No voicing for ${pitchName(chord.rootPc)}`);
  cache.set(key, shape);
  return [...shape];
}

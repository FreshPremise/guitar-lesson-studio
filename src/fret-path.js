import { tuningStrings } from './tunings.js';
import { STANDARD_TUNING, scaleNotes, normalizePitchClass } from './theory.js';
export function gripPath(shape, capo = 0, tuning = 'standard') {
  return shape.flatMap((fret, index) =>
    fret === 'x' ? [] : [{ index, fret, midi: tuningStrings(tuning)[index].midi + capo + fret }],
  );
}
export function scalePath(state, minFret = 0, maxFret = 4, coverage = 'octave') {
  if (!['octave', 'six-strings'].includes(coverage)) throw new RangeError('Unknown scale coverage');
  if (!Number.isInteger(minFret) || !Number.isInteger(maxFret) || minFret < 0 || maxFret > 12 || minFret > maxFret)
    throw new RangeError('Choose a fret range between 0 and 12');
  const pcs = new Set(scaleNotes(state.keyRoot, state.scaleType).map(normalizePitchClass));
  const root = normalizePitchClass(state.keyRoot),
    positions = [];
  tuningStrings(state.tuning).forEach((s, index) => {
    for (let fret = minFret; fret <= maxFret; fret++) {
      const midi = s.midi + state.capo + fret;
      if (pcs.has(midi % 12)) positions.push({ index, fret, midi });
    }
  });
  if (coverage === 'six-strings') {
    if (new Set(positions.map(p => p.index)).size !== 6)
      throw new Error('This range does not include scale notes on every string. Choose a wider range.');
    return positions;
  }
  for (const start of positions.filter((p) => p.midi % 12 === root).sort((a, b) => a.midi - b.midi)) {
    const targets = Array.from({ length: 13 }, (_, i) => start.midi + i).filter((m) => pcs.has(m % 12));
    let path = [start];
    for (const midi of targets.slice(1)) {
      const prev = path.at(-1);
      const choices = positions
        .filter((p) => p.midi === midi)
        .sort(
          (a, b) =>
            Math.abs(a.index - prev.index) * 3 +
            Math.abs(a.fret - prev.fret) -
            (Math.abs(b.index - prev.index) * 3 + Math.abs(b.fret - prev.fret)),
        );
      if (!choices.length) break;
      path.push(choices[0]);
    }
    if (path.length === targets.length) return path;
  }
  throw new Error('No complete octave in this range. Try All frets or another position.');
}
export function directPath(path, direction = 'up', stringOrder = false) {
  const sorted = stringOrder ? [...path] : [...path].sort((a, b) => a.midi - b.midi);
  return direction === 'down'
    ? sorted.reverse()
    : direction === 'both'
      ? [...sorted, ...sorted.slice(0, -1).reverse()]
      : sorted;
}

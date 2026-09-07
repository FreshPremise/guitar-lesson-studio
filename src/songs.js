import { keyFamily } from './learning.js';
import { findVoicings } from './voicings.js';
import { analyzeSelection, pitchName } from './theory.js';
export function eventName(event, { key = null, mode = 'major', preferFlats = false } = {}) {
  if (event.shape.every((f) => f === 'x')) return 'Rest';
  const result = analyzeSelection(event.shape, { capo: event.capo, preferFlats, tuning: event.tuning }),
    match = result.chords[0];
  if (!key || !match?.exact || result.dyad) return result.summary;
  const spelling = new Map(keyFamily(key, mode).map((c) => [c.rootPc, c.root]));
  const root = spelling.get(match.rootPc) ?? pitchName(match.rootPc, { preferFlats }),
    bass = spelling.get(match.bassPc) ?? pitchName(match.bassPc, { preferFlats });
  return root + match.suffix + (match.bassPc === match.rootPc ? '' : '/' + bass);
}
export const PROGRESSIONS = Object.freeze([
  {
    id: 'pop',
    title: 'Four-chord flow',
    mode: 'major',
    degrees: [0, 4, 5, 3],
    roman: 'I · V · vi · IV',
    tip: 'Keep your hand relaxed; prepare the next shape during the final beat.',
  },
  {
    id: 'turnaround',
    title: 'Classic turnaround',
    mode: 'major',
    degrees: [0, 5, 3, 4],
    roman: 'I · vi · IV · V',
    tip: 'Listen for the final chord pulling you back to the tonic.',
  },
  {
    id: 'three',
    title: 'Three-chord foundations',
    mode: 'major',
    degrees: [0, 3, 4, 0],
    roman: 'I · IV · V · I',
    tip: 'Learn these three functions in several keys.',
  },
  {
    id: 'twofive',
    title: 'ii–V–I resolution',
    mode: 'major',
    degrees: [1, 4, 0, 0],
    roman: 'ii · V · I · I',
    tip: 'Hear tension settle into the home chord.',
  },
  {
    id: 'blues',
    title: 'Twelve-bar blues',
    mode: 'major',
    degrees: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4],
    roman: 'I / IV / V · 12 bars',
    seventh: true,
    tip: 'Dominant sevenths add the familiar blues color.',
  },
  {
    id: 'minor',
    title: 'Minor-key journey',
    mode: 'naturalMinor',
    degrees: [0, 5, 2, 6],
    roman: 'i · VI · III · VII',
    tip: 'Compare the same notes with their relative-major setting.',
  },
  {
    id: 'minorwalk',
    title: 'Minor descending loop',
    mode: 'naturalMinor',
    degrees: [0, 6, 5, 6],
    roman: 'i · VII · VI · VII',
    tip: 'Hear the descending roots while keeping a steady pulse.',
  },
  {
    id: 'minorhome',
    title: 'Natural-minor home',
    mode: 'naturalMinor',
    degrees: [0, 3, 4, 0],
    roman: 'i · iv · v · i',
    tip: 'The minor v gives a softer return than a major dominant.',
  },
]);
export function buildProgression(id, root = 'C', capo = 0, tuning = 'standard') {
  const preset = PROGRESSIONS.find((p) => p.id === id);
  if (!preset) throw new RangeError('Unknown progression');
  const family = keyFamily(root, preset.mode);
  const steps = preset.degrees.map((degree) => {
    const chord = family[degree],
      type = preset.seventh ? '7' : chord.quality === 'major' ? '' : chord.quality === 'minor' ? 'm' : 'dim';
    const voicing =
      findVoicings(chord.rootPc, type, { capo, tuning, bass: chord.rootPc, limit: 1 })[0] ??
      findVoicings(chord.rootPc, type, { capo, tuning, limit: 1 })[0];
    if (!voicing) throw new Error('No playable grip in this range');
    return { shape: voicing.shape, capo, tuning, beats: 4, strum: 'down' };
  });
  return {
    title: `${root} · ${preset.title}`,
    note: preset.tip,
    key: root,
    mode: preset.mode,
    steps,
    tempo: id === 'blues' ? 90 : 80,
    rhythm: id === 'blues' ? 'quarters' : 'hold',
  };
}

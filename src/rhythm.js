import { DEFAULT_PATTERN } from './arrangement.js';
export const RHYTHMS = Object.freeze([
  { id: 'custom', title: 'My strum pattern', description: 'Your eight-slot down/up/rest/accent pattern.' },
  { id: 'hold', title: 'One strum', description: 'One strum per chord; let it ring.' },
  { id: 'quarters', title: 'Steady quarters', description: 'Four even downstrokes per four-beat bar.' },
  { id: 'eighths', title: 'Down / up eighths', description: 'Alternate down and up on each half-beat.' },
  { id: 'folk', title: 'Folk strum', description: 'Down, down-up, up-down-up across four beats.' },
  {
    id: 'arpeggio',
    title: 'Picked arpeggio',
    description: 'Separate strings in a repeating eight-note pattern.',
  },
]);
export function rhythmHits(event, rhythm = 'hold', pattern = DEFAULT_PATTERN) {
  rhythm = event.rhythm || rhythm;
  if (!RHYTHMS.some((r) => r.id === rhythm)) throw new RangeError('Unknown rhythm');
  if (event.shape?.every((fret) => fret === 'x')) return [];
  const hits = [];
  for (let offset = 0; offset < event.beats; offset += 0.5) {
    const eighth = Math.round(offset * 2) % 8;
    if (
      (rhythm === 'custom' && pattern[eighth] === '-') ||
      (rhythm === 'hold' && offset !== 0) ||
      (rhythm === 'quarters' && eighth % 2) ||
      (rhythm === 'folk' && ![0, 2, 3, 5, 6, 7].includes(eighth))
    )
      continue;
    const direction = eighth % 2 ? 'up' : 'down';
    hits.push({
      offset,
      accent: rhythm === 'custom' && ['D', 'U'].includes(pattern[eighth]) ? 1.25 : 1,
      strum:
        rhythm === 'custom'
          ? pattern[eighth].toLowerCase() === 'u'
            ? 'up'
            : 'down'
          : rhythm === 'hold' || rhythm === 'quarters'
            ? event.strum
            : event.strum === 'up'
              ? direction === 'up'
                ? 'down'
                : 'up'
              : direction,
      pick: rhythm === 'arpeggio' ? [0, 2, 3, 1, 4, 3, 2, 1][eighth] : null,
    });
  }
  return hits.map((hit, i) => ({ ...hit, gate: (hits[i + 1]?.offset ?? event.beats) - hit.offset }));
}
export function sequenceTimeline(events, { tempo = 90, rhythm = 'hold', pattern = DEFAULT_PATTERN } = {}) {
  if (!Number.isInteger(tempo) || tempo < 40 || tempo > 180) throw new RangeError('Invalid tempo');
  const beat = 60 / tempo,
    hits = [];
  let offset = 0;
  events.forEach((event, index) => {
    if (![1, 2, 4].includes(event.beats)) throw new RangeError('Invalid duration');
    for (const hit of rhythmHits(event, rhythm, pattern))
      hits.push({ event, index, ...hit, start: (offset + hit.offset) * beat, duration: hit.gate * beat });
    offset += event.beats;
  });
  return { hits, duration: offset * beat, beats: offset };
}

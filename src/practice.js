import { STANDARD_TUNING, pitchName } from './theory.js';
export const INTERVALS = Object.freeze([
  { semitones: 2, label: 'Major 2nd' },
  { semitones: 3, label: 'Minor 3rd' },
  { semitones: 4, label: 'Major 3rd' },
  { semitones: 5, label: 'Perfect 4th' },
  { semitones: 7, label: 'Perfect 5th' },
  { semitones: 9, label: 'Major 6th' },
  { semitones: 10, label: 'Minor 7th' },
  { semitones: 12, label: 'Octave' },
]);
export function practiceDeck(mode, { naturals = true, maxFret = 5, count = 10, random = Math.random } = {}) {
  const pick = (items) => items[Math.min(items.length - 1, Math.floor(random() * items.length))],
    questions = [];
  if (!['find', 'name', 'ear'].includes(mode) || ![5, 12].includes(maxFret) || count < 1 || count > 30)
    throw new RangeError('Invalid practice settings');
  const natural = [0, 2, 4, 5, 7, 9, 11];
  for (let n = 0; n < count; n++) {
    if (mode === 'ear') {
      const interval = pick(INTERVALS),
        root = 48 + Math.floor(random() * 12);
      questions.push({
        mode,
        midi: [root, root + interval.semitones],
        answer: interval.label,
        semitones: interval.semitones,
      });
      continue;
    }
    const string = n % 6,
      candidates = Array.from({ length: maxFret + 1 }, (_, f) => f).filter(
        (f) => !naturals || natural.includes((STANDARD_TUNING[string].midi + f) % 12),
      ),
      fret = pick(candidates),
      pc = (STANDARD_TUNING[string].midi + fret) % 12;
    questions.push({ mode, string, fret, pc, answer: pitchName(pc), maxFret });
  }
  return questions;
}
export function checkPractice(question, answer) {
  if (question.mode === 'find')
    return (
      Number.isInteger(answer) &&
      (STANDARD_TUNING[question.string].midi + answer) % 12 === question.pc &&
      answer >= 0 &&
      answer <= question.maxFret
    );
  return answer === question.answer;
}

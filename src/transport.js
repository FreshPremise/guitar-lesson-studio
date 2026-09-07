import { rhythmHits } from './rhythm.js';
/** One audio-clock lookahead timer; UI updates occur at the audible time. */
export function createTransport({
  clock,
  chord,
  click,
  onStep,
  onEnd,
  onBeat = () => {},
  onTempo = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let timer = null,
    stopped = true,
    next = 0,
    index = 0,
    remaining = 0,
    counting = 0,
    beatNumber = 0,
    ending = false,
    ui = [];
  let events,
    beat,
    repeat,
    metronome,
    rhythm,
    pattern,
    hits = [],
    offset = 0,
    currentEvent;
  let ramp, startTempo, currentTempo, completed;
  function stop() {
    stopped = true;
    if (timer !== null) clearTimer(timer);
    timer = null;
    ui = [];
  }
  function pump() {
    if (stopped) return;
    const now = clock();
    while (ui.length && ui[0].when <= now) {
      const event = ui.shift();
      if (event.end) {
        stop();
        onEnd();
        return;
      }
      if (event.tempo !== undefined) onTempo(event.tempo, event.pass);
      else if (event.beat !== undefined) onBeat(event.beat);
      else onStep(event.index, event.count);
    }
    // A background throttle resumes in time rather than dumping stale notes.
    if (next < now - 0.25) next = now + 0.04;
    while (!ending && next < now + 0.12) {
      if (counting > 0) {
        click(next, counting === 4);
        ui.push({ when: next, index: -1, count: counting });
        counting--;
        next += beat;
        continue;
      }
      if (remaining === 0) {
        if (index === events.length) {
          if (repeat) {
            index = 0;
            completed++;
            if (ramp?.enabled) {
              currentTempo = Math.max(
                startTempo,
                Math.min(ramp.target, startTempo + Math.floor(completed / ramp.every) * ramp.increment),
              );
              beat = 60 / currentTempo;
            }
          } else {
            ui.push({ when: next, end: true });
            ending = true;
            break;
          }
        }
        if (index === 0) ui.push({ when: next, tempo: currentTempo, pass: completed + 1 });
        currentEvent = events[index];
        hits = rhythmHits(currentEvent, rhythm, pattern);
        offset = 0;
        ui.push({ when: next, index, count: 0 });
        remaining = currentEvent.beats;
        index++;
      }
      const hit = hits.find((h) => h.offset === offset);
      if (hit) chord(currentEvent, next, hit.gate * beat, hit);
      if (Number.isInteger(beatNumber)) {
        if (metronome) click(next, beatNumber % 4 === 0);
        ui.push({ when: next, beat: beatNumber % 4 });
      }
      beatNumber += 0.5;
      remaining -= 0.5;
      offset += 0.5;
      next += beat * 0.5;
    }
    timer = setTimer(pump, 25);
  }
  function start(sequence, options = {}) {
    stop();
    if (!sequence.length) throw new RangeError('Sequence is empty');
    if (sequence.some((e) => ![1, 2, 4].includes(e.beats))) throw new RangeError('Invalid duration');
    const tempo = options.tempo ?? 90;
    if (!Number.isFinite(tempo) || tempo < 40 || tempo > 180) throw new RangeError('Invalid tempo');
    ramp = options.ramp;
    if (
      ramp !== undefined &&
      (!ramp ||
        typeof ramp.enabled !== 'boolean' ||
        ![1, 2, 5, 10].includes(ramp.increment) ||
        ![1, 2, 4, 8].includes(ramp.every) ||
        !Number.isInteger(ramp.target) ||
        ramp.target < 40 ||
        ramp.target > 180)
    )
      throw new RangeError('Invalid practice speed settings');
    startTempo = currentTempo = tempo;
    completed = 0;
    rhythm = options.rhythm ?? 'hold';
    pattern = options.pattern;
    rhythmHits(sequence[0], rhythm);
    events = structuredClone(sequence);
    beat = 60 / tempo;
    repeat = Boolean(options.repeat);
    metronome = Boolean(options.metronome);
    counting = options.countIn ? 4 : 0;
    index = 0;
    remaining = 0;
    beatNumber = 0;
    ending = false;
    stopped = false;
    next = clock() + 0.08;
    pump();
  }
  return {
    start,
    stop,
    get running() {
      return !stopped;
    },
  };
}

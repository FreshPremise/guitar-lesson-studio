// Local CC-BY 3.0 samples; provenance and licenses are in Guide → Credits and assets/.
export const SAMPLE_NOTES = [
  [40, 'E2'],
  [45, 'A2'],
  [48, 'C3'],
  [52, 'E3'],
  [57, 'A3'],
  [60, 'C4'],
  [64, 'E4'],
  [69, 'A4'],
  [72, 'C5'],
];
const acousticNotes = [...SAMPLE_NOTES, [74, 'D5']];
const electricNotes = [
  [40, 'E2'],
  [45, 'A2'],
  [48, 'C3'],
  [51, 'Ds3'],
  [54, 'Fs3'],
  [57, 'A3'],
  [60, 'C4'],
  [63, 'Ds4'],
  [66, 'Fs4'],
  [69, 'A4'],
  [72, 'C5'],
  [75, 'Ds5'],
  [78, 'Fs5'],
  [81, 'A5'],
  [84, 'C6'],
];
const caches = new WeakMap();
const banks = (context) => {
  if (!caches.has(context)) caches.set(context, new Map());
  return caches.get(context);
};
export function sampleMapping(midi, sound = 'acoustic') {
  if (!Number.isInteger(midi) || midi < 38 || midi > 88) return null;
  const [root, name] = (sound === 'electric' ? electricNotes : acousticNotes).reduce((best, n) =>
    Math.abs(n[0] - midi) < Math.abs(best[0] - midi) ? n : best,
  );
  return { root, name, rate: 2 ** ((midi - root) / 12) };
}
export async function prepareSamples(context, sound = 'acoustic') {
  const cache = banks(context);
  if (cache.has(sound)) return cache.get(sound);
  const pending = Promise.all(
    (sound === 'electric' ? electricNotes : acousticNotes).map(async ([midi, name]) => {
      const response = await fetch(`assets/${sound === 'electric' ? 'electric' : 'guitar'}/${name}.mp3`);
      if (!response.ok) throw new Error('Guitar sample missing. Reload the app to retry.');
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      let peak = 0,
        first = buffer.length;
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < data.length; i++) {
          const a = Math.abs(data[i]);
          peak = Math.max(peak, a);
          if (a > 0.008) first = Math.min(first, i);
        }
      }
      if (!peak || first === buffer.length) throw new Error('Empty acoustic sample');
      return [midi, { buffer, gain: 0.8 / peak, offset: Math.max(0, first / buffer.sampleRate - 0.003) }];
    }),
  ).then((entries) => new Map(entries));
  cache.set(sound, pending);
  try {
    const loaded = await pending;
    cache.set(sound, loaded);
    return loaded;
  } catch (error) {
    cache.delete(sound);
    throw error;
  }
}
export function sampledVoice(context, midi, sound = 'acoustic') {
  const map = banks(context).get(sound),
    mapping = sampleMapping(midi, sound);
  if (!(map instanceof Map) || !mapping) return null;
  return { ...map.get(mapping.root), rate: mapping.rate };
}

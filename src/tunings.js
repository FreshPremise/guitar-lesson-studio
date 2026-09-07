// String order is always sixth (bass) to first (treble). No mutable global tuning.
const preset = (id, title, midi, names) =>
  Object.freeze({
    id,
    title,
    strings: Object.freeze(
      midi.map((note, i) =>
        Object.freeze({
          string: 6 - i,
          midi: note,
          name: names[i],
          label: names[i].replace(/\d+$/, ''),
        }),
      ),
    ),
  });
export const TUNINGS = Object.freeze([
  preset('standard', 'Standard', [40, 45, 50, 55, 59, 64], ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']),
  preset('drop-d', 'Drop D', [38, 45, 50, 55, 59, 64], ['D2', 'A2', 'D3', 'G3', 'B3', 'E4']),
  preset('dadgad', 'DADGAD', [38, 45, 50, 55, 57, 62], ['D2', 'A2', 'D3', 'G3', 'A3', 'D4']),
  preset('open-g', 'Open G', [38, 43, 50, 55, 59, 62], ['D2', 'G2', 'D3', 'G3', 'B3', 'D4']),
  preset('open-d', 'Open D', [38, 45, 50, 54, 57, 62], ['D2', 'A2', 'D3', 'F♯3', 'A3', 'D4']),
  preset('half-down', 'Half-step down', [39, 44, 49, 54, 58, 63], ['E♭2', 'A♭2', 'D♭3', 'G♭3', 'B♭3', 'E♭4']),
]);
export function tuningPreset(id = 'standard') {
  const value = TUNINGS.find((p) => p.id === id);
  if (!value) throw new RangeError('Unknown guitar tuning');
  return value;
}
export const tuningStrings = (id) => tuningPreset(id).strings;
export const tuningName = (id) => tuningPreset(id).title;

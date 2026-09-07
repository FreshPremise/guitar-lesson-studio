export const DEFAULT_PATTERN = ['D', '-', 'd', 'u', '-', 'u', 'd', 'u'];
export function sections(steps) {
  const result = [];
  steps.forEach((event, index) => {
    const title = event.section || '';
    if (!result.length || result.at(-1).title !== title || event.sectionStart)
      result.push({ title, start: index, end: index, repeats: event.sectionRepeats ?? 1 });
    else result.at(-1).end = index;
  });
  return result;
}
export function expandArrangement(steps, { from = 0, to = steps.length - 1 } = {}) {
  const out = [];
  for (const group of sections(steps)) {
    const first = Math.max(group.start, from),
      last = Math.min(group.end, to);
    if (first > last) continue;
    for (let pass = 0; pass < group.repeats; pass++)
      for (let i = first; i <= last; i++) {
        out.push({ ...steps[i], sourceIndex: i, sectionPass: pass + 1 });
        if (out.length > 1024)
          throw new Error('Arrangement exceeds 1,024 played steps. Reduce section repeats.');
      }
  }
  return out;
}

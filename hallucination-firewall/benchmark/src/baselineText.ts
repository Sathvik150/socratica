const STOP = new Set('a an the and or of in on at to for from by with is are was were be been it its this that has have had'.split(' '));

/** Independent, deliberately simple tokenizer for the baseline (not shared with core). */
export function contentTokensForBaseline(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => !STOP.has(t));
}

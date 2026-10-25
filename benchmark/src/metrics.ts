import { VERDICTS, type Verdict } from '@socratica/core';

export interface LabelMetrics {
  precision: number | null;
  recall: number | null;
  f1: number | null;
  support: number;
  predicted: number;
}

export interface Metrics {
  n: number;
  accuracy: number;
  perLabel: Record<Verdict, LabelMetrics>;
  /** Share of items whose gold label is NOT contradicted that were predicted contradicted. */
  contradictedFalsePositiveRate: number | null;
  /** Accuracy on items whose gold label is contradicted or unverifiable. */
  contradictedVsUnverifiableAccuracy: number | null;
  contradictedVsUnverifiableN: number;
  /** confusion[gold][predicted] */
  confusion: Record<Verdict, Record<Verdict, number>>;
}

const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den);

export function computeMetrics(pairs: Array<{ gold: Verdict; predicted: Verdict }>): Metrics {
  const confusion = Object.fromEntries(
    VERDICTS.map((g) => [g, Object.fromEntries(VERDICTS.map((p) => [p, 0]))]),
  ) as Record<Verdict, Record<Verdict, number>>;
  for (const { gold, predicted } of pairs) confusion[gold][predicted]++;

  const perLabel = {} as Record<Verdict, LabelMetrics>;
  for (const label of VERDICTS) {
    const tp = confusion[label][label];
    const support = VERDICTS.reduce((s, p) => s + confusion[label][p], 0);
    const predicted = VERDICTS.reduce((s, g) => s + confusion[g][label], 0);
    const precision = ratio(tp, predicted);
    const recall = ratio(tp, support);
    const f1 = precision === null || recall === null || precision + recall === 0 ? null : (2 * precision * recall) / (precision + recall);
    perLabel[label] = { precision, recall, f1, support, predicted };
  }

  const notContradicted = pairs.filter((p) => p.gold !== 'contradicted');
  const cu = pairs.filter((p) => p.gold === 'contradicted' || p.gold === 'unverifiable');
  return {
    n: pairs.length,
    accuracy: pairs.length ? pairs.filter((p) => p.gold === p.predicted).length / pairs.length : 0,
    perLabel,
    contradictedFalsePositiveRate: ratio(notContradicted.filter((p) => p.predicted === 'contradicted').length, notContradicted.length),
    contradictedVsUnverifiableAccuracy: ratio(cu.filter((p) => p.gold === p.predicted).length, cu.length),
    contradictedVsUnverifiableN: cu.length,
    confusion,
  };
}

const pct = (x: number | null) => (x === null ? '  n/a ' : `${(x * 100).toFixed(1).padStart(5)}%`);

export function formatMetrics(name: string, m: Metrics): string {
  const lines = [
    `== ${name} (n=${m.n}) ==`,
    `accuracy: ${pct(m.accuracy)}`,
    `false-positive rate on "contradicted": ${pct(m.contradictedFalsePositiveRate)}`,
    `contradicted-vs-unverifiable accuracy: ${pct(m.contradictedVsUnverifiableAccuracy)} (n=${m.contradictedVsUnverifiableN})`,
    '',
    'label          precision  recall     f1     support  predicted',
    ...VERDICTS.map((l) => {
      const x = m.perLabel[l];
      return `${l.padEnd(14)} ${pct(x.precision)}    ${pct(x.recall)}  ${pct(x.f1)}  ${String(x.support).padStart(6)}  ${String(x.predicted).padStart(9)}`;
    }),
    '',
    'confusion (rows = gold, cols = predicted)',
    `${''.padEnd(14)} ${VERDICTS.map((v) => v.slice(0, 12).padStart(13)).join('')}`,
    ...VERDICTS.map((g) => `${g.padEnd(14)} ${VERDICTS.map((p) => String(m.confusion[g][p]).padStart(13)).join('')}`),
  ];
  return lines.join('\n');
}

/**
 * Benchmark runner. Prints only metrics it computed on this run.
 *
 *   pnpm bench                       # offline: HeuristicLLM + binary baseline
 *   pnpm bench -- --llm openai       # also run with a real LLM (uses HF_OPENAI_API_KEY, makes network calls)
 *   pnpm bench -- --llm anthropic    # (uses HF_ANTHROPIC_API_KEY, makes network calls)
 *   pnpm bench -- --llm local --model qwen2.5:3b [--base-url http://localhost:11434/v1]   # local OpenAI-compatible server
 *   pnpm bench -- --data path.jsonl  # custom dataset
 */
import { fileURLToPath } from 'node:url';
import { AnthropicProvider, HeuristicLLM, OpenAIProvider, type FetchLike, type Verdict } from '@hallucination-firewall/core';
import { loadDataset, type BenchmarkItem } from './dataset.js';
import { computeMetrics, formatMetrics } from './metrics.js';
import { BinaryOverlapBaseline, FirewallVerifier, type BaselineVerifier } from './verifiers.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export async function runBenchmark(items: BenchmarkItem[], verifier: BaselineVerifier) {
  const rows: Array<{ item: BenchmarkItem; predicted: Verdict }> = [];
  for (const item of items) rows.push({ item, predicted: await verifier.verify(item.claim, item.evidence) });
  return { rows, metrics: computeMetrics(rows.map((r) => ({ gold: r.item.label, predicted: r.predicted }))) };
}

async function main() {
  const dataPath = arg('data') ?? fileURLToPath(new URL('../data/benchmark.jsonl', import.meta.url));
  const items = loadDataset(dataPath);
  const verifiers: BaselineVerifier[] = [new FirewallVerifier(new HeuristicLLM()), new BinaryOverlapBaseline()];

  const llm = arg('llm');
  const fetchFn = globalThis.fetch as unknown as FetchLike;
  if (llm === 'openai' || llm === 'anthropic') {
    const envName = llm === 'openai' ? 'HF_OPENAI_API_KEY' : 'HF_ANTHROPIC_API_KEY';
    const apiKey = process.env[envName];
    if (!apiKey) throw new Error(`--llm ${llm} requires ${envName} in the environment`);
    const model = arg('model');
    const provider =
      llm === 'openai'
        ? new OpenAIProvider({ apiKey, fetch: fetchFn, ...(model ? { model } : {}) })
        : new AnthropicProvider({ apiKey, fetch: fetchFn, ...(model ? { model } : {}) });
    console.log(`NOTE: --llm ${llm} sends ${items.length} claims and their evidence to the provider.`);
    verifiers.unshift(new FirewallVerifier(provider));
  } else if (llm === 'local') {
    const model = arg('model');
    if (!model) throw new Error('--llm local requires --model');
    const baseUrl = arg('base-url') ?? 'http://localhost:11434/v1';
    console.log(`NOTE: --llm local sends ${items.length} claims and their evidence to ${baseUrl} (${model}).`);
    verifiers.unshift(new FirewallVerifier(new OpenAIProvider({ baseUrl, model, fetch: fetchFn }), {}, model));
  } else if (llm) {
    throw new Error(`Unknown --llm ${llm} (expected openai, anthropic or local)`);
  }

  const counts = items.reduce<Record<string, number>>((acc, i) => ((acc[i.label] = (acc[i.label] ?? 0) + 1), acc), {});
  console.log(`Dataset: ${dataPath}`);
  console.log(`Items: ${items.length} (${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ')})\n`);

  for (const verifier of verifiers) {
    const { rows, metrics } = await runBenchmark(items, verifier);
    console.log(formatMetrics(verifier.name, metrics));
    const misses = rows.filter((r) => r.item.label !== r.predicted);
    if (misses.length) {
      console.log(`\nerrors (${misses.length}):`);
      for (const r of misses) console.log(`  ${r.item.id} gold=${r.item.label} predicted=${r.predicted}  "${r.item.claim}"`);
    }
    console.log('');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

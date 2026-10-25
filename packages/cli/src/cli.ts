/**
 * socratica: command-line front end for Socratica.
 *
 * API keys are read from environment variables only, never from flags,
 * so they do not end up in shell history.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  AnthropicProvider,
  HeuristicLLM,
  OpenAIProvider,
  WikipediaEvidenceProvider,
  WikidataEvidenceProvider,
  GoogleFactCheckEvidenceProvider,
  UrlEvidenceProvider,
  WEB_SEARCH_ENGINES,
  createWebSearch,
  EuropePmcEvidenceProvider,
  WorldBankEvidenceProvider,
  GovUkEvidenceProvider,
  extractClaims,
  runVerification,
  type EvidenceProvider,
  type FetchLike,
  type LLMProvider,
  type VerifyOutput,
  type WebSearchEngine,
} from '@socratica/core';
import { loadEvidence } from './evidence.js';
import { validateVerdicts, type ValidateInput } from './validate.js';

export const VERSION = '0.2.0';

export const HELP = `socratica ${VERSION} - evidence-linked fact checking (supported / contradicted / unverifiable)

USAGE
  socratica verify   --answer <file|-> [--evidence <file|dir>]... [options]
  socratica extract  --answer <file|->
  socratica validate --input <file|-> [--format text|json]
  socratica --help | --version

COMMANDS
  verify    Extract claims from an answer, retrieve evidence, judge each claim, print a report.
  extract   Print the checkable factual claims found in an answer (JSON).
  validate  Post-validate verdicts written by another model (e.g. the assistant using this as a
            skill): every quote must be a verbatim substring of a supplied passage, otherwise the
            verdict is downgraded to "unverifiable". See SKILL.md for the input format.

VERIFY OPTIONS
  --answer <file|->        Answer text to check ("-" reads stdin).
  --question <text>        The question that produced the answer (context only).
  --evidence <file|dir>    Evidence documents: .json ([{title,text,url}]), .txt/.md, or a folder. Repeatable.
  --web <engine>           Web search engine: firecrawl (free, no key), serper (Google results, free key)
                           or brave (your key). Required unless you pass --evidence files.
  --wikipedia              Also search English Wikipedia (network).
  --wikidata               Search structured Wikidata statements (network, no key).
  --europe-pmc             Search biomedical abstracts (network, no key).
  --world-bank             Retrieve country statistics with years and units (no key).
  --gov-uk                 Retrieve official UK government guidance (no key).
  --fact-check             Search Google ClaimReview records (your key).
  --evidence-url <url>     Fetch a trusted public HTTPS page. Repeatable, up to 10.
  --llm <name>             Judge: heuristic (default, offline) | openai | anthropic | local
  --model <name>           Model name for the judge.
  --base-url <url>         OpenAI-compatible endpoint for --llm local
                           (default http://localhost:11434/v1, i.e. Ollama).
  --format <text|json>     Output format (default text).
  --fail-on-contradiction  Exit with code 2 if any claim is contradicted.

ENVIRONMENT
  SOCRATICA_OPENAI_API_KEY        Key for --llm openai.
  SOCRATICA_ANTHROPIC_API_KEY     Key for --llm anthropic.
  SOCRATICA_LOCAL_API_KEY         Optional key for --llm local.
  SOCRATICA_GOOGLE_FACT_CHECK_API_KEY  Key for --fact-check.
  SOCRATICA_FIRECRAWL_API_KEY     Optional key for --web firecrawl (raises the free limits).
  SOCRATICA_SERPER_API_KEY        Key for --web serper (free sign-up at serper.dev).
  SOCRATICA_BRAVE_API_KEY         Key for --web brave.
  The pre-0.2 HF_* names (HF_OPENAI_API_KEY and so on) are still read as fallbacks.

EXAMPLES
  socratica verify --answer answer.txt --evidence sources/
  echo "The Eiffel Tower opened in 1899." | socratica verify --answer - --web firecrawl --wikipedia
  socratica verify --answer a.txt --evidence docs.json --llm local --model llama3.1
`;

export interface ParsedArgs {
  command: string | undefined;
  flags: Map<string, string[]>;
}

const BOOLEAN_FLAGS = new Set(['wikipedia', 'wikidata', 'europe-pmc', 'world-bank', 'gov-uk', 'fact-check', 'help', 'version', 'fail-on-contradiction']);

const WEB_KEY_ENV: Record<WebSearchEngine, string> = {
  firecrawl: 'SOCRATICA_FIRECRAWL_API_KEY',
  serper: 'SOCRATICA_SERPER_API_KEY',
  brave: 'SOCRATICA_BRAVE_API_KEY',
};

/** Reads the pre-0.2 HF_* variable names as fallbacks for the SOCRATICA_* ones. */
export function withLegacyEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out = { ...env };
  for (const [name, value] of Object.entries(env)) {
    const renamed = name.startsWith('HF_') ? `SOCRATICA_${name.slice(3)}` : undefined;
    if (renamed && value && !out[renamed]) out[renamed] = value;
  }
  return out;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Map<string, string[]>();
  let command: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') continue;
    if (a === '-h') {
      flags.set('help', ['true']);
    } else if (a.startsWith('--')) {
      const [name, inline] = a.slice(2).split(/=(.*)/s, 2) as [string, string | undefined];
      const value = BOOLEAN_FLAGS.has(name) ? 'true' : inline ?? argv[++i];
      if (value === undefined) throw new UsageError(`--${name} needs a value`);
      flags.set(name, [...(flags.get(name) ?? []), value]);
    } else if (!command) {
      command = a;
    } else {
      throw new UsageError(`Unexpected argument: ${a}`);
    }
  }
  return { command, flags };
}

export class UsageError extends Error {}

function readInput(path: string, stdin: () => string): string {
  return path === '-' ? stdin() : readFileSync(path, 'utf8');
}

function one(flags: Map<string, string[]>, name: string): string | undefined {
  return flags.get(name)?.at(-1);
}

export function makeLLM(flags: Map<string, string[]>, env: NodeJS.ProcessEnv, fetch: FetchLike): LLMProvider {
  const name = one(flags, 'llm') ?? 'heuristic';
  const model = one(flags, 'model');
  switch (name) {
    case 'heuristic':
      return new HeuristicLLM();
    case 'openai': {
      const apiKey = env.SOCRATICA_OPENAI_API_KEY;
      if (!apiKey) throw new UsageError('--llm openai needs SOCRATICA_OPENAI_API_KEY in the environment');
      return new OpenAIProvider({ apiKey, fetch, ...(model ? { model } : {}) });
    }
    case 'anthropic': {
      const apiKey = env.SOCRATICA_ANTHROPIC_API_KEY;
      if (!apiKey) throw new UsageError('--llm anthropic needs SOCRATICA_ANTHROPIC_API_KEY in the environment');
      return new AnthropicProvider({ apiKey, fetch, ...(model ? { model } : {}) });
    }
    case 'local': {
      if (!model) throw new UsageError('--llm local needs --model (e.g. llama3.1, qwen2.5)');
      return new OpenAIProvider({
        baseUrl: one(flags, 'base-url') ?? 'http://localhost:11434/v1',
        model,
        fetch,
        ...(env.SOCRATICA_LOCAL_API_KEY ? { apiKey: env.SOCRATICA_LOCAL_API_KEY } : {}),
      });
    }
    default:
      throw new UsageError(`Unknown --llm ${name} (expected heuristic, openai, anthropic or local)`);
  }
}

export function formatReport(result: VerifyOutput): string {
  const lines = [`Summary: ${result.summary.text}`, ''];
  for (const v of result.verdicts) {
    lines.push(`[${v.verdict.toUpperCase()}] ${v.claim}`);
    if (v.rationale) lines.push(`    reason: ${v.rationale}`);
    for (const q of v.quotes) lines.push(`    evidence: "${q.quote}"`, `      source: ${q.source.title}${q.source.url ? ` <${q.source.url}>` : ''}`);
    if (v.correction) lines.push(`    correction: ${v.correction}`);
    lines.push('');
  }
  if (result.errors.length) lines.push('Warnings:', ...result.errors.map((e) => `  ${e.providerId}: ${e.message}`));
  return lines.join('\n').trimEnd() + '\n';
}

export interface Io {
  stdout: (s: string) => void;
  stdin: () => string;
  env: NodeJS.ProcessEnv;
  fetch: FetchLike;
}

/** Runs the CLI and returns the exit code. */
export async function main(argv: string[], io: Io): Promise<number> {
  const { command, flags } = parseArgs(argv);
  const env = withLegacyEnv(io.env);
  if (flags.has('version')) return io.stdout(`${VERSION}\n`), 0;
  if (flags.has('help') || !command || command === 'help') return io.stdout(HELP), 0;

  if (command === 'extract') {
    const answer = one(flags, 'answer');
    if (!answer) throw new UsageError('extract needs --answer <file|->');
    io.stdout(JSON.stringify({ claims: extractClaims(readInput(answer, io.stdin)) }, null, 2) + '\n');
    return 0;
  }

  if (command === 'validate') {
    const input = one(flags, 'input');
    if (!input) throw new UsageError('validate needs --input <file|->');
    const data = JSON.parse(readInput(input, io.stdin)) as ValidateInput;
    if (!Array.isArray(data.claims) || !Array.isArray(data.passages) || !Array.isArray(data.verdicts)) {
      throw new UsageError('validate input must have "claims", "passages" and "verdicts" arrays');
    }
    const result = await validateVerdicts(data, input === '-' ? process.cwd() : dirname(resolve(input)));
    io.stdout(
      one(flags, 'format') === 'text'
        ? formatReport({ ...result, claims: [], passages: {}, errors: [] })
        : JSON.stringify(result, null, 2) + '\n',
    );
    return 0;
  }

  if (command === 'verify') {
    const answerPath = one(flags, 'answer');
    if (!answerPath) throw new UsageError('verify needs --answer <file|->');
    const answer = readInput(answerPath, io.stdin);
    const documents = loadEvidence(flags.get('evidence') ?? []);
    const providers: EvidenceProvider[] = [];
    const engine = one(flags, 'web');
    if (engine !== undefined) {
      if (!Object.hasOwn(WEB_SEARCH_ENGINES, engine)) throw new UsageError(`Unknown --web ${engine} (expected firecrawl, serper or brave)`);
      const key = env[WEB_KEY_ENV[engine as WebSearchEngine]];
      try { providers.push(createWebSearch(engine as WebSearchEngine, { fetch: io.fetch, ...(key ? { apiKey: key } : {}) })); }
      catch (err) { throw new UsageError(`${err instanceof Error ? err.message : 'Web search is not set up.'} Set ${WEB_KEY_ENV[engine as WebSearchEngine]} in the environment.`); }
    } else if (documents.length === 0) {
      throw new UsageError('verify needs a web search engine: add --web firecrawl (free, no key needed), --web serper or --web brave. Or check against your own files with --evidence.');
    }
    if (flags.has('wikipedia')) providers.push(new WikipediaEvidenceProvider({ fetch: io.fetch }));
    if (flags.has('wikidata')) providers.push(new WikidataEvidenceProvider({ fetch: io.fetch }));
    if (flags.has('europe-pmc')) providers.push(new EuropePmcEvidenceProvider({ fetch: io.fetch }));
    if (flags.has('world-bank')) providers.push(new WorldBankEvidenceProvider({ fetch: io.fetch }));
    if (flags.has('gov-uk')) providers.push(new GovUkEvidenceProvider({ fetch: io.fetch }));
    if (flags.has('fact-check')) {
      if (!env.SOCRATICA_GOOGLE_FACT_CHECK_API_KEY) throw new UsageError('--fact-check needs SOCRATICA_GOOGLE_FACT_CHECK_API_KEY in the environment');
      providers.push(new GoogleFactCheckEvidenceProvider({ apiKey: env.SOCRATICA_GOOGLE_FACT_CHECK_API_KEY, fetch: io.fetch }));
    }
    const urls = flags.get('evidence-url') ?? [];
    if (urls.length > 10) throw new UsageError('--evidence-url accepts up to 10 URLs');
    for (const url of [...new Set(urls)]) {
      try { providers.push(new UrlEvidenceProvider({ urls: [url], fetch: io.fetch })); }
      catch (err) { throw new UsageError(err instanceof Error ? err.message : 'Invalid evidence URL'); }
    }
    const question = one(flags, 'question');
    const result = await runVerification({
      answer,
      documents,
      providers,
      llm: makeLLM(flags, env, io.fetch),
      ...(question ? { question } : {}),
    });
    io.stdout(one(flags, 'format') === 'json' ? JSON.stringify(result, null, 2) + '\n' : formatReport(result));
    return flags.has('fail-on-contradiction') && result.summary.contradicted > 0 ? 2 : 0;
  }

  throw new UsageError(`Unknown command: ${command}. Run socratica --help.`);
}

/**
 * hf-verify: command-line front end for Hallucination Firewall.
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
  extractClaims,
  runVerification,
  type EvidenceProvider,
  type FetchLike,
  type LLMProvider,
  type VerifyOutput,
} from '@hallucination-firewall/core';
import { loadEvidence } from './evidence.js';
import { validateVerdicts, type ValidateInput } from './validate.js';

export const VERSION = '0.1.2';

export const HELP = `hf-verify ${VERSION} - evidence-linked fact checking (supported / contradicted / unverifiable)

USAGE
  hf-verify verify   --answer <file|-> [--evidence <file|dir>]... [options]
  hf-verify extract  --answer <file|->
  hf-verify validate --input <file|-> [--format text|json]
  hf-verify --help | --version

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
  --wikipedia              Also search English Wikipedia (network).
  --llm <name>             Judge: heuristic (default, offline) | openai | anthropic | local
  --model <name>           Model name for the judge.
  --base-url <url>         OpenAI-compatible endpoint for --llm local
                           (default http://localhost:11434/v1, i.e. Ollama).
  --format <text|json>     Output format (default text).
  --fail-on-contradiction  Exit with code 2 if any claim is contradicted.

ENVIRONMENT
  HF_OPENAI_API_KEY        Key for --llm openai.
  HF_ANTHROPIC_API_KEY     Key for --llm anthropic.
  HF_LOCAL_API_KEY         Optional key for --llm local.

EXAMPLES
  hf-verify verify --answer answer.txt --evidence sources/
  echo "The Eiffel Tower opened in 1899." | hf-verify verify --answer - --wikipedia
  hf-verify verify --answer a.txt --evidence docs.json --llm local --model llama3.1
`;

export interface ParsedArgs {
  command: string | undefined;
  flags: Map<string, string[]>;
}

const BOOLEAN_FLAGS = new Set(['wikipedia', 'help', 'version', 'fail-on-contradiction']);

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
      const apiKey = env.HF_OPENAI_API_KEY;
      if (!apiKey) throw new UsageError('--llm openai needs HF_OPENAI_API_KEY in the environment');
      return new OpenAIProvider({ apiKey, fetch, ...(model ? { model } : {}) });
    }
    case 'anthropic': {
      const apiKey = env.HF_ANTHROPIC_API_KEY;
      if (!apiKey) throw new UsageError('--llm anthropic needs HF_ANTHROPIC_API_KEY in the environment');
      return new AnthropicProvider({ apiKey, fetch, ...(model ? { model } : {}) });
    }
    case 'local': {
      if (!model) throw new UsageError('--llm local needs --model (e.g. llama3.1, qwen2.5)');
      return new OpenAIProvider({
        baseUrl: one(flags, 'base-url') ?? 'http://localhost:11434/v1',
        model,
        fetch,
        ...(env.HF_LOCAL_API_KEY ? { apiKey: env.HF_LOCAL_API_KEY } : {}),
      });
    }
    default:
      throw new UsageError(`Unknown --llm ${name} (expected heuristic, openai, anthropic or local)`);
  }
}

const ICON = { supported: '✔', contradicted: '✘', unverifiable: '?' } as const;

export function formatReport(result: VerifyOutput): string {
  const lines = [`Summary: ${result.summary.text}`, ''];
  for (const v of result.verdicts) {
    lines.push(`${ICON[v.verdict]} [${v.verdict.toUpperCase()}] ${v.claim}`);
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
    const providers: EvidenceProvider[] = flags.has('wikipedia') ? [new WikipediaEvidenceProvider({ fetch: io.fetch })] : [];
    const question = one(flags, 'question');
    const result = await runVerification({
      answer,
      documents,
      providers,
      llm: makeLLM(flags, io.env, io.fetch),
      ...(question ? { question } : {}),
    });
    io.stdout(one(flags, 'format') === 'json' ? JSON.stringify(result, null, 2) + '\n' : formatReport(result));
    return flags.has('fail-on-contradiction') && result.summary.contradicted > 0 ? 2 : 0;
  }

  throw new UsageError(`Unknown command: ${command}. Run hf-verify --help.`);
}

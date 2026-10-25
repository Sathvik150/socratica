import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { main, parseArgs, makeLLM, type Io } from '../cli.js';

const data = (f: string) => join(process.cwd(), 'src/__tests__/data', f);

function io(stdin = '', env: NodeJS.ProcessEnv = {}) {
  let out = '';
  const calls: string[] = [];
  const x: Io = {
    stdout: (s) => void (out += s),
    stdin: () => stdin,
    env,
    fetch: async (url) => {
      calls.push(url);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{}' } }] }), text: async () => '' };
    },
  };
  return { x, out: () => out, calls };
}

describe('socratica', () => {
  it('parses flags, repeated flags and --flag=value', () => {
    const p = parseArgs(['verify', '--evidence', 'a', '--evidence=b', '--wikipedia', '--', '--format', 'json']);
    expect(p.command).toBe('verify');
    expect(p.flags.get('evidence')).toEqual(['a', 'b']);
    expect(p.flags.get('wikipedia')).toEqual(['true']);
  });

  it('verify: offline, text report with evidence and correction', async () => {
    const t = io();
    const code = await main(['verify', '--answer', data('answer.txt'), '--evidence', data('zentha.json')], t.x);
    expect(code).toBe(0);
    expect(t.out()).toContain('Summary: 2 checked, 1 supported, 1 contradicted, 0 unverifiable');
    expect(t.out()).toContain('[CONTRADICTED] It opened in 1987.');
    expect(t.out()).toContain('correction: It opened in 1991.');
    expect(t.out()).toContain('<https://example.org/zentha>');
    expect(t.calls).toEqual([]); // no network without --wikipedia / remote llm
  });

  it('verify: reads stdin, emits JSON, and --fail-on-contradiction exits 2', async () => {
    const t = io('The Zentha Bridge opened in 1987.');
    const code = await main(['verify', '--answer', '-', '--evidence', data('zentha.json'), '--format', 'json', '--fail-on-contradiction'], t.x);
    expect(code).toBe(2);
    expect(JSON.parse(t.out()).summary.contradicted).toBe(1);
  });

  it('extract: lists claims', async () => {
    const t = io();
    await main(['extract', '--answer', data('answer.txt')], t.x);
    expect(JSON.parse(t.out()).claims.map((c: { text: string }) => c.text)).toEqual([
      'The Zentha Bridge is a suspension bridge in Velmora.',
      'It opened in 1987.',
    ]);
  });

  it('validate: keeps verbatim-quoted verdicts and downgrades fabricated quotes', async () => {
    const input = {
      claims: [
        { id: 'c1', text: 'The Zentha Bridge opened in 1987.' },
        { id: 'c2', text: 'The Zentha Bridge is in Velmora.' },
        { id: 'c3', text: 'The bridge is painted red.' },
      ],
      passages: [{ id: 'p1', title: 'Zentha Bridge', text: 'The Zentha Bridge is a suspension bridge in Velmora. It opened to traffic in 1991.' }],
      verdicts: [
        { claimId: 'c1', verdict: 'contradicted', confidence: 0.9, rationale: 'Opened 1991.', quotes: [{ passage_id: 'p1', quote: 'It opened to traffic in 1991.' }], correction: 'The Zentha Bridge opened in 1991.' },
        { claimId: 'c2', verdict: 'supported', confidence: 0.9, rationale: 'Stated.', quotes: [{ passage_id: 'p1', quote: 'The Zentha Bridge is located in Velmora.' }] },
      ],
    };
    const t = io(JSON.stringify(input));
    await main(['validate', '--input', '-'], t.x);
    const out = JSON.parse(t.out());
    expect(out.verdicts.map((v: { verdict: string }) => v.verdict)).toEqual(['contradicted', 'unverifiable', 'unverifiable']);
    expect(out.verdicts[0].correction).toBe('The Zentha Bridge opened in 1991.');
    expect(out.verdicts[1].downgradeReason).toBe('quote-not-in-passage');
    expect(out.summary.text).toBe('3 checked, 0 supported, 1 contradicted, 2 unverifiable');
  });

  it('local llm targets an OpenAI-compatible endpoint, keys only from env', async () => {
    const t = io('', {});
    const llm = makeLLM(parseArgs(['verify', '--llm', 'local', '--model', 'llama3.1']).flags, {}, t.x.fetch);
    await llm.complete('x');
    expect(t.calls).toEqual(['http://localhost:11434/v1/chat/completions']);
    expect(() => makeLLM(parseArgs(['verify', '--llm', 'openai']).flags, {}, t.x.fetch)).toThrow(/SOCRATICA_OPENAI_API_KEY/);
  });

  it('prints help', async () => {
    const t = io();
    expect(await main(['--help'], t.x)).toBe(0);
    expect(t.out()).toContain('USAGE');
  });
});

function hasPython(): boolean {
  try {
    execFileSync('python3', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!hasPython())('Python validator parity (skill/…/validate_verdicts.py)', () => {
  it('gives the same verdicts, downgrade reasons, corrections and summary as socratica validate', async () => {
    const examples = join(process.cwd(), '../../examples/verdicts.json');
    const t = io();
    await main(['validate', '--input', examples], t.x);
    const node = JSON.parse(t.out());
    const py = JSON.parse(
      execFileSync('python3', [join(process.cwd(), '../../skill/socratica/scripts/validate_verdicts.py'), examples], { encoding: 'utf8' }),
    );
    const shape = (r: { verdicts: Array<Record<string, unknown>>; summary: { text: string } }) => ({
      verdicts: r.verdicts.map((v) => [v.claimId, v.verdict, v.downgradeReason ?? null, v.correction ?? null]),
      summary: r.summary.text,
    });
    expect(shape(py)).toEqual(shape(node));
    expect(node.summary.text).toBe('2 checked, 0 supported, 1 contradicted, 1 unverifiable');
  });
});

describe('skill run in a separate working folder (passages loaded from files)', () => {
  const skillRun = (f: string) => join(process.cwd(), 'src/__tests__/data/skill-run', f);
  const script = (f: string) => join(process.cwd(), '../../skill/socratica/scripts', f);
  const expected = { c1: ['contradicted', null], c2: ['unverifiable', 'quote-not-in-passage'] };

  it('socratica validate reads "path" passages relative to verdicts.json', async () => {
    const t = io();
    await main(['validate', '--input', skillRun('verdicts.json')], t.x);
    const out = JSON.parse(t.out());
    expect(Object.fromEntries(out.verdicts.map((v: Record<string, unknown>) => [v.claimId, [v.verdict, v.downgradeReason ?? null]]))).toEqual(expected);
  });

  it.skipIf(!hasPython())('the Python validator agrees, from any working directory, and prints a text report', () => {
    const json = JSON.parse(execFileSync('python3', [script('validate_verdicts.py'), skillRun('verdicts.json')], { encoding: 'utf8', cwd: '/' }));
    expect(Object.fromEntries(json.verdicts.map((v: Record<string, unknown>) => [v.claimId, [v.verdict, v.downgradeReason ?? null]]))).toEqual(expected);
    const text = execFileSync('python3', [script('validate_verdicts.py'), skillRun('verdicts.json'), '--format', 'text'], { encoding: 'utf8', cwd: '/' });
    expect(text.split('\n')[0]).toBe('Summary: 2 checked, 0 supported, 1 contradicted, 1 unverifiable');
    expect(text).toContain('[CONTRADICTED] The Zentha Bridge opened in 1987.');
    expect(text).toContain('correction: The Zentha Bridge opened in 1991.');
    expect(text).toContain('discarded (quote-not-in-passage)');
  });

  it.skipIf(!hasPython())('find_quote.py turns approximate wording into the exact source text', () => {
    const out = execFileSync('python3', [script('find_quote.py'), skillRun('sources'), 'it opened to traffic in 1991 - after six years'], { encoding: 'utf8' });
    expect(JSON.parse(out.trim()).quote).toBe('It opened to traffic in 1991 – after six years');
    expect(() => execFileSync('python3', [script('find_quote.py'), skillRun('sources'), 'opened in 1987'], { stdio: 'pipe' })).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === '__tests__') return [];
    return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('core stays platform-agnostic', () => {
  it('has no DOM, chrome.*, or chatbot-specific references', () => {
    const offenders = sourceFiles(srcDir).filter((f) =>
      /\b(?:document|window|chrome|navigator|localStorage)\.|HTMLElement|chatgpt|openai\.com\/chat/i.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

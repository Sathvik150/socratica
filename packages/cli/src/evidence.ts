import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { EvidenceDocument } from '@hallucination-firewall/core';

const TEXT_EXT = new Set(['.txt', '.md', '.markdown', '.text']);

/**
 * Load evidence from files or directories:
 *  - .json : an array of { title, text, url? } (or a single object)
 *  - .txt / .md : one document, titled by file name
 *  - directory : every supported file inside it (non-recursive)
 */
export function loadEvidence(paths: string[]): EvidenceDocument[] {
  const docs: EvidenceDocument[] = [];
  for (const p of paths) {
    if (statSync(p).isDirectory()) {
      const files = readdirSync(p).sort().map((f) => join(p, f)).filter((f) => statSync(f).isFile() && (extname(f) === '.json' || TEXT_EXT.has(extname(f))));
      docs.push(...loadEvidence(files));
    } else if (extname(p) === '.json') {
      const data: unknown = JSON.parse(readFileSync(p, 'utf8'));
      for (const d of Array.isArray(data) ? data : [data]) {
        if (!d || typeof d !== 'object' || typeof (d as EvidenceDocument).text !== 'string') throw new Error(`${p}: each item needs a "text" string`);
        const doc = d as EvidenceDocument;
        docs.push({ title: doc.title ?? basename(p), text: doc.text, ...(doc.url ? { url: doc.url } : {}) });
      }
    } else {
      docs.push({ title: basename(p), text: readFileSync(p, 'utf8') });
    }
  }
  return docs;
}

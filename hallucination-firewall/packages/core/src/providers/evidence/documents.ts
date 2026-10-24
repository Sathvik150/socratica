import type { Claim, EvidenceDocument, EvidenceProvider, Passage, RetrieveOptions } from '../../types.js';
import { chunkText, scorePassage } from '../../rank.js';

/** Minimum lexical relevance for a chunk to count as evidence at all. */
export const MIN_RELEVANCE = 0.3;

/** Evidence from user-supplied documents. Fully offline. */
export class DocumentEvidenceProvider implements EvidenceProvider {
  readonly id = 'documents';
  readonly #chunks: Array<{ text: string; doc: EvidenceDocument }>;

  constructor(documents: EvidenceDocument[]) {
    this.#chunks = documents.flatMap((doc) => chunkText(doc.text).map((text) => ({ text, doc })));
  }

  async retrieve(claim: Claim, options: RetrieveOptions): Promise<Array<Omit<Passage, 'id'>>> {
    return this.#chunks
      .map(({ text, doc }) => ({
        text,
        score: scorePassage(claim, text),
        source: { title: doc.title, providerId: this.id, ...(doc.url ? { url: doc.url } : {}) },
      }))
      .filter((p) => p.score >= MIN_RELEVANCE)
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit);
  }
}

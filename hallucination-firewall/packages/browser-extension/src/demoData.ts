import type { EvidenceDocument } from '@hallucination-firewall/core';

/** Synthetic evidence for the offline demo and the end-to-end test. All facts are fictional. */
export const DEMO_DOCUMENTS: EvidenceDocument[] = [
  {
    title: 'Orrin Library (Velmora Encyclopedia, fictional)',
    url: 'https://example.org/velmora/orrin-library',
    text: 'The Orrin Library is a public library in the city of Velmora. It was founded by Dalia Moss in 1902. The library holds 2.4 million volumes and is open every day except Sunday.',
  },
];

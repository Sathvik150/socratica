import { readFileSync } from 'node:fs';
import { z } from 'zod';

export const BenchmarkItemSchema = z.object({
  id: z.string(),
  claim: z.string().min(1),
  evidence: z.array(z.object({ title: z.string(), text: z.string(), url: z.string().optional() })),
  label: z.enum(['supported', 'contradicted', 'unverifiable']),
  note: z.string().optional(),
});
export type BenchmarkItem = z.infer<typeof BenchmarkItemSchema>;

export function parseJsonl(text: string): BenchmarkItem[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const parsed = BenchmarkItemSchema.safeParse(JSON.parse(line));
      if (!parsed.success) throw new Error(`Invalid benchmark item on line ${i + 1}: ${parsed.error.message}`);
      return parsed.data;
    });
}

export function loadDataset(path: string): BenchmarkItem[] {
  return parseJsonl(readFileSync(path, 'utf8'));
}

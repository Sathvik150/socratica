import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Tests run with the package directory as cwd (pnpm -r / vitest default). */
export function readFixture(name: string): string {
  return readFileSync(join(process.cwd(), 'fixtures', name), 'utf8');
}

export function loadFixture(name: string): void {
  document.open();
  document.write(readFixture(name));
  document.close();
}

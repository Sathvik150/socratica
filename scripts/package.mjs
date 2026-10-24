// Builds the downloadable release bundles into ./release (run `pnpm package` after `pnpm build`).
//
//   hallucination-firewall-extension-vX.zip   Chrome extension (manifest.json at the zip root)
//   hallucination-firewall-skill-vX.zip       Agent Skill folder (SKILL.md) for Claude / ChatGPT / Codex / Claude Code
//   hf-verify-cli-vX.zip                      single-file CLI for local use (Node 20+, no install)
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZip } from './zip.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const out = join(root, 'release');

function walk(dir, filter = () => true) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p, filter) : filter(p) ? [p] : [];
  });
}

function entry(name, path) {
  return { name, data: readFileSync(path), mode: statSync(path).mode & 0o777 };
}

function requireBuilt(path) {
  if (!existsSync(path)) {
    console.error(`Missing ${relative(root, path)}. Run \`pnpm build\` first.`);
    process.exit(1);
  }
}

const extDist = join(root, 'packages/browser-extension/dist');
const cli = join(root, 'packages/cli/dist/hf-verify.mjs');
requireBuilt(join(extDist, 'manifest.json'));
requireBuilt(cli);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const bundles = {
  [`hallucination-firewall-extension-v${version}.zip`]: walk(extDist, (p) => !p.endsWith('.map')).map((p) => entry(relative(extDist, p), p)),

  [`hallucination-firewall-skill-v${version}.zip`]: [
    ...walk(join(root, 'skill/hallucination-firewall')).map((p) => entry(join('hallucination-firewall', relative(join(root, 'skill/hallucination-firewall'), p)), p)),
    entry('hallucination-firewall/scripts/hf-verify.mjs', cli),
    entry('hallucination-firewall/LICENSE', join(root, 'LICENSE')),
  ],

  [`hf-verify-cli-v${version}.zip`]: [
    entry('hf-verify/hf-verify.mjs', cli),
    entry('hf-verify/README.md', join(root, 'packages/cli/README.md')),
    entry('hf-verify/LICENSE', join(root, 'LICENSE')),
    ...walk(join(root, 'examples')).map((p) => entry(join('hf-verify/examples', relative(join(root, 'examples'), p)), p)),
  ],
};

for (const [name, entries] of Object.entries(bundles)) {
  const zip = createZip(entries.sort((a, b) => a.name.localeCompare(b.name)));
  writeFileSync(join(out, name), zip);
  console.log(`${name.padEnd(48)} ${String(entries.length).padStart(3)} files  ${(zip.length / 1024).toFixed(0).padStart(5)} KB`);
}

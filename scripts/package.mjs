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

  [`hallucination-firewall-skill-instructions-v${version}.zip`]: [
    entry('hallucination-firewall/SKILL.md', join(root, 'skill/instruction-only/SKILL.md')),
    ...walk(join(root, 'skill/hallucination-firewall/references')).map((p) => entry(join('hallucination-firewall/references', relative(join(root, 'skill/hallucination-firewall/references'), p)), p)),
    entry('hallucination-firewall/LICENSE', join(root, 'LICENSE')),
  ],

  [`hf-verify-cli-v${version}.zip`]: [
    entry('hf-verify/hf-verify.mjs', cli),
    entry('hf-verify/README.md', join(root, 'packages/cli/README.md')),
    entry('hf-verify/LICENSE', join(root, 'LICENSE')),
    ...walk(join(root, 'examples')).map((p) => entry(join('hf-verify/examples', relative(join(root, 'examples'), p)), p)),
  ],
};

// The ChatGPT New Plugin dialog expects a plugin manifest and skills/ layout,
// rather than a standalone Agent Skills folder.
for (const variant of ['', '-instructions']) {
  const skill = bundles[`hallucination-firewall-skill${variant}-v${version}.zip`];
  const manifest = {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: 'hallucination-firewall',
    version,
    description: variant ? 'Evidence-linked fact checking with manual quote checks; no bundled scripts.' : 'Evidence-linked fact checking with bundled quote validators.',
    license: 'MIT',
  };
  bundles[`hallucination-firewall-plugin${variant}-v${version}.zip`] = [
    { name: 'plugin.json', data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), mode: 0o644 },
    ...skill.map((item) => ({ ...item, name: `skills/${item.name}` })),
  ];
}

for (const [name, entries] of Object.entries(bundles)) {
  // Normalize skill archives independently of checkout permissions. Include explicit
  // directory records for uploaders that do not infer them from file paths.
  const archiveEntries = /^hallucination-firewall-(skill|plugin)-/.test(name)
    ? skillEntries(entries)
    : entries;
  const zip = createZip(archiveEntries.sort((a, b) => a.name.localeCompare(b.name)));
  writeFileSync(join(out, name), zip);
  console.log(`${name.padEnd(48)} ${String(entries.length).padStart(3)} files  ${(zip.length / 1024).toFixed(0).padStart(5)} KB`);
}

function skillEntries(entries) {
  const directories = new Set();
  const files = entries.map((item) => {
    const name = item.name.replace(/\\/g, '/');
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++) directories.add(`${parts.slice(0, i).join('/')}/`);
    return { ...item, name, mode: 0o644 };
  });
  return [...directories].map((name) => ({ name, data: Buffer.alloc(0), mode: 0o755 })).concat(files);
}

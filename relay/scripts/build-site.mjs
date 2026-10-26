// Builds Socratica's site for the relay's Vercel deployment (vercel.json runs it): the demo page,
// which turns on its live check and downloads when served over https, and the release zips.
// Vercel serves only public/, so the relay's own source files stay private; api/ deploys as before.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const relay = fileURLToPath(new URL('..', import.meta.url));
const root = join(relay, '..');
const pnpm = (...args) => execFileSync('pnpm', args, { cwd: root, stdio: 'inherit' });

pnpm('install', '--frozen-lockfile');
pnpm('build');
pnpm('package');

const ext = join(root, 'packages/browser-extension/dist');
const release = join(root, 'release');
const out = join(relay, 'public');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'downloads'), { recursive: true });

cpSync(join(ext, 'demo.html'), join(out, 'index.html'));
for (const file of ['demo.js', 'demo.js.LEGAL.txt', 'theme.css']) if (existsSync(join(ext, file))) cpSync(join(ext, file), join(out, file));
for (const dir of ['fonts', 'icons']) cpSync(join(ext, dir), join(out, dir), { recursive: true });
const zips = readdirSync(release).filter((f) => f.endsWith('.zip'));
if (zips.length !== 6) throw new Error(`Expected the six release zips, found ${zips.length}.`);
for (const zip of zips) cpSync(join(release, zip), join(out, 'downloads', zip));
console.log(`Site built in ${out}: index.html and ${zips.length} downloads.`);

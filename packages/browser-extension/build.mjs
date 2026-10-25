// Bundles the extension into dist/ as a load-unpacked MV3 folder.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const outdir = 'dist';
rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: {
    background: 'src/background.ts',
    contentScript: 'src/contentScript.ts',
    options: 'src/options.ts',
    popup: 'src/popup.ts',
    demo: 'src/demo.ts',
  },
  outdir,
  bundle: true,
  // IIFE everywhere: content scripts cannot be ES modules, and the demo page must also open from file://.
  format: 'iife',
  target: 'chrome120',
  // Minified for load speed (Chrome Web Store allows minified, not obfuscated, code);
  // linked source maps keep stack traces readable and are left out of release zips.
  minify: true,
  sourcemap: 'linked',
  legalComments: 'linked',
  logLevel: 'info',
});

cpSync('manifest.json', `${outdir}/manifest.json`);
cpSync('static', outdir, { recursive: true });

// Bundles src/content.ts into dist/, copies the manifest and icons, and zips the result for the
// Edge and Firefox add-on stores:
//
//   npm run build
//
// Needs `npm ci` first (esbuild is pinned in package-lock.json).
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as esbuild from 'esbuild';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
await esbuild.build({
  entryPoints: ['src/content.ts'],
  bundle: true,
  format: 'iife',
  target: ['chrome120', 'firefox121'],
  outfile: 'dist/content.js',
  legalComments: 'none',
});
cpSync('manifest.json', 'dist/manifest.json');
cpSync('icons', 'dist/icons', { recursive: true });

// Store packages want manifest.json at the root of the zip.
const zip = 'modelvram-extension.zip';
rmSync(zip, { force: true });
// bsdtar (Windows 10+, macOS) writes forward-slash paths; PowerShell 5's Compress-Archive writes
// backslashes, which the Firefox store rejects. The zip is a convenience: dist/ is the build.
try {
  execFileSync('tar', ['-a', '-c', '-f', `../${zip}`, 'manifest.json', 'content.js', 'icons'], { cwd: 'dist' });
  console.log(`built dist/ and ${zip}`);
} catch {
  console.log('built dist/ (zip skipped: no bsdtar)');
}

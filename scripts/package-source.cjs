const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { zip } = require('./zip.cjs');
const project = path.resolve(__dirname, '..');
const items = ['src', 'scripts', 'tests', 'docs', '.claude', '.github', 'wxt.config.ts', 'tsconfig.json', 'vitest.config.mts', 'package.json', 'package-lock.json', 'amo-metadata.json', 'README.md', 'CLAUDE.md', 'LICENSE', '.gitignore', '.gitattributes', '.editorconfig'];
// Only committed files, so untracked local files such as editor or agent settings never reach the AMO upload.
const tracked = execFileSync('git', ['ls-files', '-z', '--', ...items], { cwd:project, encoding:'utf8' }).split('\0').filter(Boolean);
if (!tracked.length) throw new Error('No tracked source files found; run this from a Git checkout');
const entries = {};
for (const relative of tracked) {
  const absolute = path.join(project, relative);
  // A tracked file deleted in the working tree is left out, as it would be from a commit of that tree.
  if (!fs.existsSync(absolute)) continue;
  if (fs.lstatSync(absolute).isSymbolicLink()) throw new Error('Refusing symbolic link');
  entries['unqlock/' + relative] = fs.readFileSync(absolute);
}
fs.mkdirSync(path.join(project, 'artifacts'), { recursive:true });
fs.writeFileSync(path.join(project, 'artifacts/unqlock-source.zip'), zip(entries));
console.log('Packaged shared source, lockfile, build scripts and tests.');

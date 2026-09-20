const fs = require('node:fs');
const path = require('node:path');
const { zipSync } = require('fflate');
const project = path.resolve(__dirname, '..');
const entries = {};
function collect(relative) {
  const absolute = path.join(project, relative);
  if (fs.lstatSync(absolute).isSymbolicLink()) throw new Error('Refusing symbolic link');
  if (fs.statSync(absolute).isDirectory()) {
    for (const name of fs.readdirSync(absolute).sort()) collect(relative + '/' + name);
  } else entries['unqork-scripts/' + relative] = [fs.readFileSync(absolute), { mtime:new Date('2020-01-01T00:00:00Z') }];
}
for (const item of ['src', 'manifests', 'scripts', 'tests', 'docs', '.claude', '.github', 'package.json', 'package-lock.json', 'README.md', 'CLAUDE.md', '.gitignore', '.gitattributes', '.editorconfig']) collect(item);
fs.mkdirSync(path.join(project, 'artifacts'), { recursive:true });
fs.writeFileSync(path.join(project, 'artifacts/unqlock-source.zip'), zipSync(entries, { level:9 }));
console.log('Packaged shared source, lockfile, build scripts and tests.');

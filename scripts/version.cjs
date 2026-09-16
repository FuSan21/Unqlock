const fs = require('node:fs');
const path = require('node:path');
const project = path.resolve(__dirname, '..');

function validateVersion(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) || version.split('.').some(part => Number(part) > 65535) || version === '0.0.0') {
    throw new Error('Use a numeric major.minor.patch version with parts from 0 to 65535, not 0.0.0');
  }
  return version;
}

function checkVersion(root, tag) {
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const version = validateVersion(read('package.json').version);
  const lock = read('package-lock.json');
  if (read('src/manifest.base.json').version !== version || lock.version !== version || lock.packages[''].version !== version) throw new Error('Package, lockfile and manifest versions must match');
  if (tag !== undefined && tag !== `v${version}`) throw new Error(`Release tag must be v${version}`);
  return version;
}

function bumpVersion(root, change) {
  const current = checkVersion(root);
  const parts = current.split('.').map(Number);
  const index = ['major', 'minor', 'patch'].indexOf(change);
  if (index !== -1) {
    parts[index] += 1;
    for (let position = index + 1; position < parts.length; position += 1) parts[position] = 0;
  }
  const version = validateVersion(index === -1 ? change || '' : parts.join('.'));
  const next = version.split('.').map(Number);
  const firstDifference = next.findIndex((value, position) => value !== Number(current.split('.')[position]));
  if (firstDifference === -1 || next[firstDifference] < Number(current.split('.')[firstDifference])) throw new Error('New version must be greater than the current version');
  for (const file of ['package.json', 'package-lock.json', 'src/manifest.base.json']) {
    const filename = path.join(root, file);
    const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
    data.version = version;
    if (file === 'package-lock.json') data.packages[''].version = version;
    fs.writeFileSync(filename, JSON.stringify(data, null, 2) + '\n');
  }
  return version;
}

if (require.main === module) {
  try {
    const [command, value] = process.argv.slice(2);
    if (!['check', 'bump'].includes(command)) throw new Error('Use check [tag] or bump patch|minor|major|X.Y.Z');
    console.log(command === 'check' ? `Validated version ${checkVersion(project, value)}` : `Updated version to ${bumpVersion(project, value)}; review and commit before tagging.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { validateVersion, checkVersion, bumpVersion };

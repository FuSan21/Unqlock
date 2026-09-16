const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateVersion, checkVersion, bumpVersion } = require('../scripts/version.cjs');
for (const version of ['1.2.3', '0.1.0', '65535.0.0']) assert.equal(validateVersion(version), version);
for (const version of ['0.0.0', '01.2.3', '1.2', '1.2.3-beta', '65536.0.0', '1.2.3.4']) assert.throws(() => validateVersion(version));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'unqlock-version-'));
try {
  fs.mkdirSync(path.join(root, 'src'));
  const write = (file, data) => fs.writeFileSync(path.join(root, file), JSON.stringify(data));
  write('package.json', { version:'1.2.0' });
  write('package-lock.json', { version:'1.2.0', packages:{ '':{ version:'1.2.0' } } });
  write('src/manifest.base.json', { version:'1.2.0' });
  assert.equal(checkVersion(root, 'v1.2.0'), '1.2.0');
  for (const tag of ['v1.2.1', '1.2.0', 'v1.2.0-beta']) assert.throws(() => checkVersion(root, tag));
  assert.equal(bumpVersion(root, 'patch'), '1.2.1');
  assert.equal(checkVersion(root, 'v1.2.1'), '1.2.1');
  assert.equal(bumpVersion(root, 'minor'), '1.3.0');
  assert.equal(bumpVersion(root, 'major'), '2.0.0');
  assert.equal(bumpVersion(root, '2.1.5'), '2.1.5');
  for (const change of ['2.1.5', '1.0.0', 'nope', undefined]) assert.throws(() => bumpVersion(root, change));
  assert.equal(checkVersion(root), '2.1.5');
  write('src/manifest.base.json', { version:'2.1.6' });
  assert.throws(() => checkVersion(root));
} finally {
  fs.rmSync(root, { recursive:true, force:true });
}
console.log('PASS: version synchronization, numeric limits, monotonic bumps and release tag validation.');

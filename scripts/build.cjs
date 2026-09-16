const fs = require('node:fs');
const path = require('node:path');
const { zipSync } = require('fflate');
const project = path.resolve(__dirname, '..');
const source = path.join(project, 'src');
const dist = path.join(project, 'dist');
const artifacts = path.join(project, 'artifacts');
const base = JSON.parse(fs.readFileSync(path.join(source, 'manifest.base.json'), 'utf8'));
const version = require('./version.cjs').checkVersion(project);
if (base.version !== version) throw new Error('Package and manifest versions must match');
function collect(folder, prefix = '') {
  const entries = {};
  for (const entry of fs.readdirSync(folder, { withFileTypes:true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isSymbolicLink()) throw new Error('Symbolic links are not allowed in build inputs');
    const relative = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(entries, collect(path.join(folder, entry.name), relative + '/'));
    else if (relative !== 'manifest.base.json') entries[relative] = fs.readFileSync(path.join(folder, entry.name));
  }
  return entries;
}
fs.mkdirSync(dist, { recursive:true });
fs.mkdirSync(artifacts, { recursive:true });
if (fs.realpathSync(dist) !== dist) throw new Error('Refusing redirected build directory');
for (const target of ['chrome', 'firefox']) {
  const destination = path.join(dist, target);
  if (path.dirname(destination) !== dist || (fs.existsSync(destination) && fs.realpathSync(destination) !== destination)) throw new Error('Unsafe build output');
  fs.rmSync(destination, { recursive:true, force:true });
  const overrides = JSON.parse(fs.readFileSync(path.join(project, 'manifests', target + '.json'), 'utf8'));
  const manifest = { ...base, ...overrides };
  if (manifest.version !== version) throw new Error('Browser override must not change the version');
  const entries = collect(source);
  entries['manifest.json'] = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  for (const [name, data] of Object.entries(entries)) {
    const output = path.join(destination, name);
    fs.mkdirSync(path.dirname(output), { recursive:true });
    fs.writeFileSync(output, data);
  }
  const archive = Object.fromEntries(Object.entries(entries).map(([name, data]) => [name, [data, { mtime:new Date('2020-01-01T00:00:00Z') }]]));
  fs.writeFileSync(path.join(artifacts, `unqlock-${target}.zip`), zipSync(archive, { level:9 }));
  console.log(`Built ${target} ${version}: dist/${target} and artifacts/unqlock-${target}.zip`);
}

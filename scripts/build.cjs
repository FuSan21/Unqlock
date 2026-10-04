const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { zipSync } = require('fflate');
const project = path.resolve(__dirname, '..');
const dist = path.join(project, 'dist');
const artifacts = path.join(project, 'artifacts');
const version = require('./version.cjs').checkVersion(project);
function refuseLinks(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes:true })) {
    if (entry.isSymbolicLink()) throw new Error('Symbolic links are not allowed in build inputs');
    if (entry.isDirectory()) refuseLinks(path.join(folder, entry.name));
  }
}
function collect(folder, prefix = '') {
  const entries = {};
  for (const entry of fs.readdirSync(folder, { withFileTypes:true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isSymbolicLink()) throw new Error('Symbolic links are not allowed in build output');
    const relative = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(entries, collect(path.join(folder, entry.name), relative + '/'));
    else entries[relative] = fs.readFileSync(path.join(folder, entry.name));
  }
  return entries;
}
refuseLinks(path.join(project, 'src'));
fs.mkdirSync(dist, { recursive:true });
fs.mkdirSync(artifacts, { recursive:true });
if (fs.realpathSync(dist) !== dist) throw new Error('Refusing redirected build directory');
for (const target of ['chrome', 'firefox']) {
  const destination = path.join(dist, target);
  if (path.dirname(destination) !== dist || (fs.existsSync(destination) && fs.realpathSync(destination) !== destination)) throw new Error('Unsafe build output');
  // WXT bundles src/ into dist/<target>, replacing what was there.
  const build = spawnSync(process.execPath, [path.join(project, 'node_modules/wxt/bin/wxt.mjs'), 'build', '--browser', target], { cwd:project, stdio:['ignore', 'pipe', 'inherit'], encoding:'utf8' });
  if (build.status !== 0) { process.stdout.write(build.stdout || ''); throw new Error(`WXT build for ${target} failed`); }
  const entries = collect(destination);
  if (JSON.parse(entries['manifest.json']).version !== version) throw new Error(`The ${target} manifest version must match package.json`);
  const archive = Object.fromEntries(Object.entries(entries).map(([name, data]) => [name, [data, { mtime:new Date('2020-01-01T00:00:00Z') }]]));
  fs.writeFileSync(path.join(artifacts, `unqlock-${target}.zip`), zipSync(archive, { level:9 }));
  console.log(`Built ${target} ${version}: dist/${target} and artifacts/unqlock-${target}.zip`);
}

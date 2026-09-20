const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { unzipSync } = require('fflate');
const project = path.resolve(__dirname, '..');
const dist = path.join(project, 'dist', 'firefox');
const artifacts = path.join(project, 'artifacts');
const webExt = path.join(project, 'node_modules', 'web-ext', 'bin', 'web-ext.js');
const metadata = path.join(project, 'amo-metadata.json');

function unpackTestedPackage(archive) {
  for (const [name, data] of Object.entries(unzipSync(fs.readFileSync(archive)))) {
    const output = path.join(dist, name);
    if (!output.startsWith(dist + path.sep)) throw new Error('Refusing package entry outside the build directory');
    fs.mkdirSync(path.dirname(output), { recursive:true });
    fs.writeFileSync(output, data);
  }
  console.log('Unpacked the tested Firefox package into dist/firefox');
}

function sign(channel) {
  const version = require('./version.cjs').checkVersion(project);
  const issuer = process.env.AMO_JWT_ISSUER || '';
  const secret = process.env.AMO_JWT_SECRET || '';
  if (!['listed', 'unlisted'].includes(channel)) throw new Error('Use channel unlisted or listed');
  if (!issuer || !secret) throw new Error('Set AMO_JWT_ISSUER and AMO_JWT_SECRET to the addons.mozilla.org API credentials');
  if (!fs.existsSync(webExt)) throw new Error('Run npm ci before signing');
  if (!fs.existsSync(path.join(dist, 'manifest.json'))) {
    const tested = path.join(artifacts, 'unqlock-firefox.zip');
    if (!fs.existsSync(tested)) throw new Error('Run npm run build first, or provide the tested artifacts/unqlock-firefox.zip');
    unpackTestedPackage(tested);
  }
  const built = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf8'));
  if (built.version !== version) throw new Error('Built manifest version does not match the package version');
  fs.mkdirSync(artifacts, { recursive:true });
  const before = new Set(fs.readdirSync(artifacts));
  const source = path.join(artifacts, 'unqlock-source.zip');
  const options = ['sign', '--source-dir', dist, '--artifacts-dir', artifacts, '--channel', channel, '--no-input', '--timeout', '900000'];
  if (channel === 'listed') {
    if (!fs.existsSync(source)) throw new Error('Run npm run package:source first; listed submissions upload the source archive');
    const declared = JSON.parse(fs.readFileSync(metadata, 'utf8')).version || {};
    if (!declared.license && !declared.custom_license) throw new Error('amo-metadata.json must set version.license; AMO rejects listed versions without one');
    options.push('--upload-source-code', source, '--amo-metadata', metadata, '--approval-timeout', '0');
  }
  const result = spawnSync(process.execPath, [webExt, ...options], { stdio:'inherit', env:{ ...process.env, WEB_EXT_API_KEY:issuer, WEB_EXT_API_SECRET:secret } });
  if (result.status !== 0) throw new Error(`web-ext sign failed with ${result.status === null ? result.signal : 'status ' + result.status}`);
  const produced = fs.readdirSync(artifacts).filter(name => name.endsWith('.xpi') && !before.has(name));
  if (produced.length === 0 && channel === 'listed') return `Submitted listed ${version} to addons.mozilla.org; Mozilla signs and lists it after review`;
  if (produced.length !== 1) throw new Error(`Expected one signed package in artifacts, found ${produced.length}`);
  const signed = `unqlock-firefox-${version}.xpi`;
  fs.renameSync(path.join(artifacts, produced[0]), path.join(artifacts, signed));
  const packaged = JSON.parse(Buffer.from(unzipSync(fs.readFileSync(path.join(artifacts, signed)))['manifest.json']).toString());
  if (packaged.version !== version || packaged.browser_specific_settings.gecko.id !== built.browser_specific_settings.gecko.id) throw new Error('Signed package does not match the built add-on');
  return `Signed ${channel} ${version}: artifacts/${signed}`;
}

if (require.main === module) {
  try {
    console.log(sign(process.argv[2] || process.env.AMO_CHANNEL || 'listed'));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { sign };

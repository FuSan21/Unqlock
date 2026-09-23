const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { unzipSync } = require('fflate');
const project = path.resolve(__dirname, '..');
const archives = Object.fromEntries(['chrome', 'firefox'].map(target => [target, unzipSync(fs.readFileSync(path.join(project, 'artifacts', `unqlock-${target}.zip`)))]));
assert.deepEqual(Object.keys(archives.chrome).sort(), Object.keys(archives.firefox).sort());
for (const name of Object.keys(archives.chrome)) {
  if (name !== 'manifest.json') assert.deepEqual(archives.chrome[name], archives.firefox[name], `Shared runtime differs: ${name}`);
}
const chromeManifest = JSON.parse(Buffer.from(archives.chrome['manifest.json']).toString());
const firefoxManifest = JSON.parse(Buffer.from(archives.firefox['manifest.json']).toString());
assert.equal(chromeManifest.browser_specific_settings, undefined);
assert.equal(firefoxManifest.minimum_chrome_version, undefined);
assert.equal(firefoxManifest.browser_specific_settings.gecko.id, 'unqlock@fusan.me');
assert.equal(firefoxManifest.browser_specific_settings.gecko.strict_min_version, '142.0');
assert.deepEqual(firefoxManifest.browser_specific_settings.gecko.data_collection_permissions.required, ['none']);
for (const [target, manifest] of [['chrome', chromeManifest], ['firefox', firefoxManifest]]) {
  assert.equal(manifest.name, 'Unqlock');
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://*.unqork.io/ide/*']);
  assert.deepEqual(manifest.content_scripts[1].matches, ['https://*.unqork.io/*']);
  assert.deepEqual(manifest.optional_host_permissions, ['*://*/*']);
  for (const script of manifest.background.scripts || [manifest.background.service_worker]) assert(archives[target][script], `Missing background script ${script}`);
  for (const script of manifest.content_scripts[1].js) assert(archives[target][script], `Missing ${script}`);
  assert.equal(manifest.action.default_title, 'Unqlock');
  // The Chrome Web Store rejects a manifest description over 132 characters.
  assert(manifest.description.length > 0 && manifest.description.length <= 132, `${target} description is ${manifest.description.length} characters`);
  assert.deepEqual(manifest.permissions, ['storage', 'activeTab', 'scripting']);
  for (const entry of [...manifest.content_scripts[0].js, ...manifest.content_scripts[0].css, manifest.action.default_popup, ...Object.values(manifest.icons)]) assert(archives[target][entry], `Missing ${entry}`);
  assert(!Object.keys(archives[target]).some(name => name.includes('node_modules') || name.startsWith('tests/')));
}
const amo = JSON.parse(fs.readFileSync(path.join(project, 'amo-metadata.json'), 'utf8'));
// AMO caps the listing summary at 250 characters and rejects a listed version with no license.
assert(amo.summary['en-US'].length > 0 && amo.summary['en-US'].length <= 250, `AMO summary is ${amo.summary['en-US'].length} characters`);
assert(amo.description['en-US'].length > 0);
assert(amo.version.license || amo.version.custom_license);
console.log('PASS: browser manifests, archive contents, permissions, store listing limits and identical shared runtime assets.');

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
  const script = name => manifest.content_scripts.find(entry => entry.js.includes('content-scripts/' + name));
  const builder = script('content.js');
  assert.deepEqual(builder.matches, ['https://*.unqork.io/ide/*']);
  assert(builder.js.includes('content-scripts/builder-panels.js') && builder.js.includes('content-scripts/canvas-toolbar.js'));
  const badge = script('environment-badge.js');
  assert.deepEqual(badge.matches, ['https://*.unqork.io/*']);
  const bridge = script('panel-resize-bridge.js');
  assert.equal(bridge.world, 'MAIN');
  assert.equal(bridge.run_at, 'document_start');
  assert.deepEqual(bridge.matches, ['https://*.unqork.io/ide/*']);
  assert(bridge.js.includes('content-scripts/canvas-toolbar-bridge.js'));
  for (const entry of manifest.content_scripts) for (const file of [...entry.js, ...(entry.css || [])]) assert(archives[target][file], `Missing ${file}`);
  assert.deepEqual(manifest.optional_host_permissions, ['*://*/*']);
  for (const file of manifest.background.scripts || [manifest.background.service_worker]) assert(archives[target][file], `Missing background script ${file}`);
  assert.equal(manifest.action.default_title, 'Unqlock');
  // The Chrome Web Store rejects a manifest description over 132 characters.
  assert(manifest.description.length > 0 && manifest.description.length <= 132, `${target} description is ${manifest.description.length} characters`);
  assert.deepEqual(manifest.permissions, ['storage', 'activeTab', 'scripting']);
  for (const entry of [manifest.action.default_popup, ...Object.values(manifest.icons)]) assert(archives[target][entry], `Missing ${entry}`);
  assert(!Object.keys(archives[target]).some(name => name.includes('node_modules') || name.startsWith('tests/')));
}
const amo = JSON.parse(fs.readFileSync(path.join(project, 'amo-metadata.json'), 'utf8'));
// AMO caps the listing summary at 250 characters and rejects a listed version with no license.
assert(amo.summary['en-US'].length > 0 && amo.summary['en-US'].length <= 250, `AMO summary is ${amo.summary['en-US'].length} characters`);
// AMO renders a limited Markdown subset; keep the description in blocks, not one wall of text.
assert(/\n\s*\n/.test(amo.description['en-US']), 'AMO description needs blank-line separated sections');
assert(amo.version.license || amo.version.custom_license);
// CI runs the build group in its build job and every other group from the --matrix list, one job each.
const workflow = fs.readFileSync(path.join(project, '.github/workflows/build.yml'), 'utf8');
assert(workflow.includes('run: node scripts/test.cjs build\n') &&workflow.includes('node scripts/test.cjs --matrix') && workflow.includes('fromJSON(needs.build.outputs.test-matrix)'), 'The workflow does not run every test group');
for (const [name, { browsers }] of Object.entries(require('../scripts/test-groups.cjs').groups)) assert(Array.isArray(browsers) && browsers.every(browser => ['chromium', 'firefox'].includes(browser)), `Test group ${name} needs a browsers list`);
console.log('PASS: browser manifests, archive contents, permissions, store listing limits, identical shared runtime assets and every test group in CI.');

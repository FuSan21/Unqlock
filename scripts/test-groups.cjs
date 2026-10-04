// The test suite in groups, run in this order by npm test. CI runs each group as its own step;
// tests/build.cjs checks that the workflow runs every group listed here.
const path = require('node:path');
const project = path.resolve(__dirname, '..');
const tool = file => path.join(project, 'node_modules', file);
const test = file => path.join(project, 'tests', file);
const groups = {
  unit:{ title:'Type check and unit tests', tests:[
    ['Type check', tool('typescript/bin/tsc'), ['-p', '.']],
    ['Popup and component unit tests', tool('vitest/vitest.mjs'), ['run']]
  ] },
  build:{ title:'Build and package checks', tests:[
    ['Version rules', test('version.cjs')],
    ['Page actions', test('quick-actions.cjs')],
    ['Build both browsers', path.join(__dirname, 'build.cjs')],
    ['Manifests and archives', test('build.cjs')]
  ] },
  models:{ title:'Environment and background', tests:[
    ['Environment detection and badge', test('environment.cjs')],
    ['Background messages and registration', test('environment-background.cjs')]
  ] },
  behavior:{ title:'Component styling', tests:[
    ['Component styling (Chrome)', test('behavior.cjs')],
    ['Component styling (Firefox)', test('behavior.cjs'), ['--firefox']]
  ] },
  chrome:{ title:'Chrome extension integration', tests:[
    ['Popup, settings and storage in Chrome', test('chrome.cjs')]
  ] },
  toolbar:{ title:'Canvas toolbar', tests:[
    ['Canvas toolbar (Chrome)', test('canvas-toolbar.cjs')],
    ['Canvas toolbar (Firefox)', test('canvas-toolbar.cjs'), ['--firefox']]
  ] },
  panels:{ title:'Builder panels', tests:[
    ['Builder panels (Chrome)', test('builder-panels.cjs')],
    ['Builder panels (Firefox)', test('builder-panels.cjs'), ['--firefox']],
    ['Firefox MAIN-world panel bridge', test('firefox-panel-bridge.cjs')]
  ] },
  floating:{ title:'Floating launcher and environments', tests:[
    ['Floating launcher, badges and restart', test('environment-browser.cjs')]
  ] },
  firefox:{ title:'Firefox package', tests:[
    ['Install and reload the Firefox package', test('firefox-package.cjs')]
  ] }
};
module.exports = { groups };

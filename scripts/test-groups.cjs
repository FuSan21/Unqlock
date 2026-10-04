// The test suite in groups, run in this order by npm test. CI runs build in its build job and every
// other group as its own parallel job, installing only the Playwright browsers the group lists.
const path = require('node:path');
const project = path.resolve(__dirname, '..');
const tool = file => path.join(project, 'node_modules', file);
const test = file => path.join(project, 'tests', file);
const groups = {
  unit:{ title:'Type check and unit tests', browsers:[], tests:[
    ['Type check', tool('typescript/bin/tsc'), ['-p', '.']],
    ['Popup and component unit tests', tool('vitest/vitest.mjs'), ['run']]
  ] },
  build:{ title:'Build and package checks', browsers:[], tests:[
    ['Version rules', test('version.cjs')],
    ['Page actions', test('quick-actions.cjs')],
    ['Build both browsers', path.join(__dirname, 'build.cjs')],
    ['Manifests and archives', test('build.cjs')]
  ] },
  models:{ title:'Environment and background', browsers:[], tests:[
    ['Environment detection and badge', test('environment.cjs')],
    ['Background messages and registration', test('environment-background.cjs')]
  ] },
  behavior:{ title:'Component styling', browsers:['chromium', 'firefox'], tests:[
    ['Component styling (Chrome)', test('behavior.cjs')],
    ['Component styling (Firefox)', test('behavior.cjs'), ['--firefox']]
  ] },
  chrome:{ title:'Chrome extension integration', browsers:['chromium'], tests:[
    ['Popup, settings and storage in Chrome', test('chrome.cjs')]
  ] },
  toolbar:{ title:'Canvas toolbar', browsers:['chromium', 'firefox'], tests:[
    ['Canvas toolbar (Chrome)', test('canvas-toolbar.cjs')],
    ['Canvas toolbar (Firefox)', test('canvas-toolbar.cjs'), ['--firefox']]
  ] },
  panels:{ title:'Builder panels', browsers:['chromium', 'firefox'], tests:[
    ['Builder panels (Chrome)', test('builder-panels.cjs')],
    ['Builder panels (Firefox)', test('builder-panels.cjs'), ['--firefox']],
    ['Firefox MAIN-world panel bridge', test('firefox-panel-bridge.cjs')]
  ] },
  floating:{ title:'Floating launcher and environments', browsers:['chromium'], tests:[
    ['Floating launcher, badges and restart', test('environment-browser.cjs')]
  ] },
  firefox:{ title:'Firefox package', browsers:['firefox'], tests:[
    ['Install and reload the Firefox package', test('firefox-package.cjs')]
  ] }
};
module.exports = { groups };

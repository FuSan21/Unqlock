const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const built = file => fs.readFileSync(path.join(__dirname, '../dist/chrome', file), 'utf8');
const lib = require('./lib.cjs');
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
(async () => {
  const dom = new JSDOM('', { url:'https://example-prod.unqork.io/app', runScripts:'outside-only' });
  const env = lib.load('environment');
  for (const [host, expected] of Object.entries({
    'american-equity-stagingx':'staging', 'american-equity-uatx':'uat', 'american-equity-qa-uatx':'unknown',
    'org-qa':'qa', 'org-prod':'production', 'org-prod-designer':'production', 'org-pre-prod':'preprod',
    'org-preproduction':'preprod', 'org-product':'unknown', 'org-qa-prod':'production', 'org':'unknown'
  })) assert.equal(env.detect('https://' + host + '.unqork.io').kind, expected, host);
  assert.equal(env.detect('https://org-prod.unqork.io.evil.test').kind, 'unknown');
  assert.equal(env.detect('https://custom.test', { hosts:{ production:'custom.test' } }).kind, 'production');
  assert.equal(env.detect('https://american-equity-qa-uatx.unqork.io', { hosts:{ qa:'american-equity-qa-uatx.unqork.io' } }).kind, 'qa');
  for (const bad of ['https://example.test', 'example.test/path', '*.example.test', 'user@example.test', 'example.test:443', 'example.test?x', '-example.test']) assert.throws(() => env.hostname(bad));
  assert.throws(() => env.settings({ hosts:{ qa:'same.test', uat:'same.test' } }));
  assert.equal(env.switchUrl('https://a.test/app?a=1#/display/dashboard', 'b.test'), 'https://b.test/app?a=1#/display/dashboard');
  let discovered = env.discover({}, 'american-equity-stagingx.unqork.io');
  discovered = env.discover(discovered, 'american-equity-uatx.unqork.io');
  discovered = env.discover(discovered, 'american-equity-qa-uatx.unqork.io');
  assert.equal(discovered.groups.length, 1);
  assert.equal(discovered.groups[0].domains.length, 3);
  assert.equal(discovered.groups[0].domains[2].environment, 'unknown');
  discovered.groups[0].domains[2].environment = 'qa';
  discovered = env.discover(discovered, 'american-equity-qa-uatx.unqork.io');
  assert.equal(discovered.groups[0].domains[2].environment, 'qa');
  discovered = env.discover(discovered, 'another-stagingx.unqork.io');
  assert.equal(discovered.groups.length, 2);
  assert.equal(env.discover({ autoDiscover:false }, 'org-qa.unqork.io').groups.length, 0);
  assert.throws(() => env.switchUrl('javascript:alert(1)', 'b.test'));
  assert.throws(() => env.switchUrl('https://user:secret@a.test', 'b.test'));
  let badgeListener;
  let sourceListener;
  dom.window.chrome = { runtime:{ getURL:file => 'https://extension.test/' + file.replace(/^\//, ''), sendMessage:async () => ({ok:true}), onMessage:{ addListener:fn => sourceListener = fn } }, storage:{ local:{ get:async () => ({}) }, onChanged:{ addListener:fn => badgeListener = fn } } };
  dom.window.eval(built('content-scripts/environment-badge.js'));
  await settle();
  // The badge, not the browser, supplies the page address the embedded menu resolves.
  let reported;
  sourceListener({ type:'floating.source' }, {}, value => { reported = value; });
  assert.equal(reported.ok, true);
  assert.equal(reported.url, 'https://example-prod.unqork.io/app');
  reported = undefined;
  sourceListener({ type:'other' }, {}, value => { reported = value; });
  assert.equal(reported, undefined);
  const launcher = dom.window.document.getElementById('unqlock-environment');
  assert.equal(launcher.shadowRoot.querySelector('span').hidden, true, 'Icon-only default');
  badgeListener({ environment:{ newValue:{ badge:true } } }, 'local');
  assert.equal(launcher.shadowRoot.querySelector('span').hidden, false);
  assert.match(launcher.shadowRoot.querySelector('span').textContent, /● PRODUCTION/);
  badgeListener({ environment:{ newValue:{ badge:false } } }, 'local');
  assert.equal(launcher.shadowRoot.querySelector('span').hidden, true);
  for (const position of ['top-left','top-right','bottom-left','bottom-right']) {
    badgeListener({ floating:{newValue:{position}} }, 'local');
    assert.equal(launcher.dataset.position, position);
  }
  badgeListener({ floating:{newValue:{enabled:false}} }, 'local');
  assert.equal(dom.window.document.getElementById('unqlock-environment'), null);
  badgeListener({ floating:{newValue:{enabled:true}} }, 'local');
  badgeListener({ environment:{ newValue:{} } }, 'local');
  dom.window.eval(built('content-scripts/environment-badge.js'));
  assert.equal(dom.window.document.querySelectorAll('#unqlock-environment').length, 1);
  dom.window.close();
  console.log('PASS: environment detection, URL validation, discovery and badge lifecycle.');
})().catch(error => { console.error(error); process.exitCode = 1; });

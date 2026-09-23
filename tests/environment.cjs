const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const source = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
(async () => {
  const dom = new JSDOM('', { url:'https://example-prod.unqork.io/app', runScripts:'outside-only' });
  dom.window.eval(source('environment.js'));
  const env = dom.window.UnqlockEnvironment;
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
  dom.window.chrome = { runtime:{ getURL:file => 'https://extension.test/' + file, sendMessage:async () => ({ok:true}), onMessage:{ addListener:fn => sourceListener = fn } }, storage:{ local:{ get:async () => ({}) }, onChanged:{ addListener:fn => badgeListener = fn } } };
  dom.window.eval(source('environment-badge.js'));
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
  dom.window.eval(source('environment-badge.js'));
  assert.equal(dom.window.document.querySelectorAll('#unqlock-environment').length, 1);
  dom.window.close();
  for (const api of ['chrome', 'browser']) {
    const popup = new JSDOM(source('popup.html'), { runScripts:'outside-only' });
    const page = popup.window;
    let config = { hosts:{ production:'custom.test', qa:'qa.test' } };
    let listener;
    let calls = [];
    page.matchMedia = () => ({ matches:false, addEventListener:() => {} });
    page[api] = {
      storage:{ local:{ get:async () => ({ environment:config }), set:async value => { config = value.environment; } }, onChanged:{ addListener:fn => listener = fn } },
      tabs:{ query:async () => [{ id:7, url:'https://custom.test/app?x=1#/dashboard' }] },
      runtime:{ sendMessage:async message => {
        config = page.UnqlockEnvironment.settings(config);
        if (message.type === 'environment.save') {
          if (message.group) config.groups = [...config.groups.filter(group => group.id !== message.group.id), message.group];
          if (message.deleteId) config.groups = config.groups.filter(group => group.id !== message.deleteId);
          Object.assign(config, message.preferences);
        }
        return { ok:true, config, missingOrigins:['*://custom.test/*'] };
      } },
      permissions:{ request:async () => false },
      scripting:{ executeScript:async injection => { calls.push(injection); return [{ result:{ ok:true, message:'Done' } }]; } }
    };
    page.eval(['environment.js', 'disabled-controls.js', 'quick-actions.js', 'popup.js', 'quick-popup.js', 'environment-popup.js'].map(source).join('\n'));
    const click = id => page.document.getElementById(id).click();
    click('open-quick'); await settle();
    click('tab-execute');
    page.document.getElementById('component-key').value = 'run';
    page.document.querySelector('[data-quick-action="trigger"]').click();
    assert.match(page.document.getElementById('confirmation-text').textContent, /PRODUCTION ENVIRONMENT/);
    assert.equal(page.document.activeElement.id, 'cancel-action');
    assert.equal(calls.length, 0);
    click('confirm-action'); await settle();
    assert.equal(calls[0].args[0].productionConfirmed, true);
    assert.equal(calls[0].args[0].production, true);
    page.document.querySelector('[data-quick-action="trigger"]').click();
    config.blockProduction = true;
    // Re-read policy at execution, even before a storage event reaches this popup.
    click('confirm-action'); await settle();
    assert.equal(calls.length, 1);
    listener({ environment:{ newValue:config } }, 'local');
    assert.equal(page.document.querySelector('[data-quick-action="trigger"]').disabled, true);
    assert.equal(page.document.querySelector('[data-quick-action="set"]').disabled, true);
    assert.equal(page.document.querySelector('[data-quick-action="log"]').disabled, false);
    click('quick-back'); click('open-environment'); await settle();
    assert.equal(page.document.querySelector('#environment-links a').href, 'https://qa.test/app?x=1#/dashboard');
    page.document.querySelectorAll('.environment-domain input')[1].value = 'https://bad.test';
    page.document.querySelector('.environment-domain input').dispatchEvent(new page.Event('input', { bubbles:true }));
    await settle();
    assert.match(page.document.getElementById('environment-status').textContent, /hostname only/);
    assert.equal(config.groups[0].domains[1].hostname, 'qa.test', 'Invalid drafts retain the saved hostname');
    const badgeToggle = page.document.querySelector('[name="badge"]');
    badgeToggle.checked = true;
    badgeToggle.dispatchEvent(new page.Event('input', { bubbles:true }));
    await settle();
    assert.equal(config.badge, true, 'Preferences save even with an invalid domain draft');
    assert.equal(page.document.querySelectorAll('.environment-domain input')[1].value, 'https://bad.test', 'Saving preserves unfinished edits');
    click('environment-access'); await settle();
    assert.match(page.document.getElementById('environment-status').textContent, /not granted/);
    click('environment-new-group');
    page.document.getElementById('environment-group-name').value = 'Second organization';
    page.document.querySelector('.environment-domain input').value = 'second.test';
    page.document.querySelector('.environment-domain select').value = 'staging';
    page.document.querySelector('.environment-domain input').dispatchEvent(new page.Event('input', { bubbles:true }));
    await settle();
    assert.equal(config.groups.length, 2);
    assert.equal(config.groups[0].domains.length, 2);
    const nameField = page.document.getElementById('environment-group-name');
    nameField.focus();
    for (const name of ['Second revised', 'Second final']) {
      nameField.value = name;
      nameField.dispatchEvent(new page.Event('input', { bubbles:true }));
    }
    await settle();
    assert.equal(config.groups[1].name, 'Second final', 'Rapid edits save in order');
    assert.equal(page.document.activeElement, nameField, 'Auto-save retains typing focus');
    click('environment-delete-group'); await settle();
    assert.equal(config.groups.length, 1);
    popup.window.close();
  }
  console.log('PASS: environment detection, URL validation, badge lifecycle, production guard and saved-host switcher in both API branches.');
})().catch(error => { console.error(error); process.exitCode = 1; });

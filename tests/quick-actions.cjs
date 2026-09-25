const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const source = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
(async () => {
  const dom = new JSDOM('<div class="unqorkio-form"></div>', { url:'https://example.test/app', runScripts:'outside-only' });
  const window = dom.window;
  const submission = { data:{} };
  let executions = 0;
  let components = [{ key:'run', execute:async () => { executions++; } }];
  window.angular = { element:() => ({ scope:() => ({ submission, form:{} }), injector:() => { throw new Error('No cache'); } }) };
  window.UnqorkioUtils = { eachComponent:(_forms, visit) => components.forEach(visit) };
  const execute = window.eval(source('quick-actions.js') + '\nrunQuickAction;');
  const run = overrides => execute({ url:window.location.href, action:'set', key:'test', value:'', type:'text', confirmed:true, ...overrides });
  assert((await run({})).ok);
  assert.equal(submission.data.test, '');
  assert((await run({ value:'0', type:'number' })).ok);
  assert.equal(submission.data.test, 0);
  for (const value of ['', 'Infinity', 'nope']) assert.equal((await run({ value, type:'number' })).ok, false);
  assert((await run({ value:'{"active":false}', type:'object' })).ok);
  assert.equal(submission.data.test.active, false);
  for (const value of ['null', 'true', '{bad}']) assert.equal((await run({ value, type:'object' })).ok, false);
  for (const key of ['', ' ', '__proto__', 'constructor', 'prototype']) assert.equal((await run({ key })).ok, false);
  assert.equal((await run({ confirmed:false })).ok, false);
  assert.equal((await run({ production:true })).ok, false);
  assert.equal((await run({ production:true, productionConfirmed:true, blockProduction:true })).ok, false);
  assert((await run({ production:true, productionConfirmed:true })).ok);
  assert.equal((await run({ url:'https://example.test/changed' })).ok, false);
  assert((await run({ key:'literal.dot', value:'yes' })).ok);
  assert.equal(submission.data['literal.dot'], 'yes');
  assert((await run({ action:'remove' })).ok);
  assert.equal((await run({ action:'remove' })).ok, false);
  assert((await run({ action:'trigger', key:'run' })).ok);
  assert.equal(executions, 1);
  components.push(components[0]);
  assert.equal((await run({ action:'trigger', key:'run' })).ok, false);
  components = [{ key:'run', execute:async () => { throw new Error('Failed'); } }];
  assert.equal((await run({ action:'trigger', key:'run' })).ok, false);
  let logs = 0;
  window.console = { log:() => logs++, group:() => {}, groupEnd:() => {}, warn:() => {} };
  assert((await run({ action:'log', confirmed:false })).ok);
  assert((await run({ action:'log', style:'object' })).ok);
  assert.equal(logs, 2);
  window.document.body.innerHTML = '';
  assert.equal((await run({})).ok, false);
  dom.window.close();
  for (const [api, detached, embedded] of [['chrome', false], ['chrome', true], ['browser', false], ['browser', true], ['browser', false, true]]) {
    const popup = new JSDOM(source('popup.html'), { runScripts:'outside-only', url:'https://extension.test/popup.html' + (detached ? '?targetTab=7' : '') });
    let page = popup.window;
    if (embedded) {
      const frame = page.document.createElement('iframe');
      page.document.body.append(frame);
      page = frame.contentWindow;
      page.document.write(source('popup.html'));
      page.document.close();
    }
    let calls = 0;
    page.matchMedia = () => ({ matches:false, addEventListener:() => {} });
    page[api] = {
      storage:{ local:{ get:async () => ({}), set:async () => {} } },
      tabs:{ query:async () => [{ id:7, url:'https://example.test/app' }] },
      runtime:{ sendMessage:async message => {
        if (message.type === 'debug.execute') {
          calls++;
          assert.equal(message.request.url, 'https://example.test/app');
          return { ok:true, result:{ ok:true, message:'Done' } };
        }
        if (message.type === 'debug.access') return { ok:true, granted:false };
        if (message.type === 'debug.permission') return { ok:true, granted:false };
        assert.equal(message.type, 'floating.target');
        return { ok:true, tab:{ id:7, url:'https://example.test/app' } };
      } },
      scripting:{ executeScript:async injection => {
        calls++;
        assert.equal(injection.world, 'MAIN');
        assert.equal(injection.target.tabId, 7);
        assert.equal(injection.args[0].url, 'https://example.test/app');
        return [{ result:{ ok:true, message:'Done' } }];
      } }
    };
    page.eval(['environment.js', 'disabled-controls.js', 'quick-actions.js', 'popup.js', 'quick-popup.js', 'environment-popup.js'].map(source).join('\n'));
    const settle = () => new Promise(resolve => setTimeout(resolve, 0));
    page.document.querySelector('[aria-controls="quick-page"]').click();
    await settle();
    if (detached || embedded) {
      const access = page.document.getElementById('quick-access');
      const controls = page.document.getElementById('quick-controls');
      assert.equal(access.hidden, false);
      assert.equal(controls.disabled, true);
      access.click();
      await settle();
      assert.match(page.document.getElementById('quick-status').textContent, /Approve site access/);
      assert.equal(access.disabled, false);
      page[api].permissions = { request:() => { throw new Error('Request failed'); } };
      access.click();
      await settle();
      assert.match(page.document.getElementById('quick-status').textContent, /Request failed/);
      assert.equal(access.disabled, false);
      page[api].permissions.request = async () => false;
      access.click();
      await settle();
      assert.equal(controls.disabled, true);
      page[api].permissions.request = async ({ origins }) => {
        assert.equal(origins[0], 'https://example.test/*');
        return true;
      };
      access.click();
      await settle();
      assert.equal(controls.disabled, false);
      assert.equal(access.hidden, true);
    }
    assert.equal(page.document.getElementById('panel-inspect').hidden, false);
    page.document.getElementById('tab-data').click();
    page.document.getElementById('property-key').value = 'test';
    const button = page.document.querySelector('[data-quick-action="set"]');
    button.click();
    await settle();
    assert.equal(calls, 0);
    assert.equal(page.document.getElementById('debug-confirmation').hidden, false);
    page.document.getElementById('cancel-action').click();
    assert.equal(page.document.getElementById('debug-confirmation').hidden, true);
    button.click();
    page.document.getElementById('property-value').dispatchEvent(new page.Event('input', { bubbles:true }));
    assert.equal(page.document.getElementById('debug-confirmation').hidden, true);
    button.click();
    page.document.getElementById('confirm-action').click();
    await settle();
    assert.equal(calls, 1);
    assert.equal(page.document.getElementById('debug-confirmation').hidden, true);
    assert.equal(page.document.querySelector('#panel-data .debug-feedback').textContent, 'Done');
    page.document.getElementById('tab-data').dispatchEvent(new page.KeyboardEvent('keydown', { key:'ArrowRight', bubbles:true }));
    assert.equal(page.document.getElementById('panel-execute').hidden, false);
    page.document.getElementById('component-key').value = 'run';
    page.document.querySelector('[data-quick-action="trigger"]').click();
    page.document.dispatchEvent(new page.KeyboardEvent('keydown', { key:'Escape', bubbles:true }));
    assert.equal(page.document.getElementById('debug-confirmation').hidden, true);
    assert.equal(page.document.getElementById('quick-page').hidden, false);
    page.document.getElementById('quick-back').click();
    assert.equal(page.document.getElementById('quick-page').hidden, true);
    popup.window.close();
  }
  console.log('PASS: debug tools validation, mutation, execution failures, logging and both popup API branches.');
})().catch(error => { console.error(error); process.exitCode = 1; });

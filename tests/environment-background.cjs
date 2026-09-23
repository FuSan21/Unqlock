const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
(async () => {
  for (const apiName of ['chrome', 'browser']) {
    let stored;
    let messageListener;
    let granted = new Set();
    let registrations = [];
    let floating;
    let popupCalls = [];
    let session = {};
    let pageUrl = 'https://first-prod.unqork.io/app';
    let popupWindows = [];
    const events = {};
    const event = key => ({ addListener:fn => { events[key] = fn; } });
    const api = {
      storage:{
        local:{ get:async () => ({ environment:structuredClone(stored), floating }), set:async value => { stored = structuredClone(value.environment); } },
        session:{
          get:async key => (key in session ? { [key]:session[key] } : {}),
          set:async value => { Object.assign(session, value); },
          remove:async key => { delete session[key]; }
        }
      },
      runtime:{
        getURL:file => 'extension://test/' + file,
        onMessage:{ addListener:fn => { messageListener = fn; } },
        onStartup:event('startup'), onInstalled:event('installed')
      },
      permissions:{ contains:async ({ origins }) => origins.every(origin => granted.has(origin)), onAdded:event('added'), onRemoved:event('removed') },
      scripting:{
        getRegisteredContentScripts:async () => registrations,
        registerContentScripts:async scripts => { assert.equal(registrations.length, 0); registrations = scripts; },
        updateContentScripts:async scripts => { assert.equal(registrations.length, 1); registrations = scripts; },
        unregisterContentScripts:async () => { registrations = []; },
        executeScript:async () => []
      },
      // Without host access a real browser omits url, so only the page itself can report it.
      tabs:{
        query:async () => [], get:async id => ({ id, windowId:3, active:true }),
        sendMessage:async (id, message, options) => {
          assert.equal(message.type, 'floating.source');
          assert.equal(options.frameId, 0);
          if (!pageUrl) throw new Error('Receiving end does not exist.');
          return { ok:true, url:pageUrl };
        },
        onRemoved:event('removed-tab')
      },
      action:{ openPopup:async options => { popupCalls.push(options); } },
      windows:{ create:async options => { popupWindows.push(options); } }
    };
    const context = vm.createContext({ [apiName]:api, URL });
    vm.runInContext(source('environment.js') + '\n' + source('environment-background.js'), context);
    const popup = { url:'extension://test/popup.html' };
    const send = (message, sender = popup) => new Promise(resolve => {
      if (messageListener(message, sender, resolve) !== true) resolve(undefined);
    });
    const visit = hostname => send({ type:'environment.observe', hostname:'ignored-prod.unqork.io' }, { url:'https://' + hostname + '/app', frameId:0 });
    const embedded = { url:'extension://test/popup.html', frameId:2, tab:{id:7} };
    const page = { url:pageUrl, frameId:0, tab:{id:7} };
    assert.equal((await send({type:'floating.target'}, embedded)).tab.id, 7);
    assert.equal((await send({type:'floating.target'}, embedded)).tab.url, 'https://first-prod.unqork.io/app');
    assert.equal(await send({type:'floating.target'}, {...embedded, url:'https://evil.test/'}), undefined);
    assert.equal(await send({type:'floating.target'}, {...embedded, frameId:0}), undefined);
    // Only the page's own top frame may report an address, and it survives a worker restart.
    assert.equal((await send({ type:'floating.open' }, page)).ok, true);
    assert.equal(session['floating.source.7'], pageUrl);
    assert.equal(await send({ type:'floating.open' }, { ...page, frameId:2 }), undefined);
    assert.equal(await send({ type:'floating.open' }, { ...page, url:'about:blank' }), undefined);
    assert.equal(await send({ type:'floating.open' }, { url:pageUrl, frameId:0 }), undefined);
    pageUrl = '';
    assert.equal((await send({type:'floating.target'}, embedded)).tab.url, 'https://first-prod.unqork.io/app');
    events['removed-tab'](7);
    assert.equal('floating.source.7' in session, false);
    assert.equal((await send({type:'floating.target'}, embedded)).ok, false);
    pageUrl = 'https://first-prod.unqork.io/app';
    // Simultaneous visits cannot lose hosts, and the sender supplies the trusted URL.
    await Promise.all([visit('first-staging.unqork.io'), visit('first-prod.unqork.io'), visit('second-qa.unqork.io')]);
    assert.equal(stored.groups.length, 2);
    assert.equal(stored.groups[0].domains.length, 2);
    assert.equal(stored.groups.flatMap(group => group.domains).some(domain => domain.hostname.startsWith('ignored')), false);
    const before = JSON.stringify(stored);
    assert.equal(await send({ type:'environment.save', deleteId:stored.groups[0].id }, { url:'https://first-prod.unqork.io/app', frameId:0 }), undefined);
    assert.equal(await send({ type:'environment.observe' }, { url:'https://third-prod.unqork.io/app', frameId:1 }), undefined);
    assert.equal(JSON.stringify(stored), before);
    const custom = { id:'custom', name:'Custom', domains:[{ hostname:'custom.test', environment:'production' }] };
    let result = await send({ type:'environment.save', group:custom });
    assert.equal(result.ok, true);
    assert.equal(result.missingOrigins[0], '*://custom.test/*');
    assert.equal(registrations.length, 0);
    granted.add('*://custom.test/*');
    events.added();
    result = await send({ type:'environment.read' });
    assert.equal(result.missingOrigins.length, 0);
    assert.equal(registrations[0].persistAcrossSessions, true);
    assert.equal(registrations[0].matches[0], '*://custom.test/*');
    events.startup();
    await send({ type:'environment.read' });
    assert.equal(registrations.length, 1);
    granted.clear();
    events.removed();
    await send({ type:'environment.read' });
    assert.equal(registrations.length, 0);
    assert(stored.groups.some(group => group.id === 'custom'), 'Revocation preserves mappings');
    granted.add('*://custom.test/*');
    await send({ type:'environment.sync' });
    assert.equal(registrations.length, 1);
    await send({ type:'environment.save', deleteId:'custom' });
    assert.equal(registrations.length, 0, 'Deleting groups unregisters their custom domains');
    const edited = structuredClone(stored.groups[0]);
    edited.domains[0].environment = 'uat';
    await send({ type:'environment.save', group:edited });
    await visit('first-staging.unqork.io');
    assert.equal(stored.groups[0].domains[0].environment, 'uat');
    await send({ type:'environment.save', preferences:{ autoDiscover:false } });
    await visit('third-qa.unqork.io');
    assert.equal(stored.groups.length, 2);
    const duplicate = { id:'bad', name:'Bad', domains:[stored.groups[0].domains[0]] };
    assert.equal((await send({ type:'environment.save', group:duplicate })).ok, false);
    assert.equal(stored.groups.length, 2);
  }
  console.log('PASS: serialized discovery, group edits, sender validation, persistent custom-domain registration, grants, revocation, deletion and startup in both API branches.');
})().catch(error => { console.error(error); process.exitCode = 1; });

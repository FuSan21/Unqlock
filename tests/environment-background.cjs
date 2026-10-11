const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const background = fs.readFileSync(path.join(__dirname, '../dist/chrome/background.js'), 'utf8');
(async () => {
  for (const apiName of ['chrome', 'browser']) {
    let stored;
    let messageListener;
    let granted = new Set();
    // Every registered script; the environment badge's is the one most checks look at.
    let scripts = [];
    const registrations = () => scripts.filter(script => script.id === 'unqlock-custom-environments');
    let overlayOn;
    let openTabs = [];
    const injected = [];
    let floating;
    let popupCalls = [];
    let session = {};
    let pageUrl = 'https://first-prod.unqork.io/app';
    let popupWindows = [];
    let temporaryAccess = false;
    let injection;
    const events = {};
    const event = key => ({ addListener:fn => { events[key] = fn; } });
    const api = {
      storage:{
        onChanged:event('changed'),
        local:{ get:async () => ({ environment:structuredClone(stored), floating, devOverlayDetach:overlayOn }), set:async value => { stored = structuredClone(value.environment); } },
        session:{
          get:async key => (key in session ? { [key]:session[key] } : {}),
          set:async value => { Object.assign(session, value); },
          remove:async key => { delete session[key]; }
        }
      },
      runtime:{
        ...(apiName === 'browser' ? { getBrowserInfo:async () => ({ name:'Firefox' }) } : {}),
        getURL:file => 'extension://test/' + file.replace(/^\//, ''),
        onMessage:{ addListener:fn => { messageListener = fn; } },
        onStartup:event('startup'), onInstalled:event('installed')
      },
      permissions:{ contains:async ({ origins }) => origins.every(origin => granted.has(origin)), onAdded:event('added'), onRemoved:event('removed') },
      scripting:{
        getRegisteredContentScripts:async ({ ids }) => scripts.filter(script => ids.includes(script.id)),
        registerContentScripts:async added => {
          for (const script of added) assert(!scripts.some(existing => existing.id === script.id), 'Already registered: ' + script.id);
          scripts = [...scripts, ...added];
        },
        updateContentScripts:async updated => {
          for (const script of updated) assert(scripts.some(existing => existing.id === script.id), 'Not registered: ' + script.id);
          scripts = scripts.map(existing => updated.find(script => script.id === existing.id) || existing);
        },
        unregisterContentScripts:async ({ ids }) => { scripts = scripts.filter(script => !ids.includes(script.id)); },
        insertCSS:async options => { injected.push(options.files[0]); },
        executeScript:async options => {
          if (options.files) { injected.push(options.files[0]); return []; }
          injection = options;
          if (options.world === 'MAIN') return [{ result:{ ok:true, message:'Done' } }];
          if (!temporaryAccess) throw new Error('Missing host permission');
          return [{ result:true }];
        }
      },
      // Without host access a real browser omits url, so only the page itself can report it.
      tabs:{
        query:async () => openTabs, get:async id => ({ id, windowId:3, active:true }),
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
    vm.runInContext(background, context);
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
    assert.equal(popupWindows.length, 0, 'The badge keeps its embedded menu in both browsers');
    assert.equal((await send({type:'debug.access'}, embedded)).granted, false);
    temporaryAccess = true;
    assert.equal((await send({type:'debug.access'}, embedded)).granted, true);
    assert.equal((await send({type:'debug.permission'}, embedded)).granted, true);
    assert.equal(popupWindows.length, 0, 'Temporary access needs no permission window');
    temporaryAccess = false;
    granted.add('https://first-prod.unqork.io/*');
    assert.equal((await send({type:'debug.permission'}, embedded)).granted, true);
    assert.equal(popupWindows.length, 0, 'Saved access needs no permission window');
    granted.clear();
    assert.equal((await send({type:'debug.permission'}, embedded)).granted, false);
    assert.equal(popupWindows[0].url, 'extension://test/popup.html?targetTab=7&permission=debug');
    const request = { action:'log', url:pageUrl };
    assert.equal((await send({type:'debug.execute', request}, embedded)).result.ok, true);
    assert.equal(injection.target.tabId, 7);
    assert.equal(injection.world, 'MAIN');
    assert.equal(injection.func.name, 'runQuickAction');
    assert.equal((await send({type:'debug.execute', request:{...request, url:'https://evil.test/'}}, embedded)).ok, false);
    assert.equal((await send({type:'debug.execute', request:{...request, action:'set'}}, embedded)).ok, false);
    assert.equal(await send({type:'debug.execute', request}, page), undefined);
    const detached = { url:'extension://test/popup.html?targetTab=7', frameId:0, tab:{id:99} };
    assert.equal((await send({type:'floating.target'}, detached)).tab.id, 7);
    assert.equal(await send({type:'floating.target'}, {...detached, frameId:2}), undefined);
    assert.equal(await send({type:'floating.target'}, {...detached, url:'extension://test/popup.html?targetTab=bad'}), undefined);
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
    assert.equal(registrations().length, 0);
    granted.add('*://custom.test/*');
    events.added();
    result = await send({ type:'environment.read' });
    assert.equal(result.missingOrigins.length, 0);
    assert.equal(registrations()[0].persistAcrossSessions, true);
    assert.equal(registrations()[0].matches[0], '*://custom.test/*');
    events.startup();
    await send({ type:'environment.read' });
    assert.equal(registrations().length, 1);
    granted.clear();
    events.removed();
    await send({ type:'environment.read' });
    assert.equal(registrations().length, 0);
    assert(stored.groups.some(group => group.id === 'custom'), 'Revocation preserves mappings');
    granted.add('*://custom.test/*');
    await send({ type:'environment.sync' });
    assert.equal(registrations().length, 1);
    await send({ type:'environment.save', deleteId:'custom' });
    assert.equal(registrations().length, 0, 'Deleting groups unregisters their custom domains');
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
    // Imports replace every group and preference, and register any granted custom domain.
    const imported = { badge:true, blockProduction:true, autoDiscover:true, groups:[custom] };
    result = await send({ type:'environment.save', replace:imported });
    assert.deepEqual(stored, imported);
    assert.equal(registrations()[0].matches[0], '*://custom.test/*');
    assert.equal((await send({ type:'environment.save', replace:{ groups:[duplicate, { ...duplicate, id:'other' }] } })).ok, false);
    assert.deepEqual(stored, imported, 'An invalid import changes nothing');
    assert.equal(await send({ type:'environment.save', replace:{ groups:[] } }, { url:'https://first-prod.unqork.io/app', frameId:0 }), undefined, 'Websites cannot replace settings');

    // Detach dev overlay registers its two scripts only while it is on, and adds the button to open
    // builder tabs when turned on. Environment messages share the queue, so one marks the sync done.
    const overlayScripts = () => scripts.filter(script => script.id.startsWith('unqlock-dev-overlay')).map(script => script.id).sort();
    const settled = () => send({ type:'environment.read' });
    openTabs = [{ id:9, url:'https://first-prod.unqork.io/ide/' }];
    events.startup();
    await settled();
    assert.deepEqual(overlayScripts(), [], 'Off by default');
    // On without its site access registers nothing.
    overlayOn = true;
    events.changed({ devOverlayDetach:{ newValue:true } }, 'local');
    await settled();
    assert.deepEqual(overlayScripts(), []);
    assert.equal(injected.length, 0);
    granted.add('https://*.unqork.io/*');
    events.changed({ devOverlayDetach:{ newValue:true } }, 'local');
    await settled();
    assert.deepEqual(overlayScripts(), ['unqlock-dev-overlay', 'unqlock-dev-overlay-guard']);
    const guard = scripts.find(script => script.id === 'unqlock-dev-overlay-guard');
    assert.equal(guard.world, 'MAIN');
    assert.equal(guard.runAt, 'document_start');
    assert.deepEqual([...guard.matches], ['https://*.unqork.io/*']);
    assert.deepEqual(injected.sort(), ['/content-scripts/dev-overlay.css', '/content-scripts/dev-overlay.js']);
    assert.equal(registrations().length, 1, 'The environment registration is untouched');
    // A restart reconciles without injecting again, and other storage changes are ignored.
    events.startup();
    events.changed({ floating:{ newValue:{} } }, 'local');
    await settled();
    assert.equal(injected.length, 2);
    assert.deepEqual(overlayScripts(), ['unqlock-dev-overlay', 'unqlock-dev-overlay-guard']);
    // Revoking the access unregisters them, without touching the custom-domain badge.
    granted.delete('https://*.unqork.io/*');
    events.removed();
    await settled();
    assert.deepEqual(overlayScripts(), []);
    assert.equal(registrations().length, 1);
    granted.add('https://*.unqork.io/*');
    events.added();
    await settled();
    assert.deepEqual(overlayScripts(), ['unqlock-dev-overlay', 'unqlock-dev-overlay-guard']);
    overlayOn = false;
    events.changed({ devOverlayDetach:{ newValue:false } }, 'local');
    await settled();
    assert.deepEqual(overlayScripts(), []);
    assert.equal(registrations().length, 1);
    openTabs = [];
  }
  console.log('PASS: serialized discovery, group edits, sender validation, persistent custom-domain registration, Detach dev overlay registration, grants, revocation, deletion, imports and startup in both API branches.');
})().catch(error => { console.error(error); process.exitCode = 1; });

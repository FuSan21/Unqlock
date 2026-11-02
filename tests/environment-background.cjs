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
    let debuggerOn;
    // The debugger windows opened and focused.
    const focused = [];
    const closedWindows = new Set();
    let windowCount = 50;
    let refuseMaximized = false;
    let openTabs = [];
    const injected = [];
    let floating;
    let popupCalls = [];
    let session = {};
    let pageUrl = 'https://first-prod.unqork.io/app';
    let popupWindows = [];
    let temporaryAccess = false;
    let injection;
    // Pages told that access was granted in the prompt window.
    const notices = [];
    const events = {};
    const event = key => ({ addListener:fn => { events[key] = fn; } });
    const api = {
      storage:{
        onChanged:event('changed'),
        local:{ get:async () => ({ environment:structuredClone(stored), floating, devOverlayDetach:overlayOn, sseDebugger:debuggerOn }), set:async value => {
          if ('environment' in value) stored = structuredClone(value.environment);
          if ('devOverlayDetach' in value) overlayOn = value.devOverlayDetach;
          if ('sseDebugger' in value) debuggerOn = value.sseDebugger;
        } },
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
      permissions:{ contains:async ({ origins }) => origins.every(origin => granted.has(origin)), remove:async ({ origins }) => { origins.forEach(origin => granted.delete(origin)); return true; }, onAdded:event('added'), onRemoved:event('removed') },
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
          if (message.type === 'access.changed') { notices.push({ tab:id, kind:message.kind }); return { ok:true }; }
          assert.equal(message.type, 'floating.source');
          assert.equal(options.frameId, 0);
          if (!pageUrl) throw new Error('Receiving end does not exist.');
          return { ok:true, url:pageUrl };
        },
        onRemoved:event('removed-tab')
      },
      action:{ openPopup:async options => { popupCalls.push(options); } },
      windows:{
        create:async options => {
          if (options.state && refuseMaximized) throw new Error('Invalid value for state');
          popupWindows.push(options);
          return { id:++windowCount };
        },
        update:async (id, options) => { if (closedWindows.has(id)) throw new Error('No window with id: ' + id); focused.push([id, options]); },
        onRemoved:event('removed-window')
      }
    };
    const context = vm.createContext({ [apiName]:api, URL, URLSearchParams });
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
    assert.equal(popupWindows[0].url, 'extension://test/prompt.html?kind=debug&tab=7');
    assert.equal(popupWindows[0].type, 'popup');
    // The prompt window asks the background what to request; its address names only the kind and tab.
    const prompt = { url:'extension://test/prompt.html?kind=debug&tab=7', frameId:0, tab:{ id:40 } };
    const described = await send({ type:'prompt.describe', kind:'debug', tab:'7' }, prompt);
    assert.deepEqual([...described.origins], ['https://first-prod.unqork.io/*']);
    assert.equal(described.host, 'first-prod.unqork.io');
    assert.equal(await send({ type:'prompt.describe', kind:'debug', tab:'7' }, popup), undefined, 'Only the prompt window describes a request');
    assert.equal(await send({ type:'prompt.describe', kind:'everything', tab:'7' }, prompt), undefined);
    assert.equal(await send({ type:'prompt.describe', kind:'debug', tab:'-1' }, prompt), undefined);
    assert.equal((await send({ type:'prompt.granted', kind:'debug', tab:'7' }, prompt)).ok, false, 'A grant the browser does not hold finishes nothing');
    assert.equal(notices.length, 0);
    granted.add('https://first-prod.unqork.io/*');
    assert.equal((await send({ type:'prompt.granted', kind:'debug', tab:'7' }, prompt)).ok, true);
    assert.deepEqual(notices, [{ tab:7, kind:'debug' }], 'The floating menu learns through its page');
    granted.clear();
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

    // Detach dev overlay, custom-domain badges and Firefox file imports open the prompt window too.
    const prompted = () => popupWindows.at(-1);
    const overlayPrompt = { ...prompt, url:'extension://test/prompt.html?kind=devOverlay&tab=7' };
    granted.delete('https://*.unqork.io/*');
    assert.equal((await send({ type:'prompt.open', kind:'devOverlay' }, embedded)).granted, false);
    assert.equal(prompted().url, 'extension://test/prompt.html?kind=devOverlay&tab=7', 'A floating menu names its tab');
    assert.deepEqual([...(await send({ type:'prompt.describe', kind:'devOverlay' }, overlayPrompt)).origins], ['https://*.unqork.io/*']);
    assert.equal((await send({ type:'prompt.open', kind:'import' }, popup)).ok, true);
    assert.equal(prompted().url, 'extension://test/prompt.html?kind=import', 'A toolbar popup names no tab');
    assert.equal(prompted().width, 460);
    assert.equal(await send({ type:'prompt.open', kind:'debug' }, popup), undefined, 'Debug tools go through debug.permission');
    assert.equal(await send({ type:'prompt.open', kind:'import' }, { url:'https://evil.test/', frameId:0, tab:{ id:7 } }), undefined);
    // Granting turns the option on in the background, since a Firefox toolbar popup has closed by then.
    granted.add('https://*.unqork.io/*');
    notices.length = 0;
    assert.equal((await send({ type:'prompt.granted', kind:'devOverlay', tab:'7' }, overlayPrompt)).ok, true);
    assert.equal(overlayOn, true);
    assert.deepEqual(notices, [{ tab:7, kind:'devOverlay' }]);
    // The option itself is read and changed here, for menus without a permissions API.
    assert.deepEqual({ ...await send({ type:'devOverlay.state' }, embedded) }, { ok:true, on:true });
    assert.equal(await send({ type:'devOverlay.state' }, page), undefined, 'Pages cannot read it');
    assert.equal(await send({ type:'devOverlay.set', on:false }, { url:'https://evil.test/', frameId:0, tab:{ id:7 } }), undefined);
    assert.deepEqual({ ...await send({ type:'devOverlay.set', on:false }, embedded) }, { ok:true, on:false });
    assert.equal(overlayOn, false);
    assert(!granted.has('https://*.unqork.io/*'), 'Turning it off gives the access back');
    assert.deepEqual({ ...await send({ type:'devOverlay.set', on:true }, embedded) }, { ok:true, on:false, needsAccess:true }, 'On needs the access first');
    assert.equal(overlayOn, false);
    granted.add('https://*.unqork.io/*');
    assert.deepEqual({ ...await send({ type:'devOverlay.set', on:true }, embedded) }, { ok:true, on:true });
    assert.equal(overlayOn, true);
    const windows = popupWindows.length;
    assert.equal((await send({ type:'prompt.open', kind:'devOverlay' }, popup)).granted, true, 'Access already held needs no window');
    assert.equal(popupWindows.length, windows);
    // The Unqlock SSE debugger shares the dev overlay's isolated script and access: that script is registered
    // while either option is on, the MAIN-world guard only for Detach.
    granted.add('https://*.unqork.io/*');
    overlayOn = false;
    debuggerOn = true;
    events.changed({ sseDebugger:{ newValue:true } }, 'local');
    await settled();
    assert.deepEqual(overlayScripts(), ['unqlock-dev-overlay']);
    overlayOn = true;
    events.changed({ devOverlayDetach:{ newValue:true } }, 'local');
    await settled();
    assert.deepEqual(overlayScripts(), ['unqlock-dev-overlay', 'unqlock-dev-overlay-guard']);
    // Turning Detach off keeps the access the debugger needs.
    assert.deepEqual({ ...await send({ type:'devOverlay.set', on:false }, embedded) }, { ok:true, on:false });
    assert(granted.has('https://*.unqork.io/*'), 'The debugger still needs the access');
    assert.deepEqual({ ...await send({ type:'devOverlay.state', option:'debugger' }, embedded) }, { ok:true, on:true });
    events.changed({ devOverlayDetach:{ newValue:false } }, 'local');
    await settled();
    assert.deepEqual(overlayScripts(), ['unqlock-dev-overlay']);

    // Open in Unqlock debugger: one window per builder tab, maximized; a second click focuses it.
    const builder = { url:'https://first-staging.unqork.io/ide/builder/workspaces/w/modules/646125c9ce236b1c9e80986d', frameId:0, tab:{ id:9 } };
    const workArea = { left:1920, top:0, width:2560, height:1400 };
    const windowsBefore = popupWindows.length;
    assert.equal((await send({ type:'sse.open', ...workArea }, builder)).ok, true);
    const opened = popupWindows.at(-1);
    assert.deepEqual(JSON.parse(JSON.stringify(opened)), { url:'extension://test/sse.html?tab=9', type:'popup', state:'maximized' });
    assert.equal((await send({ type:'sse.open' }, builder)).ok, true);
    assert.equal(popupWindows.length, windowsBefore + 1, 'A second click focuses the open window');
    assert.deepEqual(JSON.parse(JSON.stringify(focused.at(-1))), [windowCount, { focused:true }]);
    const closeDebugger = async () => {
      closedWindows.add(windowCount);
      events['removed-window'](windowCount);
      await new Promise(resolve => setTimeout(resolve, 0));
    };
    await closeDebugger();
    // Where a maximized popup is refused, it covers the work area the page reported, on that page's screen.
    refuseMaximized = true;
    assert.equal((await send({ type:'sse.open', ...workArea }, builder)).ok, true);
    assert.equal(popupWindows.length, windowsBefore + 2, 'A closed window is opened again');
    assert.deepEqual(JSON.parse(JSON.stringify(popupWindows.at(-1))), { url:'extension://test/sse.html?tab=9', type:'popup', ...workArea });
    await closeDebugger();
    // Without a usable work area, the fallback size.
    assert.equal((await send({ type:'sse.open', width:'wide' }, builder)).ok, true);
    assert.deepEqual(JSON.parse(JSON.stringify(popupWindows.at(-1))), { url:'extension://test/sse.html?tab=9', type:'popup', width:1280, height:800 });
    refuseMaximized = false;
    assert.equal(await send({ type:'sse.open' }, { ...builder, frameId:3 }), undefined, 'Only the top frame');
    assert.equal(await send({ type:'sse.open' }, { ...builder, url:'https://evil.test/ide/' }), undefined, 'Only Unqork pages');
    assert.equal(await send({ type:'sse.open' }, embedded), undefined);
    debuggerOn = false;
    assert.equal((await send({ type:'sse.open' }, builder)).ok, false, 'Not while the option is off');
    debuggerOn = true;

    // The window reads and runs its tab itself (src/popup/sse/tab.ts), so the background answers neither.
    const debuggerWindow = { url:'extension://test/sse.html?tab=9', frameId:0, tab:{ id:60 } };
    assert.equal(await send({ type:'sse.context', tab:9 }, debuggerWindow), undefined);
    assert.equal(await send({ type:'sse.execute', tab:9, request:{} }, debuggerWindow), undefined);
    debuggerOn = false;
    events.changed({ sseDebugger:{ newValue:false } }, 'local');
    await settled();
    assert.deepEqual(overlayScripts(), []);
    // Badges ask for the saved custom domains still missing, then register and inject them.
    granted.delete('*://custom.test/*');
    assert.equal((await send({ type:'prompt.open', kind:'badges' }, popup)).granted, false);
    const badgePrompt = { ...prompt, url:'extension://test/prompt.html?kind=badges' };
    assert.deepEqual([...(await send({ type:'prompt.describe', kind:'badges' }, badgePrompt)).origins], ['*://custom.test/*']);
    granted.add('*://custom.test/*');
    openTabs = [{ id:12, url:'https://custom.test/app' }];
    injected.length = 0;
    assert.equal((await send({ type:'prompt.granted', kind:'badges' }, badgePrompt)).ok, true);
    assert.equal(registrations()[0].matches[0], '*://custom.test/*');
    assert(injected.includes('/content-scripts/environment-badge.js'), 'Open tabs on the domain get the badge');
    openTabs = [];
    // The prompt window imports settings files through the same environment messages.
    assert.equal((await send({ type:'environment.read' }, { ...prompt, url:'extension://test/prompt.html?kind=import' })).ok, true);
  }
  console.log('PASS: serialized discovery, group edits, sender validation, persistent custom-domain registration, Detach dev overlay and SSE debugger registration, debugger windows, prompt window requests and grants, revocation, deletion, imports and startup in both API branches.');
})().catch(error => { console.error(error); process.exitCode = 1; });

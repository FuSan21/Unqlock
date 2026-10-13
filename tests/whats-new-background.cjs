const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const background = fs.readFileSync(path.join(__dirname, '../dist/chrome/background.js'), 'utf8');

// Loads the built background as one installed version, with What's new storage as given.
function load(apiName, version, whatsNew) {
  const events = {};
  const event = key => ({ addListener:fn => { events[key] = fn; } });
  const state = { whatsNew, badge:undefined };
  const api = {
    storage:{ onChanged:event('changed'), local:{
      get:async key => (key === 'whatsNew' ? (state.whatsNew ? { whatsNew:structuredClone(state.whatsNew) } : {}) : {}),
      set:async value => { if ('whatsNew' in value) state.whatsNew = structuredClone(value.whatsNew); }
    } },
    runtime:{ getManifest:() => ({ version }), getURL:file => 'extension://test/' + file, onMessage:event('message'), onStartup:event('startup'), onInstalled:event('installed') },
    permissions:{ contains:async () => false, onAdded:event('added'), onRemoved:event('removed') },
    scripting:{ getRegisteredContentScripts:async () => [], unregisterContentScripts:async () => {} },
    tabs:{ query:async () => [], onRemoved:event('removed-tab') },
    action:{ setBadgeText:async ({ text }) => { state.badge = text; }, setBadgeBackgroundColor:async () => {} }
  };
  vm.runInContext(background, vm.createContext({ [apiName]:api, URL, URLSearchParams }));
  const settle = () => new Promise(resolve => setTimeout(resolve, 20));
  return {
    state,
    install:async (reason, previousVersion) => { events.installed({ reason, previousVersion }); await settle(); },
    startup:async () => { events.startup(); await settle(); }
  };
}

(async () => {
  for (const apiName of ['chrome', 'browser']) {
    // A fresh install has nothing to announce.
    let run = load(apiName, '1.6.0');
    await run.install('install');
    assert.deepEqual(run.state.whatsNew, { seen:'1.6.0', badge:false });
    assert.equal(run.state.badge, '');

    // Updating from a version before What's new, which stored nothing, starts from previousVersion.
    run = load(apiName, '1.6.0');
    await run.install('update', '1.5.0');
    assert.deepEqual(run.state.whatsNew, { seen:'1.5.0', badge:true });
    assert.equal(run.state.badge, 'NEW');
    // The badge is restored after a browser restart until the popup clears it.
    run = load(apiName, '1.6.0', run.state.whatsNew);
    await run.startup();
    assert.equal(run.state.badge, 'NEW');

    // A patch alone brings no notice; its notes wait to be read.
    run = load(apiName, '1.3.3');
    await run.install('update', '1.3.2');
    assert.deepEqual(run.state.whatsNew, { seen:'1.3.2', badge:false });
    assert.equal(run.state.badge, '');

    // Unread notes from earlier updates are kept, and a cleared badge returns only with a new minor release.
    run = load(apiName, '1.6.0', { seen:'1.4.0', badge:false });
    await run.install('update', '1.5.0');
    assert.deepEqual(run.state.whatsNew, { seen:'1.4.0', badge:true });
    run = load(apiName, '1.6.0', { seen:'1.6.0', badge:false });
    await run.install('update', '1.6.0');
    assert.deepEqual(run.state.whatsNew, { seen:'1.6.0', badge:false });

    // Browser updates and a malformed stored value change nothing they should not.
    run = load(apiName, '1.6.0', { seen:'nonsense', badge:'yes' });
    await run.install('browser_update');
    assert.equal(run.state.badge, '');
    run = load(apiName, '1.6.0', { seen:'nonsense' });
    await run.install('update', '1.5.0');
    assert.deepEqual(run.state.whatsNew, { seen:'1.5.0', badge:true });
  }
  console.log("PASS: What's new starting points for installs, updates from older versions and patches, and the toolbar badge across restarts in both API branches.");
})().catch(error => { console.error(error); process.exitCode = 1; });

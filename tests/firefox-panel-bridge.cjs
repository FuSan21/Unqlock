const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { firefox } = require('playwright');
const { buildSync } = require('esbuild');

(async () => {
  const bundle = buildSync({entryPoints:[path.join(__dirname,'fixtures/builder-panels.jsx')],bundle:true,write:false,format:'iife'}).outputFiles[0].text;
  let report;
  const completed = new Promise(resolve => { report = resolve; });
  const server = http.createServer((req,res) => {
    if (req.url === '/report') {
      let body = ''; req.on('data',part => { body += part; });
      req.on('end',() => { report(JSON.parse(body)); res.end('ok'); });
    } else {
      res.setHeader('Content-Type','text/html');
      res.end('<!doctype html><style>body{margin:0;width:2560px}</style><div id="root"></div><script>' + bundle.replace(/<\/script/gi,'<\\/script') + '</script>');
    }
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(),'unqlock-firefox-bridge-'));
  let runner;
  let timer;
  try {
    fs.cpSync(path.resolve(__dirname,'../dist/firefox'),sourceDir,{recursive:true});
    const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir,'manifest.json')));
    // Test-only host access; the shipped manifest is unchanged.
    for (const entry of manifest.content_scripts) entry.matches.push('http://127.0.0.1/*');
    manifest.host_permissions = ['http://127.0.0.1/*'];
    manifest.background.scripts.push('bridge-check.js');
    fs.writeFileSync(path.join(sourceDir,'manifest.json'),JSON.stringify(manifest));
    fs.writeFileSync(path.join(sourceDir,'bridge-check.js'), `
      (async () => {
        let result;
        try {
          await browser.storage.local.set({builderPanels:{agent:{sizing:'custom',width:420}}});
          const tab = await browser.tabs.create({url:${JSON.stringify(origin + '/ide/builder/workspaces/test/modules/first')}});
          const end = Date.now() + 20000;
          while (Date.now() < end) {
            try {
              const measured = await browser.tabs.sendMessage(tab.id,{type:'panels.measure'});
              if (Math.abs(measured.widths.agent - 420) < 4) { result = {ok:true,width:measured.widths.agent}; break; }
              result = {ok:false,measured};
            } catch (error) { result = {ok:false,error:String(error)}; }
            await new Promise(resolve => setTimeout(resolve,100));
          }
        } catch (error) { result = {ok:false,error:String(error)}; }
        await fetch(${JSON.stringify(origin + '/report')},{method:'POST',body:JSON.stringify(result)});
      })();
    `);
    const { default:webExt } = await import('web-ext');
    runner = await webExt.cmd.run({sourceDir,firefox:process.env.FIREFOX_PATH || firefox.executablePath(),target:['firefox-desktop'],args:['-headless'],noInput:true,noReload:true,startUrl:['about:blank']});
    const result = await Promise.race([completed,new Promise((_,reject) => {timer=setTimeout(() => reject(new Error('Firefox bridge test timed out')),30000);})]);
    assert.equal(result.ok,true,JSON.stringify(result));
    console.log('PASS: installed Firefox extension resizes through the isolated-to-MAIN bridge.');
  } finally {
    clearTimeout(timer);
    if (runner) await runner.exit();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(sourceDir,{recursive:true,force:true});
  }
})().catch(error => {console.error(error);process.exitCode=1;});

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const project = path.resolve(__dirname, '..');
const tool = file => path.join(project, 'node_modules', file);
// Type checks and jsdom unit tests come first. Every test after the build reads dist/.
for (const [script, args] of [
  [tool('typescript/bin/tsc'), ['-p', '.']],
  [tool('vitest/vitest.mjs'), ['run']],
  ['../tests/version.cjs', []], ['../tests/quick-actions.cjs', []], ['build.cjs', []], ['../tests/build.cjs', []],
  ['../tests/environment.cjs', []], ['../tests/environment-background.cjs', []],
  ['../tests/behavior.cjs', []], ['../tests/behavior.cjs', ['--firefox']], ['../tests/chrome.cjs', []],
  ['../tests/canvas-toolbar.cjs', []], ['../tests/canvas-toolbar.cjs', ['--firefox']],
  ['../tests/builder-panels.cjs', []], ['../tests/builder-panels.cjs', ['--firefox']],
  ['../tests/environment-browser.cjs', []], ['../tests/firefox-panel-bridge.cjs', []], ['../tests/firefox-package.cjs', []]
]) {
  const result = spawnSync(process.execPath, [path.resolve(__dirname, script), ...args], { cwd:project, stdio:'inherit', timeout:5 * 60 * 1000, killSignal:'SIGKILL' });
  if (result.error?.code === 'ETIMEDOUT') console.error(`TIMEOUT: ${path.basename(script)} ${args.join(' ')} did not finish within 5 minutes.`);
  if (result.status !== 0) process.exit(result.status || 1);
}

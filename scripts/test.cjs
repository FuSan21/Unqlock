const { spawnSync } = require('node:child_process');
const path = require('node:path');
for (const [script, args] of [['../tests/version.cjs', []], ['../tests/quick-actions.cjs', []], ['../tests/environment.cjs', []], ['../tests/environment-background.cjs', []], ['build.cjs', []], ['../tests/build.cjs', []], ['../tests/behavior.cjs', []], ['../tests/behavior.cjs', ['--firefox']], ['../tests/chrome.cjs', []], ['../tests/builder-panels.cjs', []], ['../tests/builder-panels.cjs', ['--firefox']], ['../tests/environment-browser.cjs', []], ['../tests/firefox-package.cjs', []]]) {
  const result = spawnSync(process.execPath, [path.resolve(__dirname, script), ...args], { stdio:'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

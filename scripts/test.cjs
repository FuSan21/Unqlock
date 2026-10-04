// Runs the test suite. With no argument it runs every group in order; with group names it runs
// only those, which is how CI shows each group as its own step. Every group after build reads dist/.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const project = path.resolve(__dirname, '..');
const { groups } = require('./test-groups.cjs');
const requested = process.argv.slice(2);
for (const name of requested) if (!groups[name]) { console.error(`Unknown test group "${name}". Groups: ${Object.keys(groups).join(', ')}`); process.exit(1); }
// GitHub Actions folds each test's output under its title and shows the result beside it.
const actions = process.env.GITHUB_ACTIONS === 'true';
for (const name of requested.length ? requested : Object.keys(groups)) {
  for (const [title, script, args = []] of groups[name].tests) {
    if (actions) console.log(`::group::${title}`);
    else console.log(`\n▶ ${title}`);
    const started = Date.now();
    const result = spawnSync(process.execPath, [script, ...args], { cwd:project, stdio:'inherit', timeout:5 * 60 * 1000, killSignal:'SIGKILL' });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (actions) console.log('::endgroup::');
    if (result.error?.code === 'ETIMEDOUT') console.error(`TIMEOUT: ${title} did not finish within 5 minutes.`);
    if (result.status !== 0) {
      console.log(`✗ ${title} failed after ${seconds}s`);
      if (actions) console.log(`::error title=${title} failed::${title} failed after ${seconds}s; expand its group above for the output.`);
      process.exit(result.status || 1);
    }
    console.log(`✓ ${title} (${seconds}s)`);
  }
}

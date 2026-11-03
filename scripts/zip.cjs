const { zipSync } = require('fflate');
// ZIP stores local date fields, and fflate fills them with the Date's local getters, so a local
// midnight writes the same bytes in every timezone where a UTC instant would not.
const mtime = new Date(2020, 0, 1);
// Code-unit order, so entry order does not follow the machine's locale.
const byName = (left, right) => left < right ? -1 : left > right ? 1 : 0;
// Entries in a fixed order with a fixed timestamp, so the same files always give the same archive.
function zip(files) {
  return zipSync(Object.fromEntries(Object.keys(files).sort(byName).map(name => [name, [files[name], { mtime }]])), { level:9 });
}
module.exports = { byName, zip };

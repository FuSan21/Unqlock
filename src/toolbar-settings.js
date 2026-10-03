"use strict";
globalThis.UnqlockToolbar = (() => {
  const controls = {
    search: { label:'Search bar', always:'Always visible' },
    sort: { label:'Sort mode', always:'Always visible as switches' }
  };
  // Each control either keeps Unqork's own behavior or stays open.
  function settings(value) {
    return Object.fromEntries(Object.keys(controls).map(id => [id, value?.[id] === 'always' ? 'always' : 'native']));
  }
  return { controls, settings };
})();

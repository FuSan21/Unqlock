"use strict";
globalThis.UnqlockRowLayout = (() => {
  const sections = {
    icon: 'Icon',
    name: 'Property ID',
    type: 'Type badge',
    chip: 'Dependencies',
    actions: 'Actions menu'
  };
  const slots = ['left', 'middle', 'right'];
  const presets = {
    right: { label:'Details right', positions:{ icon:'left', name:'left', type:'right', chip:'right', actions:'right' } },
    left: { label:'All left', positions:{ icon:'left', name:'left', type:'left', chip:'left', actions:'left' } },
    middle: { label:'Details in middle', positions:{ icon:'left', name:'left', type:'middle', chip:'middle', actions:'right' } }
  };
  // Native keeps Unqork's own row untouched; positions are kept for the next custom layout.
  function settings(value) {
    return {
      enabled: value?.enabled === true,
      ...Object.fromEntries(Object.keys(sections).map(id => [id, slots.includes(value?.[id]) ? value[id] : presets.right.positions[id]]))
    };
  }
  function preset(value) {
    if (!value.enabled) return 'native';
    return Object.keys(presets).find(id => Object.keys(sections).every(section => presets[id].positions[section] === value[section])) || 'custom';
  }
  return { sections, slots, presets, settings, preset };
})();

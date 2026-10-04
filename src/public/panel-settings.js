"use strict";
globalThis.UnqlockPanels = (() => {
  const panels = {
    agent: { label:'Build Agent', close:'Collapse left', open:'Expand left', side:'left' },
    explore: { label:'Explore', close:'Collapse right', open:'Expand right', side:'right' },
    properties: { label:'Properties', close:'Collapse properties panel', open:'Expand properties panel', side:'right' },
    tray: { label:'Component tray', close:'Close component tray', open:'Expand component tray panel', side:'left' }
  };
  const width = value => Number.isFinite(value) && value >= 120 && value <= 1600 ? Math.round(value) : null;
  function settings(value) {
    return Object.fromEntries(Object.keys(panels).map(id => {
      const raw = value?.[id];
      return [id, {
        visibility:['native', 'start', 'always'].includes(raw?.visibility) ? raw.visibility : 'native',
        sizing:['native', 'custom', 'remember'].includes(raw?.sizing) ? raw.sizing : 'native',
        width:width(raw?.width)
      }];
    }));
  }
  const rememberedKey = id => 'panelWidth_' + id;
  return { panels, width, settings, rememberedKey };
})();

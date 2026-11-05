import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

// A React copy of the builder's canvas search as captured from a live builder (Unqork 9.0.8): every canvas row's
// node gets the component definition, Unqork's matches for the whole module as `searchMatchKeys` (a Set that
// includes components inside collapsed containers), `currentSearchKey` and `onNodeClick`, which selects a
// component and opens its Properties. A container's row is its collapsible trigger, the chevron toggles it
// without selecting, and a collapsed container unmounts its children.
const definition = [
  { key:'panelInfo', type:'panel', label:'Info', components:[
    { key:'description', type:'htmlelement', label:'' },
    { key:'ownerName', type:'textfield', label:'Owner name' }
  ] },
  { key:'panelRequest', type:'panel', label:'Request', components:[
    { key:'fgOwners', type:'field-group', label:'', title:'Owners group', components:[
      { key:'ownerAddress', type:'hidden', label:'Mailing address' }
    ] },
    { key:'colsLayout', type:'columns', label:'Layout', columns:[{ components:[{ key:'ownerPhone', type:'phoneNumber', label:'Phone' }] }, { components:[{ key:'notes', type:'textarea', label:'Notes' }] }] }
  ] },
  { key:'calcOwner', type:'transformer', label:'calcOwner' }
];

const childrenOf = component => [...(component.components || []), ...(component.columns || []).flatMap(column => column.components)];
const all = list => list.flatMap(component => [component, ...all(childrenOf(component))]);

// The node above each row, with the props Unqork gives it, a few levels up like Unqork's.
function Node(props) { return <Row {...props} />; }
function Row({ component, onNodeClick, searchMatchKeys, currentSearchKey, open, toggle, selected }) {
  const container = childrenOf(component).length > 0;
  const ring = component.key === currentSearchKey ? 'ring-amber-500' : searchMatchKeys.has(component.key) ? 'ring-amber-400/70' : '';
  const name = component.label && component.label !== component.key ? ' ' + component.label : '';
  return <div role="button" tabIndex={0} data-component-key={component.key} className={ring + (selected === component.key ? ' ring-unqork-brand/70' : '')}
    {...(container ? { 'data-slot':'collapsible-trigger', 'aria-expanded':open } : {})} onClick={() => onNodeClick(component)}>
    <span>{component.key}{name}</span>
    {container && <svg className="lucide lucide-chevron-down" width="16" height="16" onClick={event => { event.stopPropagation(); toggle(component.key); }}><path d="m6 9 6 6 6-6" /></svg>}
  </div>;
}

function Canvas({ components, state }) {
  return components.map(component => {
    const children = childrenOf(component);
    const open = !state.collapsed.has(component.key);
    return <div key={component.key} {...(children.length ? { 'data-slot':'collapsible', [open ? 'data-open' : 'data-closed']:'' } : {})} style={{ margin:'4px 0 4px 16px', height:60 }}>
      <Node component={component} open={open} {...state.props} selected={state.selected} toggle={state.toggle} />
      {children.length > 0 && open && <div data-slot="collapsible-content"><Canvas components={children} state={state} /></div>}
    </div>;
  });
}

function App() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState('');
  const [collapsed, setCollapsed] = useState(() => new Set(['panelRequest', 'fgOwners']));
  const matches = useMemo(() => {
    const text = query.trim().toLowerCase();
    return new Set(text ? all(definition).filter(component => component.key.toLowerCase().includes(text) || (component.label || '').toLowerCase().includes(text)).map(component => component.key) : []);
  }, [query]);
  const current = [...matches][0] || null;
  const state = {
    collapsed, selected,
    toggle:key => setCollapsed(previous => { const next = new Set(previous); if (!next.delete(key)) next.add(key); return next; }),
    props:{ searchMatchKeys:matches, currentSearchKey:current, onNodeClick:component => setSelected(component.key) }
  };
  return <>
    <div role="toolbar" aria-label="Editing toolbar" style={{ display:'flex', justifyContent:'flex-end', height:36 }}>
      {open ? <div data-slot="input-group" role="group" style={{ width:248 }}>
        <input aria-label="Search configuration" placeholder="Search by property ID or label..." value={query} onChange={event => setQuery(event.target.value)}
          onKeyDown={event => { if (event.key === 'Escape') { setQuery(''); setOpen(false); } if (event.key === 'Enter') window.unqorkEnters = (window.unqorkEnters || 0) + 1; }} />
      </div> : <button type="button" aria-label="Search configuration" onClick={() => setOpen(true)}>Search</button>}
    </div>
    <output id="selected">{selected}</output>
    <div id="canvas" style={{ height:300, overflow:'auto' }}><Canvas components={definition} state={state} /><div style={{ height:2000 }}></div></div>
  </>;
}

createRoot(document.getElementById('root')).render(<App />);

import React, { memo, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';

const sortOptions = [{ value:'default', label:'Default' }, { value:'type', label:'By Type' }, { value:'alphabetical', label:'Alphabetical' }];
const headings = { default:'Default', type:'Grouped by Type', alphabetical:'All Components' };

// Like the builder's search: a button that mounts a focused field, closed by Escape or Close search.
function Search() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  if (!open) return <button type="button" aria-label="Search configuration" onClick={() => setOpen(true)}>Search</button>;
  const close = () => { setQuery(''); setOpen(false); };
  return <div data-slot="input-group" role="group" data-query={query}>
    <input autoFocus data-slot="input-group-control" aria-label="Search configuration" placeholder="Search by property ID or label..." value={query}
      onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') close(); }} />
    <button type="button" aria-label="Close search" onClick={close}>×</button>
  </div>;
}

// The trigger is memoized, so it does not rerender when the selected value changes;
// the switches must read the value from the dropdown above it.
const SortTrigger = memo(function SortTrigger({ open, onToggle }) {
  return <button type="button" aria-label="Sort components" aria-haspopup="menu" aria-expanded={open} onClick={onToggle}>Sort</button>;
});

function SortDropdown({ options, selectedValue, onSelect }) {
  const [open, setOpen] = useState(false);
  const onToggle = useCallback(() => setOpen(value => !value), []);
  return <>
    <SortTrigger open={open} onToggle={onToggle} />
    {open && <div role="menu" data-slot="dropdown-menu-content">
      {options.map(option => <div key={option.value} role="menuitemradio" aria-checked={option.value === selectedValue}
        onClick={() => { onSelect(option.value); setOpen(false); }}>{option.label}</div>)}
    </div>}
  </>;
}

// A sort control without the recognized props must keep Unqork's dropdown.
function UnrecognizedSort() {
  return <button type="button" aria-label="Sort components" aria-haspopup="menu">Sort</button>;
}

function App() {
  const [mode, setMode] = useState('default');
  const [generation, setGeneration] = useState(0);
  const [unrecognized, setUnrecognized] = useState(false);
  const onSelect = useCallback(value => setMode(value), []);
  return <>
    <input id="editor" aria-label="Property label" />
    <button type="button" id="remount" onClick={() => setGeneration(value => value + 1)}>Remount toolbar</button>
    <button type="button" id="unrecognized" onClick={() => setUnrecognized(value => !value)}>Toggle unrecognized sort</button>
    <div key={generation} role="toolbar" aria-label="Editing toolbar" style={{ display:'flex', alignItems:'center', height:36 }}>
      <div style={{ flex:1 }}></div>
      <Search />
      <div role="separator"></div>
      {unrecognized ? <UnrecognizedSort /> : <SortDropdown options={sortOptions} selectedValue={mode} onSelect={onSelect} />}
      <div role="separator"></div>
      <button type="button" aria-label="Undo">Undo</button>
    </div>
    <h3 id="heading">{headings[mode]}</h3>
  </>;
}

createRoot(document.getElementById('root')).render(<App />);

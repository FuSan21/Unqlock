import { useRef, type ReactNode } from 'react';

export interface Tab<T extends string> { id: T; label: string; panel: ReactNode }

interface TabListProps<T extends string> {
  label: string;
  tabs: { id: T; label: ReactNode; title?: string }[];
  selected: T;
  onSelect: (id: T) => void;
  // Each tab's element ID, and the ID of the panel it controls.
  tabId: (id: T) => string;
  panelId: (id: T) => string;
  className: string;
}

// A tab list with one tab stop: arrow keys, Home and End move between the tabs and select them.
export function TabList<T extends string>({ label, tabs, selected, onSelect, tabId, panelId, className }: TabListProps<T>) {
  const buttons = useRef(new Map<T, HTMLButtonElement>());
  const move = (index: number, key: string) => {
    const next = ({ ArrowRight:(index + 1) % tabs.length, ArrowLeft:(index + tabs.length - 1) % tabs.length, Home:0, End:tabs.length - 1 } as Record<string, number>)[key];
    if (next === undefined) return false;
    onSelect(tabs[next].id);
    buttons.current.get(tabs[next].id)?.focus();
    return true;
  };
  return (
    <div className={className} role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={element => { if (element) buttons.current.set(tab.id, element); }}
          type="button" role="tab" id={tabId(tab.id)} aria-controls={panelId(tab.id)} title={tab.title}
          aria-selected={tab.id === selected} tabIndex={tab.id === selected ? undefined : -1}
          onClick={() => onSelect(tab.id)}
          onKeyDown={event => { if (move(index, event.key)) event.preventDefault(); }}
        >{tab.label}</button>
      ))}
    </div>
  );
}

interface TabsProps<T extends string> {
  label: string;
  tabs: Tab<T>[];
  selected: T;
  onSelect: (id: T) => void;
}

// Tabs with their panels, each kept mounted and hidden while another is selected.
export function Tabs<T extends string>({ label, tabs, selected, onSelect }: TabsProps<T>) {
  return (
    <>
      <TabList className="debug-tabs" label={label} tabs={tabs} selected={selected} onSelect={onSelect} tabId={id => 'tab-' + id} panelId={id => 'panel-' + id} />
      {tabs.map(tab => (
        <section key={tab.id} role="tabpanel" id={'panel-' + tab.id} aria-labelledby={'tab-' + tab.id} hidden={tab.id !== selected}>{tab.panel}</section>
      ))}
    </>
  );
}

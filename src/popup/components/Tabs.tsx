import { useRef, type ReactNode } from 'react';

export interface Tab<T extends string> { id: T; label: string; panel: ReactNode }

interface TabsProps<T extends string> {
  label: string;
  tabs: Tab<T>[];
  selected: T;
  onSelect: (id: T) => void;
}

// Tabs with one tab stop: arrow keys, Home and End move between them.
export function Tabs<T extends string>({ label, tabs, selected, onSelect }: TabsProps<T>) {
  const buttons = useRef(new Map<T, HTMLButtonElement>());
  const move = (index: number, key: string) => {
    const next = ({ ArrowRight:(index + 1) % tabs.length, ArrowLeft:(index + tabs.length - 1) % tabs.length, Home:0, End:tabs.length - 1 } as Record<string, number>)[key];
    if (next === undefined) return false;
    onSelect(tabs[next].id);
    buttons.current.get(tabs[next].id)?.focus();
    return true;
  };
  return (
    <>
      <div className="debug-tabs" role="tablist" aria-label={label}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={element => { if (element) buttons.current.set(tab.id, element); }}
            type="button" role="tab" id={'tab-' + tab.id} aria-controls={'panel-' + tab.id}
            aria-selected={tab.id === selected} tabIndex={tab.id === selected ? undefined : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={event => { if (move(index, event.key)) event.preventDefault(); }}
          >{tab.label}</button>
        ))}
      </div>
      {tabs.map(tab => (
        <section key={tab.id} role="tabpanel" id={'panel-' + tab.id} aria-labelledby={'tab-' + tab.id} hidden={tab.id !== selected}>{tab.panel}</section>
      ))}
    </>
  );
}

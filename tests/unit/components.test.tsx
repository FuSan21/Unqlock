import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, test } from 'vitest';
import { Segmented, Toggle } from '@/popup/components/controls';
import { Button, Page } from '@/popup/components/layout';
import { Tabs } from '@/popup/components/Tabs';
import { PagesProvider, usePageLeave, usePages } from '@/popup/pages';

afterEach(cleanup);

test('Segmented reports the chosen option and names each switch', () => {
  function Choice() {
    const [value, setValue] = useState<'native' | 'always'>('native');
    return <Segmented name="mode" legend="Mode" label="Search bar" options={[['native', 'Default'], ['always', 'Always visible']]} value={value} onChange={setValue} />;
  }
  render(<Choice />);
  const always = screen.getByRole<HTMLInputElement>('radio', { name:'Search bar: Always visible' });
  expect(screen.getByRole<HTMLInputElement>('radio', { name:'Search bar: Default' }).checked).toBe(true);
  fireEvent.click(always);
  expect(always.checked).toBe(true);
  expect(screen.getByRole('group', { name:'Mode' }).className).toBe('row-section');
});

test('A disabled control explains why and keeps its element once wrapped', () => {
  function Gate() {
    const [reason, setReason] = useState('');
    return <>
      <Toggle label="Colored icons" checked={false} onChange={() => {}} reason={reason} />
      <button type="button" onClick={() => setReason(reason ? '' : 'Turn on Component styling first.')}>Switch</button>
    </>;
  }
  render(<Gate />);
  const toggle = screen.getByRole<HTMLInputElement>('checkbox');
  expect(toggle.closest('.disabled-explanation')).toBeNull();
  fireEvent.click(screen.getByText('Switch'));
  const wrapped = screen.getByRole<HTMLInputElement>('checkbox');
  expect(wrapped.disabled).toBe(true);
  const explanation = screen.getByLabelText('Why Colored icons is unavailable');
  expect(explanation.tabIndex).toBe(0);
  expect(document.getElementById(explanation.getAttribute('aria-describedby')!)?.textContent).toBe('Turn on Component styling first.');
  fireEvent.click(screen.getByText('Switch'));
  // The wrapper stays without a reason, so the control is not remounted again.
  expect(screen.getByRole<HTMLInputElement>('checkbox')).toBe(wrapped);
  expect(wrapped.disabled).toBe(false);
  expect(wrapped.closest('.disabled-explanation')?.classList.contains('has-reason')).toBe(false);
  expect(screen.queryByLabelText('Why Colored icons is unavailable')).toBeNull();
});

test('Buttons name the reason after their label', () => {
  render(<Button aria-label="Use current Explore width" reason="Open this panel first.">Use current width</Button>);
  expect(screen.getByRole<HTMLButtonElement>('button', { name:'Use current Explore width' }).disabled).toBe(true);
  expect(screen.getByLabelText('Why Use current Explore width is unavailable')).toBeTruthy();
});

test('Tabs keep one tab stop and follow arrow keys', () => {
  function Panels() {
    const [selected, setSelected] = useState<'a' | 'b' | 'c'>('a');
    return <Tabs label="Tools" selected={selected} onSelect={setSelected} tabs={[{ id:'a', label:'A', panel:'First' }, { id:'b', label:'B', panel:'Second' }, { id:'c', label:'C', panel:'Third' }]} />;
  }
  render(<Panels />);
  const [a, b, c] = screen.getAllByRole('tab');
  expect([a.tabIndex, b.tabIndex, c.tabIndex]).toEqual([0, -1, -1]);
  fireEvent.keyDown(a, { key:'ArrowLeft' });
  expect(c.getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(c);
  expect(screen.getByText('Third').hidden).toBe(false);
  expect(screen.getByText('First').hidden).toBe(true);
  fireEvent.keyDown(c, { key:'Home' });
  expect(document.activeElement).toBe(a);
});

test('Pages focus their title, return focus home and let a leave hook veto Escape', () => {
  let block = true;
  function Pending() {
    usePageLeave('style-page', ({ escape }) => escape && block ? false : undefined);
    return null;
  }
  function Home() {
    const { current, open } = usePages();
    return <div hidden={current !== null}><button type="button" onClick={event => open('style-page', event.currentTarget)}>Open style</button></div>;
  }
  render(<PagesProvider><Home /><Page id="style-page" title="Component style" titleId="style-title"><Pending /></Page></PagesProvider>);
  const entry = screen.getByText('Open style');
  fireEvent.click(entry);
  expect(document.activeElement?.id).toBe('style-title');
  fireEvent.keyDown(document, { key:'Escape' });
  expect(document.getElementById('style-page')!.hidden).toBe(false);
  block = false;
  fireEvent.keyDown(document, { key:'Escape' });
  expect(document.getElementById('style-page')!.hidden).toBe(true);
  expect(document.activeElement).toBe(entry);
});

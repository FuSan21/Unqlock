import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Group, Panel, Separator } from 'react-resizable-panels';

const names = {
  agent:['Collapse left','Expand left'], explore:['Collapse right','Expand right'],
  tray:['Close component tray','Expand component tray panel'], properties:['Collapse properties panel','Expand properties panel']
};
function useSide(id, outer = false) {
  const ref = useRef(null);
  const [closed, setClosed] = useState(false);
  const toggle = <button aria-label={names[id][closed ? 1 : 0]} onClick={() => closed ? ref.current.expand() : ref.current.collapse()}>{id}</button>;
  const panel = <Panel data-slot="resizable-panel" id={id} panelRef={ref} collapsible collapsedSize={outer ? 32 : 0}
    defaultSize={outer ? '20%' : 250} minSize={outer ? 160 : 120} maxSize={outer ? '35%' : 600}
    onResize={size => setClosed(size.inPixels < 60)}>
    {!closed || outer ? toggle : null}
    {!closed && <p>{id} content</p>}
  </Panel>;
  return { panel, expand:closed && !outer ? <div>{toggle}</div> : null, ref };
}
const handle = id => <Separator id={'handle-' + id} data-slot="resizable-handle" style={{width:2,background:'#64748b'}} />;
function App() {
  const agent = useSide('agent', true), explore = useSide('explore', true), properties = useSide('properties'), tray = useSide('tray');
  return <>
    <button id="navigate" onClick={() => history.pushState({}, '', '/ide/builder/workspaces/test/modules/second')}>Another module</button>
    <button id="home" onClick={() => history.pushState({}, '', '/ide/workspaces/test')}>Leave builder</button>
    <button id="auto-properties" onClick={() => properties.ref.current.expand()}>Select component</button>
    <button id="rerender" onClick={event => event.currentTarget.textContent = 'Updated'}>Rerender</button>
    <Group data-slot="resizable-panel-group" style={{height:650}}>
      {agent.panel}{handle('agent')}
      <Panel data-slot="resizable-panel" minSize={320}>
        <Group data-slot="resizable-panel-group">
          <Panel data-slot="resizable-panel" minSize={320}>
            <Group data-slot="resizable-panel-group">
              {tray.panel}{tray.expand}{handle('tray')}
              <Panel data-slot="resizable-panel" minSize={320}><h1>Canvas</h1></Panel>
            </Group>
          </Panel>
          {handle('properties')}{properties.panel}{properties.expand}
        </Group>
      </Panel>
      {handle('explore')}{explore.panel}
    </Group>
  </>;
}
createRoot(document.getElementById('root')).render(<App />);

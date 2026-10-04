import { useCallback, useEffect, useRef } from 'react';
import { styleKeys, appearanceDefaults } from '@/lib/appearance';
import * as Colors from '@/lib/component-colors';
import { AppearanceToggle } from '../components/AppearanceToggle';
import { Unavailable } from '../components/Unavailable';
import { Note, Page, PageFooter, SettingsHeading } from '../components/layout';
import { appearanceReason, useSettings } from '../settings';

const partNames = { ink:'foreground', tint:'background' } as const;
const pick = <T extends object>(source: T, keys: (keyof T)[]) => Object.fromEntries(keys.map(key => [key, source[key]]));

interface SwatchProps { family: Colors.Family; mode: Colors.Mode; part: Colors.Part; value: string; reason: string; onPick: (value: string) => void }

// One color picker. It saves when the picker closes, not on every movement while dragging, so it
// listens for the native change event that React's onChange does not expose.
function Swatch({ family, mode, part, value, reason, onPick }: SwatchProps) {
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(onPick);
  latest.current = onPick;
  useEffect(() => {
    if (input.current) input.current.value = value.toLowerCase();
  }, [value]);
  // A ref callback follows the element if the swatch is remounted, such as when it is first disabled.
  const attach = useCallback((element: HTMLInputElement | null) => {
    input.current = element;
    if (!element) return;
    const listener = () => latest.current(element.value);
    element.addEventListener('change', listener);
    return () => element.removeEventListener('change', listener);
  }, []);
  const label = family.name + ' ' + mode + ' ' + partNames[part] + ' color';
  return (
    <Unavailable reason={reason} label={label}>
      <input ref={attach} type="color" className="swatch" data-color={family.id + '-' + mode + '-' + part} defaultValue={value.toLowerCase()}
        title={(mode === 'light' ? 'Light ' : 'Dark ') + partNames[part]} aria-label={label} disabled={Boolean(reason)} />
    </Unavailable>
  );
}

// The color guide doubles as the color settings: each group has a foreground and a background
// swatch per theme. Swatches show the resolved colors, so a derived partner shows what the builder will use.
function ColorSettings() {
  const { appearance, componentColors, save } = useSettings();
  const palette = Colors.palette(componentColors);
  const reason = appearanceReason('colors', appearance);
  const first = useRef(new Map<string, HTMLDivElement>());
  return (
    <div id="color-settings">
      <div className="color-row color-head" aria-hidden="true"><span></span><span>Light</span><span>Dark</span><span></span></div>
      <div className="color-row color-head color-parts" aria-hidden="true">
        <span></span>
        <span className="color-pair"><span title="Foreground">Fore</span><span title="Background">Back</span></span>
        <span className="color-pair"><span title="Foreground">Fore</span><span title="Background">Back</span></span>
        <span></span>
      </div>
      {palette.map(entry => (
        <div key={entry.id} className="color-row" role="group" aria-label={entry.name + ' colors'} ref={element => { if (element) first.current.set(entry.id, element); }}>
          <span>{entry.name}</span>
          {Colors.modes.map(mode => (
            <span key={mode} className="color-pair">
              {Colors.parts.map((part, index) => (
                <Swatch key={part} family={entry} mode={mode} part={part} value={entry[mode][index]} reason={reason}
                  onPick={value => {
                    const next = structuredClone(componentColors);
                    next[entry.id] = { ...next[entry.id], [mode]:{ ...next[entry.id]?.[mode], [part]:value } };
                    save({ componentColors:Colors.settings(next) });
                  }} />
              ))}
            </span>
          ))}
          <span>
            {Object.keys(entry.picked).length > 0 && (
              <button type="button" className="link-button" aria-label={'Reset ' + entry.name + ' colors'} onClick={async () => {
                const { [entry.id]:_removed, ...rest } = componentColors;
                await save({ componentColors:rest });
                first.current.get(entry.id)?.querySelector('input')?.focus();
              }}>Reset</button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ComponentStyle() {
  const { appearance, busy, status, save } = useSettings();
  return (
    <Page id="style-page" title="Component style" titleId="style-title">
      <Note>Colors, icons and accents for components in the sidebar and canvas. Turn styling on or off with Component styling on the home menu.</Note>
      <fieldset id="style-fields" className="appearance-fields" disabled={busy}>
        <SettingsHeading>Apply styling to</SettingsHeading>
        <AppearanceToggle setting="tray" label="Style sidebar components" />
        <AppearanceToggle setting="canvas" label="Style canvas components" />
        <SettingsHeading>Icons &amp; labels</SettingsHeading>
        <AppearanceToggle setting="icons" label="Colored icons" />
        <AppearanceToggle setting="tiles" label="Tinted icon backgrounds" />
        <AppearanceToggle setting="trayLabels" label="Colored sidebar names" />
        <AppearanceToggle setting="labels" label="Colored canvas type labels" />
        <AppearanceToggle setting="symbols" label="Distinct icon shapes" />
        <Note>Distinct shapes apply when Colored icons is on. Icon backgrounds can be enabled independently.</Note>
        <SettingsHeading>Component frames</SettingsHeading>
        <AppearanceToggle setting="accents" label="Subtle left accents" />
        <AppearanceToggle setting="backgrounds" label="Full background accents" />
        <AppearanceToggle setting="borders" label="Full colored borders" />
        <SettingsHeading>Colors</SettingsHeading>
        <ColorSettings />
        <Note id="colors-help">Each theme has two swatches: Fore, the foreground for icons, labels, shapes, borders and accent bars, and Back, the background for icon tiles and full backgrounds. Pick one and the other follows it so labels stay readable, or pick both to keep similar colors apart.</Note>
      </fieldset>
      <Note>Follows Unqork’s light or dark appearance.<br />Available in builders across Unqork subdomains.</Note>
      <PageFooter resetId="reset-style" resetText="Reset style" statusId="style-status" status={status} busy={busy}
        onReset={() => save({ appearance:{ ...appearance, ...pick(appearanceDefaults, styleKeys) }, componentColors:{} })} />
    </Page>
  );
}

import { appearanceDefaults, layoutKeys } from '@/lib/appearance';
import * as Labels from '@/lib/label-settings';
import * as RowLayout from '@/lib/row-layout';
import * as Toolbar from '@/lib/toolbar-settings';
import { AppearanceToggle } from '../components/AppearanceToggle';
import { Segmented, Select, type Option } from '../components/controls';
import { Note, Page, PageFooter, SettingsHeading } from '../components/layout';
import { useSettings } from '../settings';

const pick = <T extends object>(source: T, keys: (keyof T)[]) => Object.fromEntries(keys.map(key => [key, source[key]]));
const presetOptions: Option<string>[] = [['native', 'Native'], ...Object.entries(RowLayout.presets).map(([id, preset]) => [id, preset.label] as const), ['custom', 'Custom']];
const slotOptions = RowLayout.slots.map(slot => [slot, slot[0].toUpperCase() + slot.slice(1)] as const);

// Why canvas row settings are unavailable, given the switches they depend on.
const canvasReason = (appearance: { enabled: boolean; canvas: boolean }, use: string) => !appearance.enabled ? 'Turn on Component styling on the home menu to ' + use + '.' : !appearance.canvas ? 'Turn on Component style → Style canvas components to ' + use + '.' : '';

function RowLayoutSettings() {
  const { appearance, rowLayout, save } = useSettings();
  const reason = canvasReason(appearance, 'arrange canvas rows');
  return (
    <>
      <Select id="row-preset" label="Canvas row layout" inline aria-describedby="row-layout-help" options={presetOptions} value={RowLayout.preset(rowLayout)} reason={reason}
        onChange={value => save({ rowLayout:{ ...rowLayout, ...RowLayout.presets[value]?.positions, enabled:value !== 'native' } })} />
      {/* Section controls only appear while a layout applies; the select explains why otherwise. */}
      <div id="row-sections" hidden={Boolean(reason) || !rowLayout.enabled}>
        {(Object.entries(RowLayout.sections) as [RowLayout.Section, string][]).map(([id, name]) => (
          <Segmented key={id} name={'row-' + id} legend={name} label={name} optionLabel={slot => name + ' ' + slot} options={slotOptions} value={rowLayout[id]}
            onChange={slot => save({ rowLayout:{ ...rowLayout, [id]:slot, enabled:true } })} />
        ))}
      </div>
    </>
  );
}

function LabelSettings() {
  const { appearance, canvasLabels, save } = useSettings();
  return (
    <Segmented name="component-labels" legend="Component labels" label="Component labels" describedBy="component-labels-help" options={Labels.modes} value={canvasLabels}
      reason={canvasReason(appearance, 'show component labels')} onChange={mode => save({ canvasLabels:mode })} />
  );
}

// Toolbar controls work without Component styling, since they only keep Unqork's own controls open.
function ToolbarSettings() {
  const { canvasToolbar, save } = useSettings();
  return (
    <div id="toolbar-controls">
      {(Object.entries(Toolbar.controls) as [Toolbar.ToolbarControl, typeof Toolbar.controls.search][]).map(([id, control]) => (
        <Segmented key={id} name={'toolbar-' + id} legend={control.label} label={control.label} describedBy="toolbar-help"
          options={[['native', 'Default'], ['always', control.always]] as const} value={canvasToolbar[id]} inputProps={() => ({ 'data-toolbar':id })}
          onChange={mode => save({ canvasToolbar:{ ...canvasToolbar, [id]:mode } })} />
      ))}
    </div>
  );
}

export function CanvasLayout() {
  const { appearance, busy, status, save } = useSettings();
  return (
    <Page id="layout-page" title="Canvas layout" titleId="layout-title">
      <Note>Fit more components in view and arrange canvas rows and containers.</Note>
      <fieldset id="layout-fields" className="appearance-fields" disabled={busy}>
        <AppearanceToggle setting="compact" label="Compact components" describedBy="compact-help" />
        <Note id="compact-help">Fit more components in view with shorter rows and clear type badges. Names, icons and actions stay visible.</Note>
        <LabelSettings />
        <Note id="component-labels-help">Show each component's label after its property ID on the canvas. When different skips labels that repeat the ID, and leaves the legacy view as it is. Edited labels update within a second.</Note>
        <SettingsHeading>Row layout</SettingsHeading>
        <RowLayoutSettings />
        <Note id="row-layout-help">Place each part of a canvas row on the left, in the middle or on the right. Native keeps Unqork’s layout. Keyboard focus follows the original order.</Note>
        <SettingsHeading>Containers</SettingsHeading>
        <Note>Make panels, field groups, columns, grids and other collapsible components easier to tell apart on the canvas.</Note>
        <AppearanceToggle setting="containerSpacing" label="More space around containers" />
        <AppearanceToggle setting="containerHeaders" label="Tinted container headers" />
        <AppearanceToggle setting="containerGuides" label="Nesting guide lines" />
        <AppearanceToggle setting="containerDepth" label="Shade by nesting depth" />
        <AppearanceToggle setting="containerSticky" label="Pin headers while scrolling" />
        <AppearanceToggle setting="containerEnd" label="Mark where containers end" />
        <SettingsHeading>Toolbar</SettingsHeading>
        <ToolbarSettings />
        <Note id="toolbar-help">Keep the canvas search field open, and show the sort modes as switches instead of a dropdown. These work even when Component styling is off.</Note>
      </fieldset>
      <PageFooter resetId="reset-layout" resetText="Reset layout" statusId="layout-status" status={status} busy={busy}
        onReset={() => save({ appearance:{ ...appearance, ...pick(appearanceDefaults, layoutKeys) }, rowLayout:RowLayout.settings(), canvasToolbar:Toolbar.settings(), canvasLabels:Labels.mode(undefined) })} />
    </Page>
  );
}

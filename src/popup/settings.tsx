import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { api } from '@/lib/api';
import { appearanceSettings, type Appearance, type AppearanceKey } from '@/lib/appearance';
import * as Colors from '@/lib/component-colors';
import * as RowLayout from '@/lib/row-layout';
import * as Toolbar from '@/lib/toolbar-settings';

interface StoredSettings {
  appearance: Appearance;
  rowLayout: RowLayout.RowLayout;
  canvasToolbar: Toolbar.ToolbarSettings;
  componentColors: Colors.ColorSettings;
}
export type SettingsUpdate = { [Key in keyof StoredSettings]?: unknown };

interface Settings extends StoredSettings {
  // True while loading or saving; the style and layout controls wait meanwhile.
  busy: boolean;
  status: string;
  save: (items: SettingsUpdate) => Promise<void>;
  // Shows values another part of the popup has already written, such as an import.
  show: (items: SettingsUpdate) => void;
}

const SettingsContext = createContext<Settings | null>(null);

export function useSettings() {
  const settings = useContext(SettingsContext);
  if (!settings) throw new Error('useSettings needs a SettingsProvider');
  return settings;
}

function normalize(items: SettingsUpdate, previous: StoredSettings): StoredSettings {
  return {
    appearance: 'appearance' in items ? appearanceSettings(items.appearance) : previous.appearance,
    rowLayout: 'rowLayout' in items ? RowLayout.settings(items.rowLayout) : previous.rowLayout,
    canvasToolbar: 'canvasToolbar' in items ? Toolbar.settings(items.canvasToolbar) : previous.canvasToolbar,
    componentColors: 'componentColors' in items ? Colors.settings(items.componentColors) : previous.componentColors
  };
}

// Component style, Canvas layout and the home switches share these stored values and one save.
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [values, setValues] = useState<StoredSettings>(() => normalize({ appearance:undefined, rowLayout:undefined, canvasToolbar:undefined, componentColors:undefined }, {} as StoredSettings));
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState('Loading…');

  useEffect(() => {
    api.storage.local.get(['appearance', 'rowLayout', 'canvasToolbar', 'componentColors']).then(result => {
      setValues(previous => normalize(result, previous));
      setStatus('Ready');
      setBusy(false);
    }).catch(() => setStatus('Storage unavailable'));
  }, []);

  const show = useCallback((items: SettingsUpdate) => setValues(previous => normalize(items, previous)), []);
  const save = useCallback(async (items: SettingsUpdate) => {
    // Show the change at once, as the control itself did; the save follows.
    show(items);
    setBusy(true);
    setStatus('Saving…');
    let result = 'Saved';
    try { await api.storage.local.set(items); }
    catch { result = 'Could not save. Try again.'; }
    // Re-enable the controls before returning, so a caller can move focus into them.
    flushSync(() => {
      setStatus(result);
      setBusy(false);
    });
  }, [show]);

  const value = useMemo(() => ({ ...values, busy, status, save, show }), [values, busy, status, save, show]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

// Why an appearance switch is unavailable, given the switches it depends on.
export function appearanceReason(key: AppearanceKey | 'colors', appearance: Appearance, onHome = false): string {
  if (key !== 'enabled' && !appearance.enabled) return onHome ? 'Turn on Component styling to use this setting.' : 'Turn on Component styling on the home menu to use this setting.';
  if (!['enabled', 'tray', 'canvas'].includes(key) && !appearance.tray && !appearance.canvas) return 'Turn on Component style → Style sidebar components or Style canvas components to use this setting.';
  if (key === 'trayLabels' && !appearance.tray) return 'Turn on Style sidebar components to color sidebar names.';
  if (key === 'labels' && !appearance.canvas) return 'Turn on Style canvas components to color canvas labels.';
  if (key.startsWith('container') && !appearance.canvas) return 'Turn on Component style → Style canvas components to use container settings.';
  if (key === 'symbols' && !appearance.icons) return 'Turn on Colored icons to use distinct icon shapes.';
  return '';
}

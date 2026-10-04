import type { AppearanceKey } from '@/lib/appearance';
import { appearanceReason, useSettings } from '../settings';
import { Toggle } from './controls';

interface AppearanceToggleProps {
  setting: AppearanceKey;
  label: string;
  tile?: boolean;
  // The home menu explains dependencies without pointing back at itself.
  onHome?: boolean;
  describedBy?: string;
}

// A switch bound to one appearance preference. Every copy of a preference, such as Compact
// components on the home menu and on Canvas layout, reads and saves the same value.
export function AppearanceToggle({ setting, label, tile, onHome, describedBy }: AppearanceToggleProps) {
  const { appearance, save } = useSettings();
  return (
    <Toggle
      label={label} tile={tile} checked={appearance[setting]} data-appearance={setting} aria-describedby={describedBy}
      reason={appearanceReason(setting, appearance, onHome)}
      onChange={checked => save({ appearance:{ ...appearance, [setting]:checked } })}
    />
  );
}

import * as Transfer from '@/lib/settings-transfer';
import { Toggle } from './controls';

// One switch per section of a settings file under review, for Import & export and the prompt window.
export function SectionToggles({ sections, chosen, onChange }: { sections: Transfer.SectionId[]; chosen: Transfer.SectionId[]; onChange: (chosen: Transfer.SectionId[]) => void }) {
  return sections.map(id => (
    <Toggle key={id} name={id} label={Transfer.sections[id]} checked={chosen.includes(id)}
      onChange={checked => onChange(checked ? [...chosen, id] : chosen.filter(item => item !== id))} />
  ));
}

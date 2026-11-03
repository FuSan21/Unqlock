// Import steps shared by Import & export and the prompt window's file import.
import { api } from '@/lib/api';
import * as Environment from '@/lib/environment';
import * as Transfer from '@/lib/settings-transfer';

export const { storedKeys } = Transfer;

// A chosen file's text, refusing anything an export could not be.
export async function readFile(file: File) {
  if (file.size > Transfer.maxSize) throw new Error(Transfer.tooLarge);
  try { return await file.text(); }
  catch { throw new Error('Could not read ' + file.name + '. Try again.'); }
}

// "Unqlock 1.6.0 · exported … · team.json", for the review.
export function origin(parsed: Transfer.Parsed, source: string) {
  return [parsed.extensionVersion && 'Unqlock ' + parsed.extensionVersion, parsed.exportedAt && 'exported ' + parsed.exportedAt.toLocaleString(), source].filter(Boolean).join(' · ');
}

// The sections chosen in a review, in the file's order, or an error when none are.
export function chosenSections(parsed: Transfer.Parsed, chosen: Transfer.SectionId[]) {
  const sections = parsed.sections.filter(id => chosen.includes(id));
  if (!sections.length) throw new Error('Choose at least one setting to import.');
  return sections;
}

// Writes the chosen sections. The background owns environment storage and registers badges for custom
// domains, so environments go to it; the rest is written here.
export async function importSections(parsed: Transfer.Parsed, chosen: Transfer.SectionId[], saveEnvironment: (replace: Environment.EnvironmentSettings) => Promise<{ missingOrigins: string[] }>) {
  const stored = await api.storage.local.get(storedKeys);
  const { update, environment } = Transfer.apply(parsed, chosen, stored);
  const saved = environment ? await saveEnvironment(environment) : null;
  if (Object.keys(update).length) await api.storage.local.set(update);
  return { update, names:chosen.map(id => Transfer.sections[id]).join(', '), missingOrigins:saved?.missingOrigins ?? null };
}

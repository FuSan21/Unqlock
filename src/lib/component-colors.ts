import type { Stored } from './api';

export type Mode = 'light' | 'dark';
export type Part = 'ink' | 'tint';
export interface Family { id: string; name: string; light: [string, string]; dark: [string, string] }
export type PickedColors = Partial<Record<Mode, Partial<Record<Part, string>>>>;
export type ColorSettings = Record<string, PickedColors>;
export interface ResolvedFamily extends Family { picked: PickedColors }

// Each group has a foreground (ink: icons, labels, shapes, borders, accent bars) and a background (tint)
// per theme. The defaults keep every pair distinct for foregrounds and full backgrounds in both
// themes, favoring Logic & processing, Integrations, Grids, Layout and Input fields in that order.
export const families: Family[] = [
  { id:'inputs', name:'Input fields', light:['#1E40AF', '#BFDBFE'], dark:['#93C5FD', '#1E3A8A'] },
  { id:'layout', name:'Layout', light:['#5B21B6', '#DDD6FE'], dark:['#C4B5FD', '#4C1D95'] },
  { id:'grids', name:'Grids', light:['#155E75', '#A5F3FC'], dark:['#67E8F9', '#164E63'] },
  { id:'content', name:'Content', light:['#44403C', '#E7E5E4'], dark:['#D6D3D1', '#292524'] },
  { id:'actions', name:'Actions & navigation', light:['#166534', '#BBF7D0'], dark:['#86EFAC', '#14532D'] },
  { id:'logic', name:'Logic & processing', light:['#9A3412', '#FED7AA'], dark:['#FDBA74', '#7C2D12'] },
  { id:'data', name:'Data & storage', light:['#115E59', '#99F6E4'], dark:['#5EEAD4', '#134E4A'] },
  { id:'integrations', name:'Integrations', light:['#9F1239', '#FECDD3'], dark:['#FDA4AF', '#881337'] },
  { id:'charts', name:'Charts & maps', light:['#86198F', '#F5D0FE'], dark:['#F0ABFC', '#701A75'] },
  { id:'custom', name:'Custom components', light:['#3F6212', '#D9F99D'], dark:['#BEF264', '#365314'] }
];

// Preset themes replace the defaults above; colors the user picks still apply on top. Each was searched in
// OKLCH for the largest gap between its two closest groups, keeping every foreground at 4.5:1 or better
// against its background, the builder's white and its near-black. Red-green safe and Blue-yellow safe
// measure that gap under simulated protanopia and deuteranopia, or tritanopia (Machado et al. 2009), and
// take their hues from Okabe-Ito and Paul Tol's color-blind-safe sets, so lightness does most of the
// separating. High contrast keeps 7:1 within each pair.
type ThemeColors = Record<string, [light: [string, string], dark: [string, string]]>;
export const themeKey = 'componentTheme';
export const themes = [
  { id:'unqlock', name:'Unqlock' },
  { id:'calm', name:'Calm', colors:{
    inputs:[['#46698D', '#DBECFD'], ['#A8CCF2', '#1D3043']],
    layout:[['#5C518D', '#DDDBEF'], ['#B9B4DC', '#302B47']],
    grids:[['#01585E', '#C4EAEE'], ['#77CAD3', '#083A3E']],
    content:[['#59483D', '#E7DCD5'], ['#C7B3A6', '#362E28']],
    actions:[['#264C34', '#CAE6D2'], ['#A3C6AE', '#2B3930']],
    logic:[['#60361C', '#FFDFCD'], ['#F7C4A7', '#412616']],
    data:[['#036346', '#D5F2E4'], ['#AFDBC7', '#163528']],
    integrations:[['#7B3E4C', '#FAD3D9'], ['#FEC4CF', '#452E32']],
    charts:[['#7B4C81', '#F1E2F3'], ['#DABFDD', '#422C44']],
    custom:[['#6A633A', '#F2EDCE'], ['#CCC495', '#39351B']]
  } },
  { id:'contrast', name:'High contrast', colors:{
    inputs:[['#122992', '#CADAFF'], ['#C9DAFF', '#22366E']],
    layout:[['#5A3D6A', '#F4E3FF'], ['#E6C1FB', '#3B2049']],
    grids:[['#024052', '#D0F1FE'], ['#CBF0FF', '#004255']],
    content:[['#473A2C', '#DED6CD'], ['#FEEFE0', '#352E27']],
    actions:[['#284101', '#C6E3AB'], ['#B0E17B', '#37412F']],
    logic:[['#452501', '#FFD4AD'], ['#FECC9F', '#543516']],
    data:[['#00392A', '#B9EEDA'], ['#B4D5C8', '#013C2D']],
    integrations:[['#730029', '#FEC8CE'], ['#FEC4CA', '#52272E']],
    charts:[['#71037E', '#F3C8F8'], ['#FAE4FD', '#4E3151']],
    custom:[['#4C4F01', '#EAECD6'], ['#D3D8A5', '#333502']]
  } },
  { id:'redgreen', name:'Red-green safe', colors:{
    inputs:[['#014894', '#A2C3EE'], ['#DEECFE', '#203E65']],
    layout:[['#5F5292', '#D6D1F8'], ['#A691FC', '#2E2055']],
    grids:[['#025E74', '#B4EBFE'], ['#7CDFFE', '#00566A']],
    content:[['#67594A', '#DCD4CB'], ['#E5D4C3', '#534C45']],
    actions:[['#174E0A', '#9CCF92'], ['#7FD36F', '#1D3E16']],
    logic:[['#715701', '#F2D58A'], ['#FFE092', '#443D2C']],
    data:[['#01302D', '#C6FFF9'], ['#33BBB2', '#003532']],
    integrations:[['#812604', '#F4B7A4'], ['#FEB39C', '#713D2C']],
    charts:[['#733257', '#F4AED2'], ['#F0B7D4', '#563848']],
    custom:[['#332B00', '#F2EAC5'], ['#B9AF84', '#352C00']]
  } },
  { id:'blueyellow', name:'Blue-yellow safe', colors:{
    inputs:[['#524599', '#D0CEFC'], ['#BBB6FE', '#3B385B']],
    layout:[['#563C69', '#F0E0FE'], ['#B299C5', '#382048']],
    grids:[['#00364C', '#9CD8F9'], ['#5CBAEA', '#024662']],
    content:[['#483C2D', '#C4BCB4'], ['#EBDBC9', '#453E37']],
    actions:[['#003124', '#8AD1B6'], ['#AAE1CB', '#325346']],
    logic:[['#4C2401', '#FFDEC8'], ['#FFB582', '#634632']],
    data:[['#024A32', '#B7F7D8'], ['#7AB79B', '#00452E']],
    integrations:[['#9A1830', '#E5CBCB'], ['#FEC1C2', '#6E2D32']],
    charts:[['#7B3D75', '#F7B9F0'], ['#FEE6FB', '#5B2D56']],
    custom:[['#4A5303', '#ECF7C2'], ['#C4CDA1', '#2F331F']]
  } }
] as const satisfies readonly { id: string; name: string; colors?: ThemeColors }[];
export type ThemeId = typeof themes[number]['id'];
export const theme = (value: unknown): ThemeId => themes.some(entry => entry.id === value) ? value as ThemeId : 'unqlock';
export const modes: Mode[] = ['light', 'dark'];
export const parts: Part[] = ['ink', 'tint'];
const hex = /^#[0-9a-f]{6}$/i;
type Channels = number[];
const rgb = (value: string): Channels => [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
const toHex = (channels: Channels) => '#' + channels.map(channel => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, '0')).join('').toUpperCase();
const mix = (value: string, target: Channels, amount: number) => toHex(rgb(value).map((channel, index) => channel + (target[index] - channel) * amount));
const luminance = (value: string) => {
  const [r, g, b] = rgb(value).map(channel => { const c = channel / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const white = [255, 255, 255];
const black = [0, 0, 0];

// Mix a color toward white or black, from `from` to `to`, stopping at the first mix that reads
// against its partner. The cap keeps a background's hue, so two picked foregrounds that cannot
// reach full contrast still get different backgrounds rather than the same white or black.
function separate(value: string, against: string, toward: Channels, from: number, to: number, minimum: number) {
  let result = mix(value, toward, from);
  for (let amount = from; amount <= to + 1e-9 && contrast(result, against) < minimum; amount += 0.02) result = mix(value, toward, Math.min(amount, to));
  return result;
}

// When only one color of a theme is picked, its partner is worked out from it: a pale or deep
// background for a picked foreground, or a dark or light foreground for a picked background.
export function partner(mode: Mode, part: Part, value: string) {
  const light = mode === 'light';
  if (part === 'ink') return separate(value, value, light ? white : black, light ? 0.7 : 0.55, light ? 0.86 : 0.8, 4.5);
  return separate(value, value, light ? black : white, light ? 0.5 : 0.55, 0.95, 5);
}

// Stored as { group: { light: { ink, tint }, dark: { ink, tint } } } with picked colors only.
export function settings(value?: Stored): ColorSettings {
  const result: ColorSettings = {};
  for (const family of families) {
    const group: PickedColors = {};
    for (const mode of modes) {
      const picked = Object.fromEntries(parts.filter(part => typeof value?.[family.id]?.[mode]?.[part] === 'string' && hex.test(value[family.id][mode][part])).map(part => [part, value[family.id][mode][part].toUpperCase()]));
      if (Object.keys(picked).length) group[mode] = picked;
    }
    if (Object.keys(group).length) result[family.id] = group;
  }
  return result;
}

// Resolved [ink, tint] per light or dark appearance for every group, from the preset theme with the colors
// the user picked on top, with `picked` listing what the user chose.
export function palette(custom?: Stored, themeId?: unknown): ResolvedFamily[] {
  const chosen = settings(custom);
  const preset: Partial<ThemeColors> = (themes.find(entry => entry.id === theme(themeId)) as { colors?: ThemeColors }).colors || {};
  return families.map(family => {
    const [light, dark] = preset[family.id] || [family.light, family.dark];
    const resolved: ResolvedFamily = { ...family, light:[...light], dark:[...dark], picked:chosen[family.id] || {} };
    for (const mode of modes) {
      const picked = chosen[family.id]?.[mode];
      if (!picked) continue;
      const ink = picked.ink || partner(mode, 'tint', picked.tint!);
      const tint = picked.tint || partner(mode, 'ink', picked.ink!);
      resolved[mode] = [ink, tint];
    }
    return resolved;
  });
}

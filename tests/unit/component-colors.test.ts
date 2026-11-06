import { expect, test } from 'vitest';
import * as Colors from '@/lib/component-colors';

const channels = (value: string) => [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
// Machado, Oliveira and Fernandes (2009) at full severity, in linear RGB.
const visions: Record<string, number[][]> = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]]
};
function oklab(value: string, vision: string) {
  const [r, g, b] = visions[vision].map(row => Math.min(1, Math.max(0, row[0] * channels(value)[0] + row[1] * channels(value)[1] + row[2] * channels(value)[2])));
  const [l, m, s] = [0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b].map(Math.cbrt);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
// OKLab distance x100; about 2 is the smallest difference most people notice.
function distance(a: string, b: string, vision = 'normal') {
  const [p, q] = [oklab(a, vision), oklab(b, vision)];
  return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
// The smallest distance between any two groups' foregrounds or backgrounds, in either appearance.
function closest(palette: Colors.ResolvedFamily[], vision: string) {
  let min = Infinity;
  for (const mode of Colors.modes) for (const part of [0, 1]) for (const [index, a] of palette.entries()) for (const b of palette.slice(index + 1)) {
    min = Math.min(min, distance(a[mode][part], b[mode][part], vision));
  }
  return min;
}

test('every theme colors every group readably in both appearances', () => {
  for (const { id } of Colors.themes) {
    const palette = Colors.palette({}, id);
    expect(palette.map(family => family.id)).toEqual(Colors.families.map(family => family.id));
    const minimum = id === 'contrast' ? 7 : 4.5;
    for (const family of palette) {
      for (const color of [...family.light, ...family.dark]) expect(color).toMatch(/^#[0-9A-F]{6}$/);
      expect(Colors.contrast(...family.light)).toBeGreaterThanOrEqual(minimum);
      expect(Colors.contrast(...family.dark)).toBeGreaterThanOrEqual(minimum);
      // Foregrounds also draw icons and labels straight on the builder's own surfaces.
      expect(Colors.contrast(family.light[0], '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
      expect(Colors.contrast(family.dark[0], '#0A0A0A')).toBeGreaterThanOrEqual(4.5);
      // A full background stands apart from those surfaces rather than vanishing into them.
      if (id !== 'unqlock') {
        expect(distance(family.light[1], '#FFFFFF')).toBeGreaterThan(7);
        expect(distance(family.dark[1], '#0A0A0A')).toBeGreaterThan(15);
      }
    }
  }
});

test('color-blind-safe themes keep groups apart where the default cannot', () => {
  const unqlock = Colors.palette();
  for (const [id, simulated] of [['redgreen', ['protan', 'deutan']], ['blueyellow', ['tritan']]] as const) {
    for (const vision of simulated) {
      expect(closest(unqlock, vision)).toBeLessThan(2);
      expect(closest(Colors.palette({}, id), vision)).toBeGreaterThan(3);
    }
    expect(closest(Colors.palette({}, id), 'normal')).toBeGreaterThan(3);
  }
});

test('picked colors apply over the theme, and unknown themes fall back to the default', () => {
  const calm = Colors.palette({}, 'calm').find(family => family.id === 'logic')!;
  const picked = Colors.palette({ logic:{ dark:{ ink:'#7C3AED' } } }, 'calm').find(family => family.id === 'logic')!;
  expect(picked.light).toEqual(calm.light);
  expect(picked.dark[0]).toBe('#7C3AED');
  expect(picked.dark[1]).toBe(Colors.partner('dark', 'ink', '#7C3AED'));
  expect(Colors.theme('neon')).toBe('unqlock');
  expect(Colors.theme(undefined)).toBe('unqlock');
  expect(Colors.palette({}, 'neon')).toEqual(Colors.palette());
  expect(Colors.palette()[0].light).toEqual(Colors.families[0].light);
});

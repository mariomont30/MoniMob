import test from 'node:test';
import assert from 'node:assert/strict';
import { colors } from '../src/theme/colors.js';
import { readFileSync } from 'node:fs';
const luminance = hex => {
  const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const contrast = (one, two) => (Math.max(luminance(one), luminance(two)) + 0.05) / (Math.min(luminance(one), luminance(two)) + 0.05);
test('small secondary labels retain AA contrast on every card and badge surface', () => {
  for (const background of [colors.surface, colors.background, colors.tint, '#EEF2F8', '#EAF5EF', '#F8F1E4', '#F9EDEE'])
    assert.ok(contrast(colors.muted, background) >= 4.5, 'Secondary labels must reach 4.5:1 against ' + background);
  assert.ok(contrast('#FFFFFF', colors.primary) >= 4.5);
  const gradient = readFileSync(new URL('../assets/welcome-background.svg', import.meta.url), 'utf8');
  const stops = [...gradient.matchAll(/stop-color="(#[A-Fa-f0-9]{6})"/g)].map(match => match[1]);
  assert.ok(stops.length >= 2);
  for (const background of stops) assert.ok(contrast('#FFFFFF', background) >= 4.5, 'Welcome text must remain legible throughout its gradient');
});

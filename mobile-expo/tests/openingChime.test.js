import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('the bundled sonic logo is playable PCM audio with no clipping or abrupt edges', () => {
  const bytes = fs.readFileSync(new URL('../assets/welcome-chime.wav', import.meta.url));
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  assert.equal(bytes.readUInt16LE(20), 1);
  assert.equal(bytes.readUInt16LE(22), 1);
  assert.equal(bytes.readUInt16LE(34), 16);
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8);
  assert.equal(bytes.readUInt32LE(40), bytes.length - 44);
  const seconds = bytes.readUInt32LE(40) / bytes.readUInt32LE(28);
  assert.ok(seconds >= 2 && seconds <= 2.6);
  let peak = 0,
    energy = 0;
  for (let offset = 44; offset < bytes.length; offset += 2) {
    const value = bytes.readInt16LE(offset) / 32768;
    peak = Math.max(peak, Math.abs(value));
    energy += value * value;
  }
  assert.ok(peak > 0.7 && peak < 0.9, 'Present signal with headroom instead of clipping');
  assert.ok(
    Math.sqrt(energy / ((bytes.length - 44) / 2)) > 0.06,
    'Audio must not be effectively silent',
  );
  assert.equal(bytes.readInt16LE(44), 0);
  assert.equal(bytes.readInt16LE(bytes.length - 2), 0);
});

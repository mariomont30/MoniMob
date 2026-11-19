import fs from 'node:fs';

// Original MoniMob sonic logo: rising D-major tones, a soft pad and an airy sweep.
// Pure PCM synthesis; no downloaded samples, voices or external recordings.
const rate = 48000,
  seconds = 2.4,
  count = Math.round(rate * seconds);
const samples = new Float64Array(count);
const notes = [
  [0, 293.665],
  [0.18, 440],
  [0.38, 587.33],
  [0.6, 739.989],
  [0.84, 880],
  [1.08, 1174.659],
];
let seed = 1729,
  filteredNoise = 0,
  peak = 0;
for (let index = 0; index < count; index++) {
  const time = index / rate;
  let value = 0;
  for (const [start, frequency] of notes) {
    const elapsed = time - start;
    if (elapsed < 0) continue;
    const envelope = Math.min(1, elapsed / 0.012) * Math.exp(-3.2 * elapsed);
    value +=
      envelope *
      (0.19 * Math.sin(2 * Math.PI * frequency * elapsed) +
        0.045 * Math.sin(2 * Math.PI * frequency * 2 * elapsed) +
        0.016 * Math.sin(2 * Math.PI * frequency * 3 * elapsed));
  }
  const pad = Math.min(1, time / 0.28) * Math.exp(-1.6 * time);
  value +=
    pad *
    (0.055 * Math.sin(2 * Math.PI * 146.832 * time) + 0.035 * Math.sin(2 * Math.PI * 220 * time));
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  filteredNoise = filteredNoise * 0.7 + ((seed / 4294967296) * 2 - 1) * 0.3;
  const sweepEnvelope = time < 0.9 ? Math.sin((Math.PI * time) / 0.9) ** 2 : 0;
  value += filteredNoise * sweepEnvelope * 0.07;
  const fade = Math.min(1, index / (rate * 0.018), (count - 1 - index) / (rate * 0.16));
  samples[index] = value * Math.max(0, fade);
  peak = Math.max(peak, Math.abs(samples[index]));
}
const bytes = Buffer.alloc(44 + count * 2);
bytes.write('RIFF', 0);
bytes.writeUInt32LE(bytes.length - 8, 4);
bytes.write('WAVEfmt ', 8);
bytes.writeUInt32LE(16, 16);
bytes.writeUInt16LE(1, 20);
bytes.writeUInt16LE(1, 22);
bytes.writeUInt32LE(rate, 24);
bytes.writeUInt32LE(rate * 2, 28);
bytes.writeUInt16LE(2, 32);
bytes.writeUInt16LE(16, 34);
bytes.write('data', 36);
bytes.writeUInt32LE(count * 2, 40);
for (let index = 0; index < count; index++)
  bytes.writeInt16LE(Math.round((samples[index] / peak) * 0.82 * 32767), 44 + index * 2);
fs.writeFileSync(new URL('../../mobile-expo/assets/welcome-chime.wav', import.meta.url), bytes);
console.log(`Original MoniMob opening sound generated: ${seconds}s, PCM 48 kHz.`);

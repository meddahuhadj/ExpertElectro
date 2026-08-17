import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWaveform, SimulationSource, SIGNAL_TYPES } from './SimulationSource.js';
import { SOURCE_KIND } from '../Measurement.js';

test('generateWaveform tags every signal as SIMULATION', () => {
  for (const signalType of SIGNAL_TYPES) {
    const w = generateWaveform({ signalType, sampleRate: 20000, sampleCount: 500, frequencyHz: 500, seed: 1 });
    assert.equal(w.metadata.source, SOURCE_KIND.SIMULATION, `signalType=${signalType}`);
    assert.equal(w.samples.length, 500);
  }
});

test('sine wave amplitude matches requested Vpp (no noise)', () => {
  const w = generateWaveform({ signalType: 'sine', sampleRate: 100000, sampleCount: 4000, frequencyHz: 1000, amplitudeVpp: 6, offsetV: 0, noisePct: 0, seed: 42 });
  let vmax = -Infinity, vmin = Infinity;
  for (const s of w.samples) { if (s > vmax) vmax = s; if (s < vmin) vmin = s; }
  assert.ok(Math.abs((vmax - vmin) - 6) < 0.05, `Vpp mesuré ${vmax - vmin}`);
});

test('square wave duty cycle is respected', () => {
  const w = generateWaveform({ signalType: 'square', sampleRate: 100000, sampleCount: 10000, frequencyHz: 500, amplitudeVpp: 4, dutyCycle: 25, noisePct: 0, seed: 7 });
  const mid = 0; // offset 0, amplitude symétrique
  let above = 0;
  for (const s of w.samples) if (s > mid) above++;
  const duty = (above / w.samples.length) * 100;
  assert.ok(Math.abs(duty - 25) < 2, `duty mesuré ${duty}`);
});

test('faulty clipping stays within a reduced range vs a clean square', () => {
  const clean = generateWaveform({ signalType: 'square', sampleRate: 50000, sampleCount: 2000, frequencyHz: 400, amplitudeVpp: 5, noisePct: 0, seed: 3 });
  const faulty = generateWaveform({ signalType: 'faulty', sampleRate: 50000, sampleCount: 2000, frequencyHz: 400, amplitudeVpp: 5, noisePct: 0, defectType: 'clipping', seed: 3 });
  assert.notEqual(faulty.metadata.signalType, clean.metadata.signalType);
  assert.equal(faulty.metadata.params.defectType, 'clipping');
});

test('SimulationSource requires connect() before startAcquisition()', async () => {
  const src = new SimulationSource();
  await assert.rejects(() => src.startAcquisition());
  await src.connect();
  await src.startAcquisition();
  const status = src.getStatus();
  assert.equal(status.connected, true);
  assert.equal(status.label, '🟡 MODE SIMULATION');
  const w = await src.readData();
  assert.equal(w.metadata.source, 'SIMULATION');
});

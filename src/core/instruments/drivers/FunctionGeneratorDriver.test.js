import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FunctionGeneratorDriver, GENERATOR_WAVEFORMS } from './FunctionGeneratorDriver.js';
import { SOURCE_KIND } from '../Measurement.js';

test('configure() rejects an unknown waveform rather than accepting it silently', () => {
  const d = new FunctionGeneratorDriver();
  assert.throws(() => d.configure({ waveform: 'not-a-waveform' }));
});

test('configure()/getConfig() round-trip', () => {
  const d = new FunctionGeneratorDriver();
  d.configure({ waveform: 'square', frequencyHz: 2000, amplitudeVpp: 3, dutyCycle: 25 });
  const cfg = d.getConfig();
  assert.equal(cfg.waveform, 'square');
  assert.equal(cfg.frequencyHz, 2000);
  assert.equal(cfg.dutyCycle, 25);
});

test('previewWaveform() computes a real waveform tagged as a non-real preview', () => {
  const d = new FunctionGeneratorDriver();
  d.configure({ waveform: 'sine', frequencyHz: 1000, amplitudeVpp: 4, offsetV: 0 });
  const w = d.previewWaveform();
  assert.ok(w.samples.length > 0);
  assert.equal(w.metadata.source, SOURCE_KIND.SIMULATION);
  assert.match(w.metadata.note, /APERÇU/);
  let vmax = -Infinity, vmin = Infinity;
  for (const s of w.samples) { if (s > vmax) vmax = s; if (s < vmin) vmin = s; }
  assert.ok(Math.abs((vmax - vmin) - 4) < 0.05);
});

test('every advertised waveform produces a valid preview, including the "arbitrary" fallback', () => {
  const d = new FunctionGeneratorDriver();
  for (const waveform of GENERATOR_WAVEFORMS) {
    d.configure({ waveform });
    const w = d.previewWaveform();
    assert.ok(w.samples.length > 0, `waveform=${waveform}`);
  }
});

test('sendOutput() always honestly refuses — no real generator is ever connected in this phase', async () => {
  const d = new FunctionGeneratorDriver();
  await assert.rejects(() => d.sendOutput({ frequencyHz: 1000 }), /non connecté/i);
});

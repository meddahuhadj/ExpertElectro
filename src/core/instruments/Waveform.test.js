import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Waveform, WaveformValidationError } from './Waveform.js';

test('Waveform.create fills defaults and validates', () => {
  const w = Waveform.create({ sampleRate: 1000, samples: [0, 1, 0, -1] });
  assert.equal(w.channel, 'CH1');
  assert.equal(w.coupling, 'DC');
  assert.equal(w.unit, 'V');
  assert.deepEqual(w.metadata, {});
});

test('Waveform.validate rejects empty samples', () => {
  assert.throws(() => Waveform.validate({ sampleRate: 1000, samples: [], metadata: {} }), WaveformValidationError);
});

test('Waveform.validate rejects non-positive sampleRate', () => {
  assert.throws(() => Waveform.validate({ sampleRate: 0, samples: [1, 2], metadata: {} }), WaveformValidationError);
});

test('Waveform.validate rejects unknown coupling', () => {
  assert.throws(
    () => Waveform.validate({ sampleRate: 1000, samples: [1, 2], coupling: 'XYZ', metadata: {} }),
    WaveformValidationError
  );
});

test('Waveform.sampleAt interpolates linearly', () => {
  const w = Waveform.create({ sampleRate: 10, samples: [0, 10, 20, 30] });
  assert.equal(w.sampleAt(0), 0);
  assert.equal(w.sampleAt(0.05), 5); // mi-chemin entre l'échantillon 0 (t=0) et 1 (t=0.1)
  assert.equal(w.durationS(), 0.4);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWaveform } from '../instruments/sources/SimulationSource.js';
import { analyze } from '../signal/SignalAnalyzer.js';
import { compare } from './WaveformComparator.js';

test('flags a frequency deviation as "bad" and proposes a hypothesis', () => {
  const measuredWaveform = generateWaveform({ signalType: 'sine', sampleRate: 200000, sampleCount: 20000, frequencyHz: 1500, amplitudeVpp: 5, noisePct: 0, seed: 1 });
  const measured = analyze(measuredWaveform);
  const expected = { shape: 'sine', frequencyHz: 1000, amplitudeVpp: 5 };
  const result = compare(expected, measured);
  assert.equal(result.perMetricStatus.frequency, 'bad');
  assert.ok(result.hypotheses.length > 0, 'au moins une hypothèse proposée');
});

test('matching signal is reported ok on every metric with an expectation', () => {
  const measuredWaveform = generateWaveform({ signalType: 'sine', sampleRate: 200000, sampleCount: 20000, frequencyHz: 1000, amplitudeVpp: 5, noisePct: 0, seed: 2 });
  const measured = analyze(measuredWaveform);
  const expected = { shape: 'sine', frequencyHz: 1000, amplitudeVpp: 5 };
  const result = compare(expected, measured);
  assert.equal(result.perMetricStatus.frequency, 'ok');
  assert.equal(result.perMetricStatus.amplitude, 'ok');
});

test('low amplitude vs expected suggests attenuation, not a random hypothesis', () => {
  const measuredWaveform = generateWaveform({ signalType: 'sine', sampleRate: 200000, sampleCount: 20000, frequencyHz: 1000, amplitudeVpp: 1, noisePct: 0, seed: 3 });
  const measured = analyze(measuredWaveform);
  const expected = { shape: 'sine', frequencyHz: 1000, amplitudeVpp: 5 };
  const result = compare(expected, measured);
  assert.equal(result.perMetricStatus.amplitude, 'bad');
  assert.ok(result.hypotheses.some(h => h.code === 'attenuation'));
});

test('compare throws without a measured.metrics object rather than guessing', () => {
  assert.throws(() => compare({ frequencyHz: 1000 }, {}));
});

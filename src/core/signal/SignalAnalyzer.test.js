import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWaveform } from '../instruments/sources/SimulationSource.js';
import { analyze } from './SignalAnalyzer.js';

test('recovers frequency of a known sine within 1%', () => {
  const w = generateWaveform({ signalType: 'sine', sampleRate: 200000, sampleCount: 20000, frequencyHz: 1000, amplitudeVpp: 4, noisePct: 0, seed: 1 });
  const { metrics } = analyze(w);
  assert.ok(metrics.frequency, 'fréquence détectée');
  const err = Math.abs(metrics.frequency - 1000) / 1000;
  assert.ok(err < 0.01, `erreur fréquence ${err * 100}%`);
});

test('measures Vpp/Vavg/Vrms of a sine correctly', () => {
  const w = generateWaveform({ signalType: 'sine', sampleRate: 100000, sampleCount: 10000, frequencyHz: 1000, amplitudeVpp: 10, offsetV: 2, noisePct: 0, seed: 5 });
  const { metrics } = analyze(w);
  assert.ok(Math.abs(metrics.vpp - 10) < 0.1);
  assert.ok(Math.abs(metrics.vavg - 2) < 0.1);
  // Vrms d'un sinus d'amplitude crête 5V autour d'un offset 2V : sqrt(2^2 + (5/sqrt2)^2)
  const expectedRms = Math.sqrt(2 * 2 + (5 / Math.sqrt(2)) ** 2);
  assert.ok(Math.abs(metrics.vrms - expectedRms) < 0.1, `Vrms=${metrics.vrms} attendu ${expectedRms}`);
});

test('measures duty cycle of a 25% square wave', () => {
  const w = generateWaveform({ signalType: 'square', sampleRate: 100000, sampleCount: 20000, frequencyHz: 500, amplitudeVpp: 5, dutyCycle: 25, noisePct: 0, seed: 9 });
  const { metrics } = analyze(w);
  assert.ok(Math.abs(metrics.dutyCycle - 25) < 3, `duty=${metrics.dutyCycle}`);
});

test('a clean sine never triggers a false "clipping" anomaly (peak curvature must not be mistaken for a flat rail)', () => {
  // Régression : un sinus idéal reste naturellement "proche du sommet"
  // pendant quelques échantillons (dérivée ~nulle au sommet) — ça ne
  // doit jamais être confondu avec un vrai écrêtage, y compris avec du
  // bruit réaliste ou sur plusieurs fréquences/résolutions différentes.
  for (const frequencyHz of [200, 1000, 5000]) {
    const w = generateWaveform({ signalType: 'sine', sampleRate: 200000, sampleCount: 20000, frequencyHz, amplitudeVpp: 5, noisePct: 2, seed: 21 });
    const { anomalies } = analyze(w);
    assert.ok(!anomalies.some(a => a.code === 'clipping'), `faux positif clipping à ${frequencyHz}Hz : ${JSON.stringify(anomalies)}`);
  }
});

test('detects clipping anomaly on a faulty clipping signal', () => {
  const w = generateWaveform({ signalType: 'faulty', sampleRate: 50000, sampleCount: 4000, frequencyHz: 400, amplitudeVpp: 5, noisePct: 0.5, defectType: 'clipping', seed: 2 });
  const { anomalies } = analyze(w);
  assert.ok(anomalies.some(a => a.code === 'clipping'), JSON.stringify(anomalies));
});

test('detects intermittent anomaly on an intermittent signal', () => {
  const w = generateWaveform({ signalType: 'intermittent', sampleRate: 50000, sampleCount: 20000, frequencyHz: 1000, amplitudeVpp: 4, dropoutProbability: 0.9, dropoutDurationMsRange: [3, 8], noisePct: 0, seed: 11 });
  const { anomalies } = analyze(w);
  assert.ok(anomalies.some(a => a.code === 'intermittent'), JSON.stringify(anomalies));
});

test('detects absence of signal on a near-zero DC waveform', () => {
  const w = generateWaveform({ signalType: 'dc', sampleRate: 10000, sampleCount: 1000, offsetV: 0, noisePct: 0, seed: 4 });
  const { anomalies } = analyze(w);
  assert.ok(anomalies.some(a => a.code === 'no_signal'), JSON.stringify(anomalies));
});

test('throws on an empty waveform rather than fabricating metrics', () => {
  assert.throws(() => analyze({ samples: [1], sampleRate: 1000 }));
});

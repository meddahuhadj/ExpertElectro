import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWaveform } from '../instruments/sources/SimulationSource.js';
import { analyzeHarmonics } from './FFTAnalyzer.js';

test('pure sine: fundamental matches frequency, THD near zero', () => {
  const w = generateWaveform({ signalType: 'sine', sampleRate: 200000, sampleCount: 8192, frequencyHz: 2000, amplitudeVpp: 4, noisePct: 0, seed: 1 });
  const r = analyzeHarmonics(w);
  assert.ok(r.fundamental, 'fondamentale détectée');
  const binHz = r.binHz;
  assert.ok(Math.abs(r.fundamental.freq - 2000) <= binHz * 2, `fondamentale=${r.fundamental.freq}`);
  assert.ok(r.thdPercent < 5, `THD=${r.thdPercent}% (attendu proche de 0 pour un sinus pur)`);
});

test('square wave has significantly higher THD than a sine (odd harmonics)', () => {
  const sine = generateWaveform({ signalType: 'sine', sampleRate: 200000, sampleCount: 8192, frequencyHz: 1000, amplitudeVpp: 4, noisePct: 0, seed: 2 });
  const square = generateWaveform({ signalType: 'square', sampleRate: 200000, sampleCount: 8192, frequencyHz: 1000, amplitudeVpp: 4, noisePct: 0, seed: 2 });
  const rSine = analyzeHarmonics(sine);
  const rSquare = analyzeHarmonics(square);
  assert.ok(rSquare.thdPercent > rSine.thdPercent + 10, `sine THD=${rSine.thdPercent} square THD=${rSquare.thdPercent}`);
  assert.ok(rSquare.harmonics.some(h => h.order === 3), 'harmonique 3 détectée sur un carré');
});

test('fft magnitude array length is N/2 with N a power of two', () => {
  const w = generateWaveform({ signalType: 'sine', sampleRate: 44100, sampleCount: 1000, frequencyHz: 440, noisePct: 0, seed: 3 });
  const r = analyzeHarmonics(w);
  assert.equal(r.N & (r.N - 1), 0, 'N doit être une puissance de 2');
});

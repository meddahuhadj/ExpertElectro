import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateReading, DMMSimulationSource, DMM_MODES, DMM_MODE_DEFAULTS } from './DMMSimulationSource.js';
import { SOURCE_KIND } from '../Measurement.js';

test('generateReading tags every mode as SIMULATION and stays near the true value', () => {
  for (const mode of DMM_MODES) {
    const r = generateReading({ mode, noisePct: 1, seed: 1 });
    assert.equal(r.source, SOURCE_KIND.SIMULATION);
    assert.equal(r.confidence, 1);
    const def = DMM_MODE_DEFAULTS[mode];
    assert.equal(r.unit, def.unit);
    const relErr = Math.abs(r.value - def.trueValue) / Math.max(Math.abs(def.trueValue), 1e-9);
    assert.ok(relErr < 0.1, `mode=${mode} value=${r.value} too far from trueValue=${def.trueValue}`);
  }
});

test('generateReading throws on an unknown mode rather than fabricating a reading', () => {
  assert.throws(() => generateReading({ mode: 'NOT_A_MODE' }));
});

test('a custom trueValue is honored', () => {
  const r = generateReading({ mode: 'DC_VOLTAGE', trueValue: 12, noisePct: 0, seed: 2 });
  assert.ok(Math.abs(r.value - 12) < 1e-9);
});

test('DMMSimulationSource requires connect() before startAcquisition()', async () => {
  const src = new DMMSimulationSource();
  await assert.rejects(() => src.startAcquisition());
  await src.connect();
  src.configure({ mode: 'RESISTANCE', trueValue: 470, noisePct: 0 });
  await src.startAcquisition();
  const m = await src.readData();
  assert.equal(m.mode, 'RESISTANCE');
  assert.equal(m.source, 'SIMULATION');
  assert.equal(src.getStatus().label, '🟡 MODE SIMULATION');
});

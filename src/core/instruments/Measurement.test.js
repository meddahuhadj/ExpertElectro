import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Measurement, MeasurementValidationError, SOURCE_KIND } from './Measurement.js';

test('Measurement.create accepts a valid REAL measurement', () => {
  const m = Measurement.create({ value: 12.47, unit: 'V', mode: 'DC', source: SOURCE_KIND.REAL });
  assert.equal(m.value, 12.47);
  assert.equal(m.confidence, 1);
});

test('Measurement.validate rejects an invalid source (anti-confusion guard)', () => {
  assert.throws(
    () => Measurement.validate({ value: 1, unit: 'V', source: 'mesure' }),
    MeasurementValidationError
  );
});

test('Measurement.validate rejects a missing unit', () => {
  assert.throws(
    () => Measurement.validate({ value: 1, source: SOURCE_KIND.SIMULATION }),
    MeasurementValidationError
  );
});

test('Measurement.validate rejects out-of-range confidence', () => {
  assert.throws(
    () => Measurement.validate({ value: 1, unit: 'V', source: SOURCE_KIND.REAL, confidence: 1.5 }),
    MeasurementValidationError
  );
});

test('Measurement.sourceLabel never conflates provenances', () => {
  assert.equal(Measurement.sourceLabel(SOURCE_KIND.REAL), '🟢 RÉEL');
  assert.equal(Measurement.sourceLabel(SOURCE_KIND.SIMULATION), '🟡 SIMULATION');
  assert.equal(Measurement.sourceLabel(SOURCE_KIND.IMPORT), '📂 IMPORT');
  assert.equal(Measurement.sourceLabel(SOURCE_KIND.CAMERA_OCR), '📷 OCR CAMÉRA');
});

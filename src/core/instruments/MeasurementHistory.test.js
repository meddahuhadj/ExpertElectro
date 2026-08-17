import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMeasurementHistory } from './MeasurementHistory.js';
import { Measurement, SOURCE_KIND } from './Measurement.js';

function memStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) };
}

test('add() persists an entry and list() returns it newest-first', () => {
  const history = createMeasurementHistory(memStorage());
  const m1 = Measurement.create({ value: 1, unit: 'V', mode: 'DC_VOLTAGE', source: SOURCE_KIND.SIMULATION });
  const m2 = Measurement.create({ value: 2, unit: 'V', mode: 'DC_VOLTAGE', source: SOURCE_KIND.CAMERA_OCR, confidence: 0.9 });
  history.add({ measurement: m1, testPoint: 'TP1' });
  history.add({ measurement: m2, testPoint: 'TP2' });
  const list = history.list();
  assert.equal(list.length, 2);
  assert.equal(list[0].value, 2);
  assert.equal(list[0].source, SOURCE_KIND.CAMERA_OCR);
  assert.equal(list[1].testPoint, 'TP1');
});

test('add() throws without a measurement rather than storing garbage', () => {
  const history = createMeasurementHistory(memStorage());
  assert.throws(() => history.add({ testPoint: 'TP1' }));
});

test('clear() empties the history', () => {
  const history = createMeasurementHistory(memStorage());
  history.add({ measurement: Measurement.create({ value: 1, unit: 'V', mode: 'DC_VOLTAGE', source: SOURCE_KIND.SIMULATION }) });
  history.clear();
  assert.equal(history.list().length, 0);
});

test('remove() deletes a single entry by id', () => {
  const history = createMeasurementHistory(memStorage());
  const e = history.add({ measurement: Measurement.create({ value: 1, unit: 'V', mode: 'DC_VOLTAGE', source: SOURCE_KIND.SIMULATION }) });
  history.remove(e.id);
  assert.equal(history.list().length, 0);
});

test('persistence survives across separate createMeasurementHistory() calls on the same storage', () => {
  const storage = memStorage();
  createMeasurementHistory(storage).add({ measurement: Measurement.create({ value: 1, unit: 'V', mode: 'DC_VOLTAGE', source: SOURCE_KIND.SIMULATION }) });
  const secondHandle = createMeasurementHistory(storage);
  assert.equal(secondHandle.list().length, 1);
});

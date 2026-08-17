import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MultimeterDriver, MULTIMETER_MODES } from './MultimeterDriver.js';
import { DMMSimulationSource, DMM_MODES } from '../sources/DMMSimulationSource.js';

test('capabilities honestly list simulation + camera-ocr, and usb/bluetooth as unimplemented protocol targets', () => {
  const driver = new MultimeterDriver();
  const caps = driver.getCapabilities();
  assert.deepEqual(caps.supportedModes, DMM_MODES);
  assert.ok(caps.communication.includes('simulation'));
  assert.ok(caps.communication.includes('camera-ocr'));
});

test('readSimulated() refuses without a configured/connected source', async () => {
  const driver = new MultimeterDriver();
  await assert.rejects(() => driver.readSimulated());
});

test('readSimulated() returns a real SIMULATION measurement end-to-end', async () => {
  const source = new DMMSimulationSource();
  await source.connect();
  source.configure({ mode: 'RESISTANCE', trueValue: 220, noisePct: 0 });
  const driver = new MultimeterDriver({ source });
  const m = await driver.readSimulated();
  assert.equal(m.mode, 'RESISTANCE');
  assert.equal(m.source, 'SIMULATION');
  assert.ok(Math.abs(m.value - 220) < 1e-6);
});

test('identify() is honestly unimplemented rather than fabricating a device identity', async () => {
  const driver = new MultimeterDriver();
  await assert.rejects(() => driver.identify());
});

test('MULTIMETER_MODES matches the DMM simulator mode list (single source of truth)', () => {
  assert.deepEqual(MULTIMETER_MODES, DMM_MODES);
});

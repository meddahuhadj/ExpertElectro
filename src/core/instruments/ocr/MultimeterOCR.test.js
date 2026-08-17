import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMultimeterOCRResponse, extractJson, buildMultimeterOCRPrompt, OCR_CONFIDENCE_THRESHOLD } from './MultimeterOCR.js';
import { SOURCE_KIND } from '../Measurement.js';

test('buildMultimeterOCRPrompt mentions the honesty rule and lists valid modes', () => {
  const p = buildMultimeterOCRPrompt();
  assert.match(p, /n'invente RIEN/i);
  assert.match(p, /DC_VOLTAGE/);
});

test('extractJson handles a fenced ```json block', () => {
  const j = extractJson('```json\n{"a":1}\n```');
  assert.deepEqual(j, { a: 1 });
});

test('extractJson handles stray text around the object', () => {
  const j = extractJson('Voici le résultat: {"a":1} merci.');
  assert.deepEqual(j, { a: 1 });
});

test('extractJson returns null on unparsable text', () => {
  assert.equal(extractJson('pas de json ici'), null);
});

test('a confident, well-formed reading produces a CAMERA_OCR measurement needing no confirmation', () => {
  const raw = JSON.stringify({ readable: true, raw_display_text: '12.47', value: 12.47, unit: 'V', mode: 'DC_VOLTAGE', confidence: 0.96, notes: null });
  const r = parseMultimeterOCRResponse(raw);
  assert.equal(r.ok, true);
  assert.equal(r.measurement.source, SOURCE_KIND.CAMERA_OCR);
  assert.equal(r.measurement.value, 12.47);
  assert.equal(r.needsConfirmation, false);
});

test('a low-confidence reading is flagged as needing confirmation, never silently accepted', () => {
  const raw = JSON.stringify({ readable: true, value: 5.0, unit: 'V', mode: 'DC_VOLTAGE', confidence: 0.4 });
  const r = parseMultimeterOCRResponse(raw);
  assert.equal(r.ok, true);
  assert.equal(r.needsConfirmation, true);
  assert.ok(r.measurement.confidence < OCR_CONFIDENCE_THRESHOLD);
});

test('an unreadable screen never fabricates a value', () => {
  const raw = JSON.stringify({ readable: false, value: null, unit: null, mode: null, confidence: 0.1, notes: 'écran flou' });
  const r = parseMultimeterOCRResponse(raw);
  assert.equal(r.ok, false);
  assert.match(r.reason, /flou/);
});

test('a missing unit is rejected rather than guessed', () => {
  const raw = JSON.stringify({ readable: true, value: 5, unit: null, mode: 'DC_VOLTAGE', confidence: 0.9 });
  const r = parseMultimeterOCRResponse(raw);
  assert.equal(r.ok, false);
});

test('an unparsable response is rejected, not treated as zero/empty', () => {
  const r = parseMultimeterOCRResponse('not json at all');
  assert.equal(r.ok, false);
  assert.match(r.reason, /JSON/);
});

test('an unknown mode string is normalized to UNKNOWN rather than accepted verbatim', () => {
  const raw = JSON.stringify({ readable: true, value: 3.3, unit: 'V', mode: 'SOMETHING_WEIRD', confidence: 0.9 });
  const r = parseMultimeterOCRResponse(raw);
  assert.equal(r.ok, true);
  assert.equal(r.measurement.mode, 'UNKNOWN');
});

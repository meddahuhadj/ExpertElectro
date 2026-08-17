import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExpectedNumeric, evaluateAgainstExpected, pickNextTestPoint, buildDiagnosticStep, suggestHypotheses } from './TestPointBridge.js';

test('parseExpectedNumeric extracts the numeric value from typical legacy expectedText strings', () => {
  assert.equal(parseExpectedNumeric('5.00 V'), 5);
  assert.equal(parseExpectedNumeric('0 V (masse / référence)'), 0);
  assert.equal(parseExpectedNumeric('-3.3 V'), -3.3);
  assert.equal(parseExpectedNumeric('Alimentation — valeur non déterminée'), null);
});

test('evaluateAgainstExpected reports "ok" within tolerance', () => {
  const r = evaluateAgainstExpected('12.00 V', 11.9);
  assert.equal(r.status, 'ok');
});

test('evaluateAgainstExpected reports "warn" just outside tolerance', () => {
  const r = evaluateAgainstExpected('5.00 V', 5.6); // tol = max(0.5,0.2)=0.5 ; diff=0.6 -> warn band (<=1.25)
  assert.equal(r.status, 'warn');
});

test('evaluateAgainstExpected reports "bad" far outside tolerance', () => {
  const r = evaluateAgainstExpected('5.00 V', 8.0);
  assert.equal(r.status, 'bad');
});

test('evaluateAgainstExpected reports "info" rather than a fabricated verdict when there is no numeric reference', () => {
  const r = evaluateAgainstExpected('Non calculable (masse non identifiée)', 4.2);
  assert.equal(r.status, 'info');
});

test('pickNextTestPoint prioritizes unmeasured points first', () => {
  const tps = [
    { id: 'TP1', measurement: { status: 'ok' } },
    { id: 'TP2', measurement: null },
    { id: 'TP3', measurement: { status: 'bad' } },
  ];
  assert.equal(pickNextTestPoint(tps).id, 'TP2');
});

test('pickNextTestPoint falls back to a flagged point when everything is measured', () => {
  const tps = [
    { id: 'TP1', measurement: { status: 'ok' } },
    { id: 'TP2', measurement: { status: 'warn' } },
  ];
  assert.equal(pickNextTestPoint(tps).id, 'TP2');
});

test('pickNextTestPoint returns null once everything is measured and ok', () => {
  const tps = [{ id: 'TP1', measurement: { status: 'ok' } }, { id: 'TP2', measurement: { status: 'ok' } }];
  assert.equal(pickNextTestPoint(tps), null);
});

test('pickNextTestPoint returns null for an empty or missing list rather than throwing', () => {
  assert.equal(pickNextTestPoint([]), null);
  assert.equal(pickNextTestPoint(null), null);
});

test('suggestHypotheses returns nothing for a conforming or unreferenced evaluation', () => {
  assert.deepEqual(suggestHypotheses(evaluateAgainstExpected('5 V', 5.0), 5.0), []);
  assert.deepEqual(suggestHypotheses(evaluateAgainstExpected('n/a', 5.0), 5.0), []);
});

test('suggestHypotheses flags near-zero voltage as an open-circuit hypothesis', () => {
  const evaluation = evaluateAgainstExpected('12 V', 0.02);
  const h = suggestHypotheses(evaluation, 0.02);
  assert.equal(h[0].code, 'open_or_disconnected');
});

test('suggestHypotheses distinguishes too-low from too-high', () => {
  const low = suggestHypotheses(evaluateAgainstExpected('12 V', 3), 3);
  assert.equal(low[0].code, 'dc_too_low');
  const high = suggestHypotheses(evaluateAgainstExpected('5 V', 11), 11);
  assert.equal(high[0].code, 'dc_too_high');
});

test('buildDiagnosticStep ties evaluation + next suggestion together deterministically', () => {
  const testPoint = { id: 'TP3', label: 'Gate Q1', expectedText: '5.00 V' };
  const allTestPoints = [
    { id: 'TP1', measurement: { status: 'ok' } },
    { id: 'TP3', measurement: null },
    { id: 'TP4', measurement: null },
  ];
  const analysis = { metrics: { vavg: 4.95 }, anomalies: [] };
  const step = buildDiagnosticStep(testPoint, analysis, allTestPoints);
  assert.equal(step.evaluation.status, 'ok');
  assert.equal(step.nextTestPoint.id, 'TP4');
});

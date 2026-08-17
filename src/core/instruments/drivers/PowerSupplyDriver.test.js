import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PowerSupplyDriver } from './PowerSupplyDriver.js';

test('configure()/getConfig() round-trip', () => {
  const d = new PowerSupplyDriver();
  d.configure({ voltageV: 12, currentLimitA: 1 });
  const cfg = d.getConfig();
  assert.equal(cfg.voltageV, 12);
  assert.equal(cfg.currentLimitA, 1);
});

test('assessRisk() flags an in-limit bench voltage as not requiring heavy confirmation', () => {
  const d = new PowerSupplyDriver();
  const risk = d.assessRisk({ voltageV: 12, currentLimitA: 0.5 });
  assert.equal(risk.overVoltage, false);
  assert.equal(risk.dangerous, false);
  assert.equal(risk.requiresHeavyConfirmation, false);
});

test('assessRisk() flags an over-limit voltage as requiring heavy confirmation', () => {
  const d = new PowerSupplyDriver();
  const risk = d.assessRisk({ voltageV: 40, currentLimitA: 0.5 });
  assert.equal(risk.overVoltage, true);
  assert.equal(risk.requiresHeavyConfirmation, true);
});

test('assessRisk() flags mains-adjacent voltage (>=50V) as dangerous', () => {
  const d = new PowerSupplyDriver();
  const risk = d.assessRisk({ voltageV: 230, currentLimitA: 0.1 });
  assert.equal(risk.dangerous, true);
  assert.equal(risk.requiresHeavyConfirmation, true);
});

test('armOutput() always honestly refuses before reaching any real command — no PSU is ever connected in this phase', async () => {
  const d = new PowerSupplyDriver();
  await assert.rejects(() => d.armOutput({ voltageV: 5, currentLimitA: 0.1 }), /non connecté/i);
});

test('armOutput() does not call confirmFn for an in-limit, non-dangerous setpoint — nothing risky to confirm', async () => {
  const d = new PowerSupplyDriver();
  let called = false;
  await assert.rejects(() => d.armOutput({ voltageV: 5, currentLimitA: 0.1 }, { confirmFn: async () => { called = true; return true; } }));
  assert.equal(called, false);
});

test('armOutput() DOES call confirmFn for a mains-adjacent setpoint, even though nothing is connected — ' +
     'the safety confirmation must be genuinely exercised, then the command still honestly fails', async () => {
  const d = new PowerSupplyDriver();
  let called = false;
  await assert.rejects(
    () => d.armOutput({ voltageV: 230, currentLimitA: 0.1 }, { confirmFn: async () => { called = true; return true; } }),
    /non connecté/i
  );
  assert.equal(called, true, 'confirmFn must be invoked for a dangerous setpoint regardless of connection state');
});

test('armOutput() is refused outright if confirmation is denied for a dangerous setpoint', async () => {
  const d = new PowerSupplyDriver();
  await assert.rejects(
    () => d.armOutput({ voltageV: 230, currentLimitA: 0.1 }, { confirmFn: async () => false }),
    /annulée|refusée/i
  );
});

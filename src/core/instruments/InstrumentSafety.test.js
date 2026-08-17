import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCommand } from './InstrumentSafety.js';

function fakeInstrument({ connected = true, probeState = 'connected' } = {}) {
  return { connection: { isConnected: connected }, probeState };
}

test('refuses any command with no instrument specified', async () => {
  const r = await checkCommand({ command: 'armOutput' });
  assert.equal(r.allowed, false);
});

test('refuses when the instrument is not connected', async () => {
  const r = await checkCommand({ instrument: fakeInstrument({ connected: false }), command: 'armOutput' });
  assert.equal(r.allowed, false);
  assert.match(r.reason, /non connecté/i);
});

test('refuses when the probe is disconnected', async () => {
  const r = await checkCommand({ instrument: fakeInstrument({ probeState: 'disconnected' }), command: 'armOutput' });
  assert.equal(r.allowed, false);
  assert.match(r.reason, /sonde/i);
});

test('a dangerous command without a confirmFn is never silently allowed', async () => {
  const r = await checkCommand({ instrument: fakeInstrument(), command: 'armOutput', dangerous: true });
  assert.equal(r.allowed, false);
  assert.equal(r.requiresConfirmation, true);
});

test('a dangerous command is allowed only if confirmFn resolves true', async () => {
  const denied = await checkCommand({ instrument: fakeInstrument(), command: 'armOutput', dangerous: true, confirmFn: async () => false });
  assert.equal(denied.allowed, false);

  const allowed = await checkCommand({ instrument: fakeInstrument(), command: 'armOutput', dangerous: true, confirmFn: async () => true });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.requiresConfirmation, true);
});

test('over-voltage/over-current also forces confirmation even if not flagged "dangerous"', async () => {
  const r = await checkCommand({
    instrument: fakeInstrument(),
    command: 'armOutput',
    params: { voltage: 400, current: 0.1 },
    confirmFn: async () => true,
  });
  assert.equal(r.requiresConfirmation, true);
  assert.equal(r.allowed, true);
});

test('a safe, low command on a connected instrument does not require confirmation', async () => {
  const r = await checkCommand({
    instrument: fakeInstrument(),
    command: 'readVoltage',
    params: { voltage: 5, current: 0.01 },
  });
  assert.equal(r.allowed, true);
  assert.equal(r.requiresConfirmation, false);
});

test('a dangerous command DOES call confirmFn even when the instrument is not connected — ' +
     'the confirmation UI must be exercised for real, not skipped just because nothing is wired up yet', async () => {
  let called = false;
  const r = await checkCommand({
    instrument: fakeInstrument({ connected: false }),
    command: 'armOutput',
    dangerous: true,
    confirmFn: async () => { called = true; return true; },
  });
  assert.equal(called, true, 'confirmFn must be invoked before the connection check for a dangerous command');
  // La confirmation a été obtenue, mais la commande reste refusée car
  // rien n'est réellement connecté — jamais de fausse activation.
  assert.equal(r.allowed, false);
  assert.match(r.reason, /non connecté/i);
});

test('a non-dangerous, in-limit command never calls confirmFn — nothing risky to confirm', async () => {
  let called = false;
  await checkCommand({
    instrument: fakeInstrument({ connected: false }),
    command: 'armOutput',
    params: { voltage: 5, current: 0.1 },
    confirmFn: async () => { called = true; return true; },
  });
  assert.equal(called, false);
});

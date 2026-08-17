// ═══════════════════════════════════════════════════════
// InstrumentConnection — petite machine à états de connexion
// ═══════════════════════════════════════════════════════
// Utilisée par Instrument/InstrumentManager pour suivre l'état réel
// d'une connexion (jamais un état "connecté" affiché sans transition
// explicite passée par connecting → connected).

export const CONNECTION_STATES = Object.freeze({
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
});

const VALID_TRANSITIONS = {
  disconnected: ['connecting'],
  connecting: ['connected', 'error', 'disconnected'],
  connected: ['disconnected', 'error'],
  error: ['disconnected', 'connecting'],
};

export class InstrumentConnection {
  constructor() {
    this.state = CONNECTION_STATES.DISCONNECTED;
    this.lastError = null;
    this._listeners = new Map();
  }

  on(event, cb) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(cb);
    return () => this._listeners.get(event)?.delete(cb);
  }

  _emit(event, payload) {
    for (const cb of this._listeners.get(event) ?? []) {
      try { cb(payload); } catch (e) { console.error('InstrumentConnection listener error:', e); }
    }
  }

  transition(nextState, detail) {
    const allowed = VALID_TRANSITIONS[this.state] ?? [];
    if (!allowed.includes(nextState)) {
      throw new Error(`InstrumentConnection: transition invalide ${this.state} → ${nextState}`);
    }
    const prev = this.state;
    this.state = nextState;
    if (nextState === CONNECTION_STATES.ERROR) this.lastError = detail ?? null;
    this._emit('change', { from: prev, to: nextState, detail });
  }

  get isConnected() {
    return this.state === CONNECTION_STATES.CONNECTED;
  }
}

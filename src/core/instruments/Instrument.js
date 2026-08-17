// ═══════════════════════════════════════════════════════
// Instrument — représentation d'un instrument enregistré
// ═══════════════════════════════════════════════════════
// Regroupe un driver, sa source de données et son état de connexion.
// Utilisé par InstrumentRegistry/InstrumentManager ; volontairement un
// simple conteneur (la logique vit dans les drivers/sources).

import { InstrumentConnection } from './InstrumentConnection.js';

export class Instrument {
  /**
   * @param {object} opts
   * @param {string} opts.id
   * @param {string} opts.label
   * @param {string} [opts.icon]
   * @param {import('./InstrumentDriver.js').InstrumentDriver} [opts.driver]
   */
  constructor({ id, label, icon = '🔧', driver = null }) {
    if (!id) throw new Error('Instrument: "id" requis');
    this.id = id;
    this.label = label ?? id;
    this.icon = icon;
    this.driver = driver;
    this.connection = new InstrumentConnection();
    this.probeState = 'unknown'; // 'connected' | 'disconnected' | 'unknown'
  }

  get capabilities() {
    return this.driver ? this.driver.getCapabilities() : null;
  }

  get isConnected() {
    return this.connection.isConnected;
  }
}

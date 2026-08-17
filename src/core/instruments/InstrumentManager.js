// ═══════════════════════════════════════════════════════
// InstrumentManager — façade unique utilisée par l'UI
// ═══════════════════════════════════════════════════════
// L'UI (oscilloscope-ui.js) ne parle qu'à cet objet : il compose
// InstrumentRegistry + les drivers + InstrumentSafety, pour que
// l'interface n'ait jamais besoin de connaître les détails d'un
// transport ou d'un protocole particulier.

import { InstrumentRegistry } from './InstrumentRegistry.js';
import { OscilloscopeDriver } from './drivers/OscilloscopeDriver.js';

class InstrumentManagerImpl {
  constructor(registry = InstrumentRegistry) {
    this.registry = registry;
    this._drivers = new Map(); // id -> driver instance actif
  }

  /**
   * Associe un driver déjà construit (avec sa source) à un instrument
   * du registre, et met à jour son statut/capacités affichés.
   */
  attachDriver(instrumentId, driver, status = 'connected', detail = '') {
    this._drivers.set(instrumentId, driver);
    this.registry.setDriver(instrumentId, driver);
    this.registry.setStatus(instrumentId, status, detail);
  }

  detachDriver(instrumentId) {
    this._drivers.delete(instrumentId);
    this.registry.setDriver(instrumentId, null);
    this.registry.setStatus(instrumentId, 'disconnected', '');
  }

  getDriver(instrumentId) {
    return this._drivers.get(instrumentId) ?? null;
  }

  getStatus(instrumentId) {
    return this.registry.get(instrumentId);
  }

  listInstruments() {
    return this.registry.list();
  }

  /** Raccourci : acquiert une forme d'onde depuis l'oscilloscope actif. */
  async acquireOscilloscope(mode = 'single') {
    const driver = this.getDriver('oscilloscope');
    if (!(driver instanceof OscilloscopeDriver)) {
      throw new Error('InstrumentManager: aucun pilote oscilloscope actif');
    }
    return driver.acquire(mode);
  }
}

export const InstrumentManager = new InstrumentManagerImpl();
export { InstrumentManagerImpl };

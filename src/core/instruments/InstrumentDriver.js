// ═══════════════════════════════════════════════════════
// InstrumentDriver — classe de base pour tous les pilotes d'instrument
// ═══════════════════════════════════════════════════════
// Un driver compose une InstrumentSource (le transport/la génération de
// données) avec les capacités déclarées de l'instrument. identify()/
// test()/calibrate() sont volontairement "non implémenté" par défaut :
// seuls les drivers qui peuvent honnêtement les fournir les redéfinissent.

export class InstrumentDriver {
  /**
   * @param {object} opts
   * @param {string} opts.type — 'oscilloscope' | 'multimeter' | 'function-generator' | 'power-supply' | 'logic-analyzer' | 'generic'
   * @param {import('./sources/InstrumentSource.js').InstrumentSource} [opts.source]
   * @param {object} [opts.capabilities]
   */
  constructor({ type, source = null, capabilities = {} } = {}) {
    this.type = type ?? 'generic';
    this.source = source;
    this.capabilities = { type: this.type, communication: [], supportedModes: [], ...capabilities };
  }

  setSource(source) {
    this.source = source;
  }

  async identify() {
    throw new Error(`Pilote "${this.type}" : identify() non implémenté (aucun instrument réel piloté — Phase 2)`);
  }

  async test() {
    throw new Error(`Pilote "${this.type}" : test() non implémenté (Phase 2)`);
  }

  async calibrate() {
    throw new Error(`Pilote "${this.type}" : calibrate() non implémenté (Phase 2) — aucun instrument ne doit être « calibré » virtuellement.`);
  }

  getCapabilities() {
    return { ...this.capabilities };
  }
}

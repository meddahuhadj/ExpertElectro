// Pilote générique — utilisé pour tout type d'instrument non encore
// spécialisé. N'invente aucune capacité : capabilities reste minimal
// et honnête tant qu'aucun matériel réel n'a été décrit précisément.
import { InstrumentDriver } from '../InstrumentDriver.js';

export class GenericInstrumentDriver extends InstrumentDriver {
  constructor(opts = {}) {
    super({ type: opts.type ?? 'generic', source: opts.source, capabilities: opts.capabilities });
  }
}

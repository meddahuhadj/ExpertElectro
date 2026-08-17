// ═══════════════════════════════════════════════════════
// InstrumentRegistry — état vrai des instruments connus de l'app
// ═══════════════════════════════════════════════════════
// Pré-enregistre les 5 types d'instrument visés par le cahier des
// charges. Tous démarrent 'disconnected' (⚪) : c'est le panneau
// "Mes Instruments" qui lit cet état tel quel, jamais un état deviné.

export const DEFAULT_INSTRUMENTS = Object.freeze([
  { id: 'oscilloscope', label: 'Oscilloscope', icon: '🔬' },
  { id: 'multimeter', label: 'Multimètre', icon: '📏' },
  { id: 'function-generator', label: 'Générateur de fonctions', icon: '〰️' },
  { id: 'power-supply', label: 'Alimentation programmable', icon: '🔋' },
  { id: 'logic-analyzer', label: 'Analyseur logique', icon: '📡' },
]);

function makeRegistry() {
  const entries = new Map();
  for (const def of DEFAULT_INSTRUMENTS) {
    entries.set(def.id, { ...def, status: 'disconnected', detail: '', capabilities: null, driver: null });
  }

  return {
    register(def) {
      if (!def || !def.id) throw new Error('InstrumentRegistry.register: "id" requis');
      const existing = entries.get(def.id) ?? {};
      entries.set(def.id, { status: 'disconnected', detail: '', capabilities: null, driver: null, ...existing, ...def });
    },
    list() {
      return Array.from(entries.values());
    },
    get(id) {
      return entries.get(id) ?? null;
    },
    setStatus(id, status, detail = '') {
      const e = entries.get(id);
      if (!e) throw new Error(`InstrumentRegistry.setStatus: instrument inconnu "${id}"`);
      e.status = status; // 'disconnected' | 'available' | 'connected' | 'error'
      e.detail = detail;
    },
    setDriver(id, driver) {
      const e = entries.get(id);
      if (!e) throw new Error(`InstrumentRegistry.setDriver: instrument inconnu "${id}"`);
      e.driver = driver;
      e.capabilities = driver ? driver.getCapabilities() : null;
    },
    reset() {
      entries.clear();
      for (const def of DEFAULT_INSTRUMENTS) {
        entries.set(def.id, { ...def, status: 'disconnected', detail: '', capabilities: null, driver: null });
      }
    },
  };
}

// Instance partagée par toute l'app (comme les autres modules `const X = {...}` du projet).
export const InstrumentRegistry = makeRegistry();

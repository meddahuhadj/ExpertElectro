// ═══════════════════════════════════════════════════════
// MeasurementHistory — historisation des mesures (cahier des charges §21)
// ═══════════════════════════════════════════════════════
// Chaque mesure DMM (simulation, OCR caméra, plus tard réelle) peut
// être ajoutée ici avec son contexte (point de test, instrument…).
// Stockage injectable (`storage`) pour rester testable sous Node sans
// navigateur — utilise localStorage quand disponible (vrai
// navigateur), sinon un repli en mémoire (uniquement pour les tests ;
// en production, localStorage est toujours présent).

const STORAGE_KEY = 'hadj_dmm_history';
const MAX_ENTRIES = 200;

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, v); },
  };
}

function defaultStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch (_) { /* accès bloqué (contexte restreint) */ }
  return memoryStorage();
}

export function createMeasurementHistory(storage = defaultStorage()) {
  function load() {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }
  function save(entries) {
    try { storage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES))); } catch (_) { /* quota/indisponible : perte silencieuse acceptable pour un historique */ }
  }

  return {
    /**
     * @param {object} fields — {measurement, instrument, channel, testPoint, circuit, operator, note}
     *   `measurement` doit être un objet Measurement déjà validé (voir Measurement.js).
     */
    add(fields) {
      if (!fields || !fields.measurement) throw new Error('MeasurementHistory.add: "measurement" requis');
      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        instrument: fields.instrument ?? 'multimeter',
        channel: fields.channel ?? null,
        value: fields.measurement.value,
        unit: fields.measurement.unit,
        mode: fields.measurement.mode,
        source: fields.measurement.source,
        confidence: fields.measurement.confidence ?? null,
        testPoint: fields.testPoint ?? null,
        circuit: fields.circuit ?? null,
        operator: fields.operator ?? null,
        note: fields.note ?? null,
      };
      const entries = load();
      entries.unshift(entry);
      save(entries);
      return entry;
    },
    list() { return load(); },
    clear() { save([]); },
    remove(id) { save(load().filter(e => e.id !== id)); },
  };
}

export const MeasurementHistory = createMeasurementHistory();

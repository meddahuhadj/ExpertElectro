// ═══════════════════════════════════════════════════════
// Measurement — mesure scalaire standard HADJ EXPERT
// ═══════════════════════════════════════════════════════
// RÈGLE ABSOLUE DU PROJET (cahier des charges §10/§29) : une mesure
// affichée ne doit JAMAIS laisser croire qu'elle est réelle si elle ne
// l'est pas. SOURCE_KIND est la liste fermée des provenances possibles ;
// Measurement.validate() refuse toute autre valeur. Ce n'est donc pas
// qu'une convention de nommage : c'est une garde mécanique.

export const SOURCE_KIND = Object.freeze({
  REAL: 'REAL',              // mesure lue sur un instrument réellement connecté
  SIMULATION: 'SIMULATION',  // générée par le moteur de simulation local
  IMPORT: 'IMPORT',          // chargée depuis un fichier (CSV/JSON/WAV)
  CAMERA_OCR: 'CAMERA_OCR',  // lue par OCR/IA sur une photo d'appareil de mesure
});

const VALID_SOURCES = Object.freeze(Object.values(SOURCE_KIND));

export class MeasurementValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MeasurementValidationError';
  }
}

export class Measurement {
  constructor(fields) {
    Object.assign(this, fields);
  }

  static create(fields = {}) {
    const m = new Measurement({
      value: fields.value,
      unit: fields.unit,
      mode: fields.mode,
      timestamp: fields.timestamp ?? Date.now(),
      accuracy: fields.accuracy ?? null,
      source: fields.source,
      confidence: fields.confidence ?? (fields.source === SOURCE_KIND.REAL ? 1 : null),
    });
    Measurement.validate(m);
    return m;
  }

  /** Vérifie le format ET la provenance. Lève MeasurementValidationError sinon. */
  static validate(m) {
    if (!m || typeof m !== 'object') {
      throw new MeasurementValidationError('Measurement invalide : objet attendu');
    }
    if (typeof m.value !== 'number' || Number.isNaN(m.value)) {
      throw new MeasurementValidationError('Measurement invalide : "value" doit être un nombre');
    }
    if (!m.unit || typeof m.unit !== 'string') {
      throw new MeasurementValidationError('Measurement invalide : "unit" manquante');
    }
    if (!VALID_SOURCES.includes(m.source)) {
      throw new MeasurementValidationError(
        `Measurement invalide : source "${m.source}" inconnue — doit être l'une de [${VALID_SOURCES.join(', ')}]. ` +
        `Ne jamais étiqueter une mesure sans provenance explicite.`
      );
    }
    if (m.confidence != null && (m.confidence < 0 || m.confidence > 1)) {
      throw new MeasurementValidationError('Measurement invalide : "confidence" doit être entre 0 et 1');
    }
    return true;
  }

  /** Libellé d'affichage court et non-ambigu pour la provenance. */
  static sourceLabel(source) {
    switch (source) {
      case SOURCE_KIND.REAL: return '🟢 RÉEL';
      case SOURCE_KIND.SIMULATION: return '🟡 SIMULATION';
      case SOURCE_KIND.IMPORT: return '📂 IMPORT';
      case SOURCE_KIND.CAMERA_OCR: return '📷 OCR CAMÉRA';
      default: return '⚪ INCONNU';
    }
  }
}

// ═══════════════════════════════════════════════════════
// Waveform — format interne standard HADJ EXPERT
// ═══════════════════════════════════════════════════════
// Toute forme d'onde manipulée par l'application (simulation, import,
// futur pilote USB/Bluetooth/LAN, etc.) est convertie vers cet objet
// unique AVANT d'entrer dans le Signal Engine. Le moteur d'analyse ne
// doit jamais dépendre de la marque/du protocole de l'instrument
// d'origine — il ne connaît que cette forme.
//
// Champs (repris tels quels du cahier des charges) :
//   timestamp        — Date.now() (ms) au moment de l'acquisition
//   sampleRate        — Hz
//   samples           — Float64Array | number[] de tensions (V)
//   channel           — identifiant de voie (ex: 'CH1')
//   voltageRange      — {min,max} en V, plage d'affichage/instrument
//   coupling          — 'DC' | 'AC' | 'GND'
//   offset            — décalage vertical appliqué à l'affichage (V)
//   trigger           — {mode,level,edge} ou null
//   acquisitionMode   — 'single' | 'continuous' | 'import'
//   unit              — 'V' par défaut (permet A, °C… pour d'autres capteurs)
//   metadata          — {source, instrumentId, signalType, note, ...}
//                        source ∈ SOURCE_KIND (voir Measurement.js) — c'est
//                        LE champ qui porte la distinction RÉEL / SIMULATION /
//                        IMPORT / CAMERA-OCR pour toute la chaîne en aval.

/**
 * Lancée quand une forme d'onde ne respecte pas le format standard.
 * Volontairement stricte : mieux vaut échouer tôt qu'analyser des
 * données mal formées et produire un diagnostic silencieusement faux.
 */
export class WaveformValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WaveformValidationError';
  }
}

export const VALID_COUPLINGS = Object.freeze(['DC', 'AC', 'GND']);
export const VALID_ACQUISITION_MODES = Object.freeze(['single', 'continuous', 'import']);

export class Waveform {
  constructor(fields) {
    Object.assign(this, fields);
  }

  /** Nombre d'échantillons. */
  get length() {
    return this.samples ? this.samples.length : 0;
  }

  /** Durée totale de la capture, en secondes. */
  durationS() {
    if (!this.sampleRate || !this.length) return 0;
    return this.length / this.sampleRate;
  }

  /** Instant (s) du n-ième échantillon, relatif au début de la capture. */
  timeAt(index) {
    if (!this.sampleRate) return 0;
    return index / this.sampleRate;
  }

  /** Valeur interpolée (linéaire) à l'instant t (s) depuis le début de la capture. */
  sampleAt(t) {
    if (!this.sampleRate || !this.length) return null;
    const idxF = t * this.sampleRate;
    const i0 = Math.floor(idxF);
    if (i0 < 0 || i0 >= this.length) return null;
    if (i0 === this.length - 1) return this.samples[i0];
    const frac = idxF - i0;
    return this.samples[i0] * (1 - frac) + this.samples[i0 + 1] * frac;
  }

  /**
   * Construit un Waveform en remplissant les champs manquants avec des
   * valeurs par défaut explicites (jamais devinées silencieusement pour
   * les champs porteurs de sens physique — seuls channel/coupling/trigger/
   * unit/metadata reçoivent des valeurs neutres).
   */
  static create(fields = {}) {
    const w = new Waveform({
      timestamp: fields.timestamp ?? Date.now(),
      sampleRate: fields.sampleRate,
      samples: fields.samples,
      channel: fields.channel ?? 'CH1',
      voltageRange: fields.voltageRange ?? null,
      coupling: fields.coupling ?? 'DC',
      offset: fields.offset ?? 0,
      trigger: fields.trigger ?? null,
      acquisitionMode: fields.acquisitionMode ?? 'single',
      unit: fields.unit ?? 'V',
      metadata: fields.metadata ?? {},
    });
    Waveform.validate(w);
    return w;
  }

  /** Vérifie que l'objet respecte le format standard. Lève WaveformValidationError sinon. */
  static validate(w) {
    if (!w || typeof w !== 'object') {
      throw new WaveformValidationError('Waveform invalide : objet attendu');
    }
    if (!Array.isArray(w.samples) && !(w.samples instanceof Float64Array) && !(w.samples instanceof Float32Array)) {
      throw new WaveformValidationError('Waveform invalide : "samples" doit être un tableau de nombres');
    }
    if (w.samples.length === 0) {
      throw new WaveformValidationError('Waveform invalide : "samples" est vide (aucune acquisition)');
    }
    if (typeof w.sampleRate !== 'number' || !(w.sampleRate > 0)) {
      throw new WaveformValidationError('Waveform invalide : "sampleRate" doit être un nombre positif');
    }
    if (w.coupling && !VALID_COUPLINGS.includes(w.coupling)) {
      throw new WaveformValidationError(`Waveform invalide : coupling "${w.coupling}" inconnu`);
    }
    if (w.acquisitionMode && !VALID_ACQUISITION_MODES.includes(w.acquisitionMode)) {
      throw new WaveformValidationError(`Waveform invalide : acquisitionMode "${w.acquisitionMode}" inconnu`);
    }
    if (!w.metadata || typeof w.metadata !== 'object') {
      throw new WaveformValidationError('Waveform invalide : "metadata" doit être un objet');
    }
    return true;
  }
}

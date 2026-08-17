// ═══════════════════════════════════════════════════════
// DMMSimulationSource — multimètre virtuel
// ═══════════════════════════════════════════════════════
// Même principe que SimulationSource (oscilloscope) : génère une VRAIE
// mesure scalaire calculée (valeur cible + bruit gaussien réel), jamais
// une valeur pré-écrite, systématiquement étiquetée SIMULATION.

import { InstrumentSource } from './InstrumentSource.js';
import { Measurement, SOURCE_KIND } from '../Measurement.js';
import { makeRng, gaussian } from '../../util/random.js';

// Valeur cible et unité par défaut, par mode — des exemples
// pédagogiques raisonnables, jamais une tension secteur par défaut
// (voir InstrumentSafety / avertissements §14 du cahier des charges).
export const DMM_MODE_DEFAULTS = Object.freeze({
  DC_VOLTAGE: { unit: 'V', trueValue: 5.0 },
  AC_VOLTAGE: { unit: 'V', trueValue: 12.0 },
  RESISTANCE: { unit: 'Ω', trueValue: 1000 },
  CONTINUITY: { unit: 'Ω', trueValue: 0.5 },
  DIODE: { unit: 'V', trueValue: 0.65 },
  CAPACITANCE: { unit: 'µF', trueValue: 10 },
  FREQUENCY: { unit: 'Hz', trueValue: 1000 },
  TEMPERATURE: { unit: '°C', trueValue: 25 },
  CURRENT: { unit: 'A', trueValue: 0.5 },
});

export const DMM_MODES = Object.freeze(Object.keys(DMM_MODE_DEFAULTS));

/**
 * Calcule une mesure simulée pour un mode donné.
 * @param {object} p
 * @param {string} p.mode — l'un de DMM_MODES
 * @param {number} [p.trueValue] — valeur cible (défaut : DMM_MODE_DEFAULTS[mode].trueValue)
 * @param {string} [p.unit] — défaut : DMM_MODE_DEFAULTS[mode].unit
 * @param {number} [p.noisePct=1.5] — bruit gaussien, % de la valeur cible
 * @param {number} [p.seed]
 * @returns {import('../Measurement.js').Measurement}
 */
export function generateReading(p) {
  const { mode, noisePct = 1.5, seed } = p;
  const def = DMM_MODE_DEFAULTS[mode];
  if (!def) throw new Error(`DMMSimulationSource: mode inconnu "${mode}"`);
  const trueValue = p.trueValue ?? def.trueValue;
  const unit = p.unit ?? def.unit;
  const rng = makeRng(seed);
  const noiseStd = Math.abs(trueValue) * (noisePct / 100);
  const value = trueValue + gaussian(rng) * noiseStd;

  return Measurement.create({
    value,
    unit,
    mode,
    accuracy: noisePct != null ? `±${noisePct}% (simulé)` : null,
    source: SOURCE_KIND.SIMULATION,
    confidence: 1,
  });
}

export class DMMSimulationSource extends InstrumentSource {
  constructor() {
    super('simulation');
    this._params = { mode: 'DC_VOLTAGE', noisePct: 1.5 };
    this._connected = false;
  }

  async connect() { this._connected = true; return true; }
  async disconnect() { this._connected = false; }
  configure(opts) { Object.assign(this._params, opts); }
  async startAcquisition() {
    if (!this._connected) throw new Error('DMMSimulationSource: appelez connect() avant startAcquisition()');
  }
  async stopAcquisition() { /* no-op : lecture instantanée */ }

  async readData() {
    if (!this._connected) throw new Error('DMMSimulationSource: non connecté');
    return generateReading(this._params);
  }

  getStatus() {
    return {
      connected: this._connected,
      mode: 'SIMULATION',
      label: '🟡 MODE SIMULATION',
      detail: this._connected ? this._params.mode : 'inactif',
    };
  }
}

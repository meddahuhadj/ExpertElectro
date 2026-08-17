// ═══════════════════════════════════════════════════════
// SimulationSource — oscilloscope virtuel
// ═══════════════════════════════════════════════════════
// Génère de VRAIS échantillons (calculs réels, pas de résultats
// pré-écrits) pour 12 familles de signaux, afin que l'application
// fonctionne intégralement même sans instrument physique, et que le
// Signal Engine / FFT Engine puissent être exercés par les mêmes
// moteurs qu'une acquisition réelle.
//
// Toute Waveform produite ici porte metadata.source='SIMULATION' et
// DOIT être affichée avec le bandeau "🟡 MODE SIMULATION" — jamais
// présentée comme une mesure réelle (cahier des charges §5/§29).

import { InstrumentSource } from './InstrumentSource.js';
import { Waveform } from '../Waveform.js';
import { SOURCE_KIND } from '../Measurement.js';
import { makeRng, gaussian } from '../../util/random.js';

export const SIGNAL_TYPES = Object.freeze([
  'sine', 'square', 'triangle', 'sawtooth', 'pulse', 'noise',
  'rectified_half', 'rectified_full', 'pwm', 'audio', 'dc',
  'faulty', 'intermittent',
]);

/** Fraction de période [0,1) à l'instant t, fréquence f, phase en degrés. */
function phaseFrac(t, f, phaseDeg) {
  const x = t * f + (phaseDeg || 0) / 360;
  return x - Math.floor(x);
}

function baseValue(type, t, f, phaseDeg, dutyCycle, opts) {
  const frac = phaseFrac(t, f, phaseDeg);
  switch (type) {
    case 'sine':
      return Math.sin(2 * Math.PI * frac);
    case 'square':
    case 'pulse':
    case 'pwm': {
      const duty = (dutyCycle ?? 50) / 100;
      let effDuty = duty;
      if (type === 'pwm' && opts?.dutyModHz) {
        const mod = 0.5 + 0.4 * Math.sin(2 * Math.PI * opts.dutyModHz * t);
        effDuty = Math.max(0.02, Math.min(0.98, duty * mod));
      }
      return frac < effDuty ? 1 : -1;
    }
    case 'triangle':
      return (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * frac));
    case 'sawtooth':
      return 2 * frac - 1;
    case 'rectified_half': {
      const s = Math.sin(2 * Math.PI * frac);
      return s > 0 ? 2 * s - 1 : -1; // ramène le demi-cycle nul vers -1 (bas d'échelle) pour rester dans [-1,1]
    }
    case 'rectified_full':
      return 2 * Math.abs(Math.sin(2 * Math.PI * frac)) - 1;
    case 'audio': {
      // fondamentale + harmoniques pondérées, normalisé à ~1 crête
      const h2 = 0.5 * Math.sin(2 * Math.PI * 2 * frac + 0.3);
      const h3 = 0.25 * Math.sin(2 * Math.PI * 3 * frac + 1.1);
      const h4 = 0.12 * Math.sin(2 * Math.PI * 4 * frac + 2.0);
      return (Math.sin(2 * Math.PI * frac) + h2 + h3 + h4) / 1.87;
    }
    case 'dc':
      return 0;
    default:
      return Math.sin(2 * Math.PI * frac);
  }
}

function applyDefect(v, t, f, defectType, phaseDeg) {
  switch (defectType) {
    case 'clipping': {
      const threshold = 0.6;
      return Math.max(-threshold, Math.min(threshold, v)) / threshold;
    }
    case 'asymmetry':
      return v > 0 ? v * 0.55 : v;
    case 'harmonicDistortion': {
      const frac = phaseFrac(t, f, phaseDeg);
      return (v + 0.35 * Math.sin(2 * Math.PI * 3 * frac)) / 1.35;
    }
    default:
      return v;
  }
}

/**
 * Génère une Waveform simulée.
 * @param {object} p
 * @param {string} p.signalType — l'une des SIGNAL_TYPES
 * @param {number} [p.sampleRate=200000]
 * @param {number} [p.sampleCount=2000]
 * @param {number} [p.frequencyHz=1000]
 * @param {number} [p.amplitudeVpp=5]
 * @param {number} [p.offsetV=0]
 * @param {number} [p.phaseDeg=0]
 * @param {number} [p.dutyCycle=50]
 * @param {number} [p.noisePct=0]      — bruit ajouté sur TOUS les types (% du Vpp)
 * @param {string} [p.defectType]      — 'clipping'|'asymmetry'|'harmonicDistortion' (type 'faulty')
 * @param {number} [p.dropoutProbability=0.15]  — (type 'intermittent') proba de coupure par fenêtre
 * @param {[number,number]} [p.dropoutDurationMsRange=[5,40]]
 * @param {number} [p.seed]
 * @param {string} [p.channel='CH1']
 */
export function generateWaveform(p) {
  const {
    signalType, sampleRate = 200000, sampleCount = 2000,
    frequencyHz = 1000, amplitudeVpp = 5, offsetV = 0, phaseDeg = 0,
    dutyCycle = 50, noisePct = 0, defectType = 'clipping',
    dropoutProbability = 0.15, dropoutDurationMsRange = [5, 40],
    seed, channel = 'CH1', dutyModHz,
  } = p;

  if (!SIGNAL_TYPES.includes(signalType)) {
    throw new Error(`SimulationSource: type de signal inconnu "${signalType}"`);
  }

  const rng = makeRng(seed);
  const samples = new Float64Array(sampleCount);
  const noiseStd = (noisePct / 100) * amplitudeVpp * 0.25; // Vpp ~= 4*stddev pour un bruit gaussien pur

  // Fenêtres de coupure pré-calculées pour le mode intermittent
  let dropoutWindows = [];
  if (signalType === 'intermittent') {
    const totalMs = (sampleCount / sampleRate) * 1000;
    let cursorMs = 0;
    while (cursorMs < totalMs) {
      const windowMs = 1000 / Math.max(frequencyHz, 1) * 4; // ~4 périodes par fenêtre testée
      if (rng() < dropoutProbability) {
        const dur = dropoutDurationMsRange[0] + rng() * (dropoutDurationMsRange[1] - dropoutDurationMsRange[0]);
        dropoutWindows.push([cursorMs, cursorMs + dur]);
      }
      cursorMs += windowMs;
    }
  }

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;
    let v;
    if (signalType === 'noise') {
      v = gaussian(rng);
    } else if (signalType === 'faulty') {
      const raw = baseValue('square', t, frequencyHz, phaseDeg, dutyCycle, { dutyModHz });
      v = applyDefect(raw, t, frequencyHz, defectType, phaseDeg);
    } else if (signalType === 'intermittent') {
      const tMs = t * 1000;
      const inDropout = dropoutWindows.some(([a, b]) => tMs >= a && tMs <= b);
      v = inDropout ? 0 : baseValue('sine', t, frequencyHz, phaseDeg, dutyCycle, {});
    } else {
      v = baseValue(signalType, t, frequencyHz, phaseDeg, dutyCycle, { dutyModHz });
    }

    let volts = signalType === 'dc' ? 0 : v * (amplitudeVpp / 2);
    if (noiseStd > 0) volts += gaussian(rng) * noiseStd;
    samples[i] = volts + offsetV;
  }

  return Waveform.create({
    sampleRate,
    samples,
    channel,
    voltageRange: { min: offsetV - amplitudeVpp, max: offsetV + amplitudeVpp },
    coupling: 'DC',
    offset: offsetV,
    trigger: null,
    acquisitionMode: 'single',
    unit: 'V',
    metadata: {
      source: SOURCE_KIND.SIMULATION,
      instrumentId: 'simulation',
      signalType,
      note: '🟡 MODE SIMULATION — signal généré localement, aucun instrument réel',
      params: { frequencyHz, amplitudeVpp, offsetV, dutyCycle, phaseDeg, noisePct, defectType: signalType === 'faulty' ? defectType : undefined },
    },
  });
}

export class SimulationSource extends InstrumentSource {
  constructor() {
    super('simulation');
    this._params = {
      signalType: 'sine', frequencyHz: 1000, amplitudeVpp: 5, offsetV: 0,
      dutyCycle: 50, phaseDeg: 0, noisePct: 2,
    };
    this._connected = false;
    this._acquiring = false;
  }

  async connect() {
    this._connected = true;
    return true;
  }

  async disconnect() {
    this._connected = false;
    this._acquiring = false;
  }

  configure(opts) {
    Object.assign(this._params, opts);
  }

  async startAcquisition() {
    if (!this._connected) throw new Error('SimulationSource: appelez connect() avant startAcquisition()');
    this._acquiring = true;
  }

  async stopAcquisition() {
    this._acquiring = false;
  }

  async readData() {
    if (!this._connected) throw new Error('SimulationSource: non connecté');
    return generateWaveform(this._params);
  }

  getStatus() {
    return {
      connected: this._connected,
      mode: 'SIMULATION',
      label: '🟡 MODE SIMULATION',
      detail: this._connected ? `${this._params.signalType} · ${this._params.frequencyHz}Hz` : 'inactif',
    };
  }
}

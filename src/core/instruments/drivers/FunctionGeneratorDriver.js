// ═══════════════════════════════════════════════════════
// FunctionGeneratorDriver — Phase 3
// ═══════════════════════════════════════════════════════
// L'envoi réel de commandes à un vrai générateur (SCPI ou propriétaire)
// reste non implémenté tant qu'aucun instrument USB/Bluetooth réel
// n'est piloté (Phase 4). Ce qui EST réel dès maintenant :
//  - configure()/previewWaveform() : calcule un VRAI aperçu du signal
//    configuré (réutilise le même moteur que SimulationSource — mêmes
//    maths, même Waveform standard) afin que l'utilisateur voie
//    exactement ce que le générateur produirait, SANS jamais prétendre
//    qu'un signal est réellement émis.
//  - sendOutput() : passe par InstrumentSafety.checkCommand() comme
//    n'importe quelle commande d'instrument ; sans connexion réelle,
//    échoue toujours honnêtement plutôt que de simuler un envoi réussi.

import { InstrumentDriver } from '../InstrumentDriver.js';
import { checkCommand } from '../InstrumentSafety.js';
import { generateWaveform } from '../sources/SimulationSource.js';
import { SOURCE_KIND } from '../Measurement.js';

// Formes de sortie exposées à l'UI (§12). "arbitrary" n'a pas
// d'équivalent dans SIGNAL_TYPES — l'aperçu retombe sur "sine" dans ce
// cas (documenté), l'envoi réel restera de toute façon non implémenté.
export const GENERATOR_WAVEFORMS = Object.freeze(['sine', 'square', 'triangle', 'sawtooth', 'pulse', 'dc', 'arbitrary']);
const PREVIEW_SIGNAL_TYPE = { sine: 'sine', square: 'square', triangle: 'triangle', sawtooth: 'sawtooth', pulse: 'pulse', dc: 'dc', arbitrary: 'sine' };

export class FunctionGeneratorDriver extends InstrumentDriver {
  constructor({ source = null } = {}) {
    super({
      type: 'function-generator',
      source,
      capabilities: {
        supportedModes: GENERATOR_WAVEFORMS,
        communication: ['usb', 'bluetooth', 'lan'],
      },
    });
    this.connection = null; // jamais 'connected' tant qu'aucun générateur réel n'est piloté (Phase 4)
    this.probeState = 'unknown';
    this._config = { waveform: 'sine', frequencyHz: 1000, amplitudeVpp: 5, offsetV: 0, dutyCycle: 50, phaseDeg: 0 };
  }

  configure(params = {}) {
    if (params.waveform && !GENERATOR_WAVEFORMS.includes(params.waveform)) {
      throw new Error(`FunctionGeneratorDriver: forme d'onde inconnue "${params.waveform}"`);
    }
    Object.assign(this._config, params);
    return { ...this._config };
  }

  getConfig() { return { ...this._config }; }

  /**
   * Calcule un VRAI aperçu (échantillons réels, mêmes moteurs que la
   * simulation oscilloscope) du signal tel que configuré. Toujours
   * étiqueté comme aperçu — jamais comme sortie réellement émise.
   */
  previewWaveform(opts = {}) {
    const cfg = { ...this._config, ...opts };
    const waveform = generateWaveform({
      signalType: PREVIEW_SIGNAL_TYPE[cfg.waveform] || 'sine',
      frequencyHz: cfg.frequencyHz,
      amplitudeVpp: cfg.amplitudeVpp,
      offsetV: cfg.offsetV,
      dutyCycle: cfg.dutyCycle,
      phaseDeg: cfg.phaseDeg,
      noisePct: 0,
      sampleRate: opts.sampleRate ?? 200000,
      sampleCount: opts.sampleCount ?? 2000,
    });
    waveform.metadata.source = SOURCE_KIND.SIMULATION;
    waveform.metadata.note = '🟡 APERÇU — aucun signal réellement émis (générateur non connecté)';
    return waveform;
  }

  /**
   * Tente d'envoyer réellement la configuration à l'instrument. Passe
   * systématiquement par InstrumentSafety, comme toute commande
   * d'instrument — mais échoue toujours ici tant qu'aucun générateur
   * réel n'est connecté (Phase 4).
   */
  async sendOutput(params = {}, { confirmFn, dangerous = false } = {}) {
    const cfg = { ...this._config, ...params };
    const result = await checkCommand({
      instrument: this,
      command: 'sendOutput',
      params: { voltage: cfg.amplitudeVpp, current: null },
      dangerous,
      confirmFn,
    });
    if (!result.allowed) throw new Error(`FunctionGeneratorDriver.sendOutput refusé : ${result.reason}`);
    throw new Error('FunctionGeneratorDriver: pilote non implémenté (Phase 4) — aucun générateur réel n\'est encore piloté.');
  }

  async identify() {
    throw new Error('FunctionGeneratorDriver: identification matérielle non implémentée (Phase 4)');
  }
}

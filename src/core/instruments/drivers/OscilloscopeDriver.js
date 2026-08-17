// ═══════════════════════════════════════════════════════
// OscilloscopeDriver — seul pilote pleinement fonctionnel en Phase 1
// ═══════════════════════════════════════════════════════
// Compose une InstrumentSource (SimulationSource ou ImportSource pour
// l'instant) et expose acquire(mode) → Waveform, quelle que soit la
// source réelle derrière — c'est ce découplage qui permettra de
// brancher un vrai pilote USB/Bluetooth/LAN plus tard sans changer
// l'UI ni le Signal Engine.

import { InstrumentDriver } from '../InstrumentDriver.js';

export class OscilloscopeDriver extends InstrumentDriver {
  constructor({ source = null } = {}) {
    super({
      type: 'oscilloscope',
      source,
      capabilities: {
        channels: 1,
        maxSampleRate: null,   // dépend de la source active (simulation : configurable ; import : fixé par le fichier)
        maxBandwidth: null,
        supportedModes: ['single', 'continuous', 'import'],
        communication: ['simulation', 'import', 'usb', 'bluetooth'],
      },
    });
  }

  /**
   * @param {'single'|'continuous'} mode
   * @returns {Promise<import('../Waveform.js').Waveform>}
   */
  async acquire(mode = 'single') {
    if (!this.source) throw new Error('OscilloscopeDriver: aucune source configurée');
    const status = this.source.getStatus();
    if (!status.connected) {
      throw new Error(`OscilloscopeDriver: source non connectée (${status.label ?? status.mode})`);
    }
    const waveform = await this.source.readData();
    waveform.acquisitionMode = mode;
    return waveform;
  }

  async identify() {
    const status = this.source?.getStatus();
    return {
      type: 'oscilloscope',
      source: status?.mode ?? 'aucune',
      detail: status?.detail ?? '',
    };
  }
}

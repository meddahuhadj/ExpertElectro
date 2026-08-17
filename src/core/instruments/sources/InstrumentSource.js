// ═══════════════════════════════════════════════════════
// InstrumentSource — interface commune à toutes les sources de données
// ═══════════════════════════════════════════════════════
// LIVE USB / LIVE Bluetooth / LIVE LAN / SIMULATION / IMPORT / CAMÉRA
// implémentent tous cette interface. Le reste de l'application
// (InstrumentManager, l'UI) ne connaît que ces 6 méthodes — jamais les
// détails d'un protocole ou d'une marque.
//
// Toute méthode non implémentée par une sous-classe DOIT lever
// NotImplementedError plutôt que de renvoyer une valeur inventée :
// c'est ce qui garantit qu'aucune source ne peut "faire semblant"
// d'être connectée ou de fournir une lecture.

export class NotImplementedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotImplementedError';
  }
}

export class InstrumentSource {
  /** @param {string} kind — 'simulation' | 'import' | 'usb' | 'bluetooth' | 'lan' | 'camera' */
  constructor(kind) {
    if (new.target === InstrumentSource) {
      throw new TypeError('InstrumentSource est abstraite — instancier une sous-classe');
    }
    this.kind = kind;
  }

  async connect(_opts) {
    throw new NotImplementedError(`connect() non implémenté pour la source "${this.kind}"`);
  }

  async disconnect() {
    throw new NotImplementedError(`disconnect() non implémenté pour la source "${this.kind}"`);
  }

  configure(_opts) {
    throw new NotImplementedError(`configure() non implémenté pour la source "${this.kind}"`);
  }

  async startAcquisition(_opts) {
    throw new NotImplementedError(`startAcquisition() non implémenté pour la source "${this.kind}"`);
  }

  async stopAcquisition() {
    throw new NotImplementedError(`stopAcquisition() non implémenté pour la source "${this.kind}"`);
  }

  /** @returns {Promise<import('../Waveform.js').Waveform>} */
  async readData() {
    throw new NotImplementedError(`readData() non implémenté pour la source "${this.kind}"`);
  }

  /** @returns {{connected:boolean, mode?:string, label?:string, detail?:string}} */
  getStatus() {
    return { connected: false, mode: this.kind, label: '⚪ NON CONNECTÉ' };
  }
}

// ═══════════════════════════════════════════════════════
// USBSource — transport USB réel (WebUSB), sans pilote de protocole
// ═══════════════════════════════════════════════════════
// Règle absolue (§15/§29) : ne JAMAIS simuler une connexion USB. Cette
// classe n'utilise QUE l'API WebUSB réelle du navigateur. Si elle n'est
// pas disponible, l'app doit le dire clairement plutôt que de proposer
// un faux bouton "connecter". Si un appareil est réellement sélectionné
// mais qu'aucun pilote ne sait décoder son protocole, readData() refuse
// explicitement plutôt que d'inventer une forme d'onde.

import { InstrumentSource } from './InstrumentSource.js';

export const USB_UNAVAILABLE_MESSAGE =
  'Connexion USB non disponible dans ce navigateur. Utilisez l\'application desktop / bridge HADJ.';

export function isUSBAvailable() {
  return typeof navigator !== 'undefined' && !!navigator.usb;
}

export class USBSource extends InstrumentSource {
  constructor() {
    super('usb');
    this._device = null;
  }

  async connect(opts = {}) {
    if (!isUSBAvailable()) {
      throw new Error(USB_UNAVAILABLE_MESSAGE);
    }
    // Filtres optionnels (vendorId/productId) — vides par défaut : le
    // navigateur affiche alors tous les appareils USB visibles, choix
    // réel de l'utilisateur, aucune présélection fabriquée.
    this._device = await navigator.usb.requestDevice({ filters: opts.filters ?? [] });
    return this._device;
  }

  async disconnect() {
    if (this._device) {
      try { await this._device.close(); } catch (_) { /* déjà fermé */ }
    }
    this._device = null;
  }

  configure() {
    throw new Error('USBSource: aucun pilote de protocole configuré (Phase 2)');
  }

  async startAcquisition() {
    throw new Error(
      `USBSource: appareil "${this._device?.productName ?? 'inconnu'}" détecté, mais aucun pilote ` +
      'ne sait encore dialoguer avec lui — acquisition impossible (Phase 2).'
    );
  }

  async stopAcquisition() { /* no-op tant qu'aucune acquisition n'est possible */ }

  async readData() {
    throw new Error('USBSource: aucune donnée réelle disponible — pilote de protocole non implémenté (Phase 2)');
  }

  getStatus() {
    if (!isUSBAvailable()) {
      return { connected: false, mode: 'USB', label: '⚪ NON DISPONIBLE', detail: USB_UNAVAILABLE_MESSAGE };
    }
    if (!this._device) {
      return { connected: false, mode: 'USB', label: '⚪ NON CONNECTÉ' };
    }
    return {
      connected: true,
      mode: 'USB',
      label: '🔌 APPAREIL DÉTECTÉ (pilote non implémenté)',
      detail: `${this._device.manufacturerName ?? '?'} ${this._device.productName ?? ''} — VID:${this._device.vendorId?.toString(16)} PID:${this._device.productId?.toString(16)}`,
    };
  }
}

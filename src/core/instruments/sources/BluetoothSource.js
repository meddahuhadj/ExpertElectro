// ═══════════════════════════════════════════════════════
// BluetoothSource — transport Bluetooth réel (Web Bluetooth), sans
// pilote de protocole
// ═══════════════════════════════════════════════════════
// Même règle que USBSource (§16/§29) : uniquement l'API Web Bluetooth
// réelle, jamais de connexion simulée. La liste "appareils disponibles"
// vient exclusivement du sélecteur natif du navigateur.

import { InstrumentSource } from './InstrumentSource.js';

export const BLUETOOTH_UNAVAILABLE_MESSAGE =
  'Connexion Bluetooth non disponible dans ce navigateur. Utilisez l\'application desktop / bridge HADJ.';

export function isBluetoothAvailable() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

export class BluetoothSource extends InstrumentSource {
  constructor() {
    super('bluetooth');
    this._device = null;
    this._server = null;
  }

  async connect(opts = {}) {
    if (!isBluetoothAvailable()) {
      throw new Error(BLUETOOTH_UNAVAILABLE_MESSAGE);
    }
    // acceptAllDevices par défaut si aucun filtre fourni : le navigateur
    // affiche réellement tous les appareils BLE à portée — choix natif
    // de l'utilisateur, rien de présélectionné côté app.
    const requestOpts = opts.filters?.length
      ? { filters: opts.filters, optionalServices: opts.optionalServices ?? [] }
      : { acceptAllDevices: true, optionalServices: opts.optionalServices ?? [] };
    this._device = await navigator.bluetooth.requestDevice(requestOpts);
    return this._device;
  }

  async disconnect() {
    if (this._server) {
      try { this._server.disconnect(); } catch (_) { /* déjà déconnecté */ }
    }
    this._server = null;
    this._device = null;
  }

  configure() {
    throw new Error('BluetoothSource: aucun pilote de protocole configuré (Phase 2)');
  }

  async startAcquisition() {
    if (!this._device) throw new Error('BluetoothSource: aucun appareil sélectionné');
    throw new Error(
      `BluetoothSource: appareil "${this._device.name ?? 'inconnu'}" détecté, mais aucun pilote ` +
      'ne sait encore dialoguer avec lui — acquisition impossible (Phase 2).'
    );
  }

  async stopAcquisition() { /* no-op tant qu'aucune acquisition n'est possible */ }

  async readData() {
    throw new Error('BluetoothSource: aucune donnée réelle disponible — pilote de protocole non implémenté (Phase 2)');
  }

  getStatus() {
    if (!isBluetoothAvailable()) {
      return { connected: false, mode: 'BLUETOOTH', label: '⚪ NON DISPONIBLE', detail: BLUETOOTH_UNAVAILABLE_MESSAGE };
    }
    if (!this._device) {
      return { connected: false, mode: 'BLUETOOTH', label: '⚪ NON CONNECTÉ' };
    }
    return {
      connected: true,
      mode: 'BLUETOOTH',
      label: '📶 APPAREIL DÉTECTÉ (pilote non implémenté)',
      detail: this._device.name ?? this._device.id ?? '',
    };
  }
}

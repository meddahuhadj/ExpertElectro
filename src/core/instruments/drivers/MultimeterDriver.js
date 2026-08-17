// ═══════════════════════════════════════════════════════
// MultimeterDriver — Phase 2 : fonctionnel en simulation + OCR caméra
// ═══════════════════════════════════════════════════════
// La lecture USB/Bluetooth d'un vrai multimètre reste un pilote de
// protocole non implémenté (Phase 3) — voir capabilities.communication.
// Ce driver ne renvoie jamais une lecture sans provenance explicite
// (SIMULATION ou CAMERA_OCR ici).

import { InstrumentDriver } from '../InstrumentDriver.js';
import { DMM_MODES } from '../sources/DMMSimulationSource.js';
import { parseMultimeterOCRResponse, buildMultimeterOCRPrompt } from '../ocr/MultimeterOCR.js';
import { callGeminiVision } from '../ocr/GeminiVisionClient.js';

export const MULTIMETER_MODES = DMM_MODES;

export class MultimeterDriver extends InstrumentDriver {
  constructor({ source = null } = {}) {
    super({
      type: 'multimeter',
      source,
      capabilities: {
        supportedModes: MULTIMETER_MODES,
        communication: ['simulation', 'camera-ocr', 'usb', 'bluetooth'],
      },
    });
  }

  /** Lecture simulée (source doit être une DMMSimulationSource connectée). */
  async readSimulated() {
    if (!this.source) throw new Error('MultimeterDriver: aucune source configurée');
    const status = this.source.getStatus();
    if (!status.connected) throw new Error(`MultimeterDriver: source non connectée (${status.label ?? status.mode})`);
    return this.source.readData();
  }

  /**
   * Pipeline OCR complet : envoie l'image au modèle de vision et
   * renvoie soit une Measurement CAMERA_OCR, soit un échec explicite.
   * Ne lève PAS d'exception sur une lecture incertaine — c'est une
   * réponse honnête, pas une erreur système (voir MultimeterOCR.js).
   * @param {string} base64
   * @param {string} mime
   * @returns {Promise<ReturnType<typeof parseMultimeterOCRResponse>>}
   */
  async readFromCameraOCR(base64, mime) {
    const rawText = await callGeminiVision(base64, mime, buildMultimeterOCRPrompt());
    return parseMultimeterOCRResponse(rawText);
  }

  async identify() {
    throw new Error('MultimeterDriver: identification matérielle non implémentée (Phase 3) — aucun multimètre USB/Bluetooth réel n\'est encore piloté.');
  }
}

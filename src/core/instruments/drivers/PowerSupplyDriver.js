// ═══════════════════════════════════════════════════════
// PowerSupplyDriver — Phase 3 : configuration réelle + garde de
// sécurité pleinement exercée, sortie réelle toujours refusée
// ═══════════════════════════════════════════════════════
// armOutput() passe systématiquement par InstrumentSafety.checkCommand
// (limites de tension/courant, état de connexion, état de sonde,
// confirmation utilisateur) AVANT toute autre chose — et échoue TOUJOURS
// ensuite ici, car `this.connection` ne devient jamais 'connected' tant
// qu'aucune alimentation réelle n'est pilotée (Phase 4). C'est le
// pipeline de sécurité complet qui est réel dès maintenant ; seule la
// commande finale vers un vrai instrument ne l'est pas encore.

import { InstrumentDriver } from '../InstrumentDriver.js';
import { checkCommand, DEFAULT_LIMITS } from '../InstrumentSafety.js';

export class PowerSupplyDriver extends InstrumentDriver {
  constructor({ source = null, limits = DEFAULT_LIMITS } = {}) {
    super({
      type: 'power-supply',
      source,
      capabilities: {
        supportedModes: ['voltage', 'currentLimit', 'output', 'ovp', 'ocp'],
        communication: ['usb', 'bluetooth', 'lan'],
      },
    });
    this.connection = null; // jamais 'connected' tant qu'aucune alimentation réelle n'est pilotée (Phase 4)
    this.probeState = 'unknown';
    this.limits = limits;
    this._config = { voltageV: 5, currentLimitA: 0.5, ovpV: null, ocpA: null, outputEnabled: false };
  }

  configure(params = {}) {
    Object.assign(this._config, params);
    return { ...this._config };
  }

  getConfig() { return { ...this._config }; }

  /**
   * Détermine si la configuration demandée doit être traitée comme
   * "dangereuse" au sens strict (déclenche la procédure de
   * consignation complète côté UI) plutôt que d'une simple
   * confirmation légère — au-delà des limites par défaut OU au-dessus
   * d'un seuil usuel TBTS/SELV (50V).
   */
  assessRisk(params = {}) {
    const cfg = { ...this._config, ...params };
    const overVoltage = typeof cfg.voltageV === 'number' && cfg.voltageV > this.limits.maxVoltageV;
    const overCurrent = typeof cfg.currentLimitA === 'number' && cfg.currentLimitA > this.limits.maxCurrentA;
    const mainsLike = typeof cfg.voltageV === 'number' && cfg.voltageV >= 50;
    return { overVoltage, overCurrent, dangerous: mainsLike, requiresHeavyConfirmation: overVoltage || overCurrent || mainsLike };
  }

  /**
   * Tente d'armer réellement la sortie. `confirmFn` est fourni par
   * l'UI (voir InstrumentSafety.checkCommand) — c'est elle qui décide
   * de la procédure de confirmation à afficher (légère ou
   * consignation complète) selon assessRisk().
   */
  async armOutput(params = {}, { confirmFn } = {}) {
    const cfg = { ...this._config, ...params };
    const risk = this.assessRisk(cfg);
    const result = await checkCommand({
      instrument: this,
      command: 'armOutput',
      params: { voltage: cfg.voltageV, current: cfg.currentLimitA },
      dangerous: risk.dangerous,
      limits: this.limits,
      confirmFn,
    });
    if (!result.allowed) throw new Error(`PowerSupplyDriver.armOutput refusé : ${result.reason}`);
    // Volontairement jamais atteint tant qu'aucune alimentation réelle
    // n'est connectée : la vérification "instrument non connecté" dans
    // checkCommand() aura déjà échoué avant d'arriver ici.
    throw new Error('PowerSupplyDriver: pilote non implémenté (Phase 4) — aucune alimentation réelle n\'est encore pilotée.');
  }

  async identify() {
    throw new Error('PowerSupplyDriver: identification matérielle non implémentée (Phase 4)');
  }
}

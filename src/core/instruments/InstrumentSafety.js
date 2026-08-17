// ═══════════════════════════════════════════════════════
// InstrumentSafety — garde-fou avant toute commande potentiellement
// dangereuse (cahier des charges §14)
// ═══════════════════════════════════════════════════════
// Avant d'envoyer une tension/un courant à un circuit, l'app doit
// vérifier : limites de tension/courant, capacité déclarée de
// l'instrument, confirmation utilisateur, état de connexion, état de
// sonde. checkCommand() centralise ces vérifications et ne dépend PAS
// du DOM — `confirmFn` est injecté par l'appelant (dans l'app, c'est
// une fonction qui ouvre le flux `openConsignation()` existant), ce qui
// rend ce module testable sous Node sans navigateur.

export const DEFAULT_LIMITS = Object.freeze({
  maxVoltageV: 30,   // au-delà : considéré dangereux par défaut (TBTS/SELV usuel = 50V, marge de sécurité prise à 30V)
  maxCurrentA: 3,
});

/**
 * @param {object} params
 * @param {object} params.instrument — doit exposer connection.isConnected / capabilities
 * @param {string} params.command — libellé de la commande (ex: 'armOutput')
 * @param {object} [params.params] — ex: {voltage, current}
 * @param {boolean} [params.dangerous] — forcé si le circuit/la mesure est identifié comme secteur/HT
 * @param {object} [params.limits] — override de DEFAULT_LIMITS
 * @param {() => boolean|Promise<boolean>} [params.confirmFn] — retourne true si l'utilisateur a confirmé
 * @returns {Promise<{allowed:boolean, requiresConfirmation:boolean, reason:string}>}
 */
export async function checkCommand({
  instrument, command, params = {}, dangerous = false, limits = DEFAULT_LIMITS, confirmFn,
} = {}) {
  if (!instrument) {
    return { allowed: false, requiresConfirmation: false, reason: 'Aucun instrument spécifié — commande refusée.' };
  }

  const voltage = params.voltage;
  const current = params.current;
  const overVoltage = typeof voltage === 'number' && voltage > limits.maxVoltageV;
  const overCurrent = typeof current === 'number' && current > limits.maxCurrentA;
  const mustConfirm = dangerous || overVoltage || overCurrent;

  // La confirmation utilisateur est demandée AVANT de vérifier l'état de
  // connexion — volontairement. Si on vérifiait la connexion en premier,
  // une commande dangereuse envoyée à un instrument non connecté
  // (le cas de TOUTE commande tant qu'aucun pilote réel n'existe,
  // Phase 3) ne déclencherait jamais la confirmation, et l'interface de
  // sécurité (consignation NFC 18-510 ou confirmation légère) resterait
  // du code mort invisible pour l'utilisateur. Ici, l'intention est
  // toujours confirmée en premier — exactement comme un vrai instrument
  // qui demande "Êtes-vous sûr ?" avant d'annoncer qu'il ne peut pas
  // exécuter la commande. Rien n'est jamais activé pour de vrai avant la
  // vérification de connexion qui suit.
  if (mustConfirm) {
    if (typeof confirmFn !== 'function') {
      return {
        allowed: false, requiresConfirmation: true,
        reason: '⚠️ ATTENTION — cette action peut alimenter le circuit. Confirmation utilisateur requise avant activation.',
      };
    }
    const confirmed = await confirmFn({ instrument, command, params, overVoltage, overCurrent, dangerous });
    if (!confirmed) {
      return { allowed: false, requiresConfirmation: true, reason: 'Commande annulée : confirmation refusée.' };
    }
  }

  if (!instrument.connection || !instrument.connection.isConnected) {
    return { allowed: false, requiresConfirmation: mustConfirm, reason: `Instrument non connecté — "${command}" refusée.` };
  }
  if (instrument.probeState === 'disconnected') {
    return { allowed: false, requiresConfirmation: mustConfirm, reason: 'Sonde/câble de sortie non connecté — commande refusée.' };
  }

  return { allowed: true, requiresConfirmation: mustConfirm, reason: 'OK' };
}

export const InstrumentSafety = { checkCommand, DEFAULT_LIMITS };

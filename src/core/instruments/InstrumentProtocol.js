// ═══════════════════════════════════════════════════════
// InstrumentProtocol — emplacement réservé pour les protocoles
// d'instrumentation (Phase 2+)
// ═══════════════════════════════════════════════════════
// Aucun parsing/encodage de trame n'est implémenté ici en Phase 1 :
// aucun instrument réel n'est encore piloté, donc aucun protocole n'a
// été validé sur du matériel réel. Ce fichier documente l'intention
// (SCPI pour la plupart des scopes/générateurs/alimentations de
// laboratoire, protocoles propriétaires pour les multimètres grand
// public) pour que la Phase 2 ait un point d'ancrage clair plutôt que
// d'improviser une architecture ad-hoc dans chaque driver.

export const PROTOCOLS = Object.freeze({
  SCPI: 'scpi',           // standard pour la majorité des scopes/générateurs/alims de labo
  VENDOR_CUSTOM: 'vendor', // protocole propriétaire (ex: multimètres Bluetooth grand public)
  UNKNOWN: 'unknown',
});

// TODO (Phase 2) : InstrumentProtocol.buildSCPICommand(cmd, params),
// InstrumentProtocol.parseSCPIResponse(bytes), et un registre de
// protocoles vendeur par identifiant USB/BLE. Ne pas ajouter de logique
// de parsing tant qu'un instrument réel n'a pas été testé — un
// "parseur" écrit sans matériel réel en face est une source classique
// de faux résultats.

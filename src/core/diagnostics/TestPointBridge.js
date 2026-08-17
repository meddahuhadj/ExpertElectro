// ═══════════════════════════════════════════════════════
// TestPointBridge — pont Instrument Engine ↔ points de test du
// Circuit Analyzer (cahier des charges §8/§22/§25)
// ═══════════════════════════════════════════════════════
// Module PUR (aucun DOM) : interprète les points de test déjà calculés
// par le module Circuit Analyzer legacy (exposés en lecture seule via
// window.__CA_getTestPoints()) et pilote le déroulé du "🤖 DIAGNOSTIC
// AUTOMATIQUE". Les points de test de ce module sont des valeurs DC
// (tension par rapport à la masse) — la comparaison se fait donc sur
// la tension moyenne mesurée (Vavg/offset), pas sur la forme d'onde
// complète (voir WaveformComparator.js pour la comparaison de forme
// d'onde, utilisée quand un signal ATTENDU explicite — pas juste une
// tension DC — est fourni).
//
// Convention de tolérance IDENTIQUE à `tpEvaluate` (index.html) et à
// WaveformComparator.DEFAULT_TOLERANCE : 10% relatif, 0.2 (V) en
// plancher absolu, bande "à surveiller" jusqu'à 2.5× la tolérance.
// Réimplémentée indépendamment ici (le module Circuit Analyzer est une
// IIFE privée non exposée sur window) plutôt que dupliquée dans un
// sens copier-coller : c'est la même règle, appliquée à une autre
// source de mesure (oscilloscope au lieu d'une saisie manuelle).

export const TOLERANCE_PCT = 10;
export const TOLERANCE_ABS_FLOOR = 0.2;
export const WARN_MULTIPLIER = 2.5;

/** Extrait la première valeur numérique d'un texte "attendu" (ex: "5.00 V" → 5). */
export function parseExpectedNumeric(expectedText) {
  const m = String(expectedText ?? '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/**
 * Compare une valeur DC mesurée (ex: Vavg d'une capture oscilloscope)
 * à la valeur attendue d'un point de test.
 * @returns {{status:'ok'|'warn'|'bad'|'info', message:string, expected:number|null, diff:number|null}}
 */
export function evaluateAgainstExpected(expectedText, measuredValue) {
  const expected = parseExpectedNumeric(expectedText);
  if (expected == null || typeof measuredValue !== 'number' || Number.isNaN(measuredValue)) {
    return { status: 'info', message: 'Pas de référence numérique exploitable pour comparer.', expected, diff: null };
  }
  const tol = Math.max(Math.abs(expected) * (TOLERANCE_PCT / 100), TOLERANCE_ABS_FLOOR);
  const diff = Math.abs(measuredValue - expected);
  if (diff <= tol) return { status: 'ok', message: '✅ Conforme', expected, diff };
  if (diff <= tol * WARN_MULTIPLIER) return { status: 'warn', message: '⚠️ Écart — à surveiller', expected, diff };
  return { status: 'bad', message: '🔴 Hors tolérance — anomalie probable', expected, diff };
}

/**
 * Choisit le prochain point de test à mesurer pour le pipeline guidé :
 * priorité aux points jamais mesurés, puis à ceux en anomalie
 * ('warn'/'bad'), jamais aux points déjà 'ok'. Purement déterministe —
 * aucun appel IA.
 * @param {Array<{id:string,label:string,measurement:{status:string}|null}>} testPoints
 * @returns {object|null}
 */
export function pickNextTestPoint(testPoints) {
  if (!Array.isArray(testPoints) || !testPoints.length) return null;
  const unmeasured = testPoints.find(tp => !tp.measurement);
  if (unmeasured) return unmeasured;
  const flagged = testPoints.find(tp => tp.measurement && (tp.measurement.status === 'bad' || tp.measurement.status === 'warn'));
  if (flagged) return flagged;
  return null; // tous mesurés et conformes
}

/**
 * Hypothèses de panne pour un écart DC hors tolérance sur un point de
 * test — règles simples, déterministes, jamais un appel IA (§8/§24).
 * Prend la valeur mesurée (et pas seulement l'écart absolu) pour
 * pouvoir distinguer "trop bas" de "trop haut", qui n'ont pas les
 * mêmes causes probables.
 * @param {ReturnType<typeof evaluateAgainstExpected>} evaluation
 * @param {number} measuredValue
 * @returns {Array<{code:string,label:string,confidence:number}>}
 */
export function suggestHypotheses(evaluation, measuredValue) {
  if (!evaluation || evaluation.status === 'ok' || evaluation.status === 'info' || evaluation.expected == null) return [];
  const confidence = evaluation.status === 'bad' ? 0.6 : 0.4;
  const nearZero = Math.abs(measuredValue) < Math.max(Math.abs(evaluation.expected) * 0.05, 0.05);

  if (nearZero && Math.abs(evaluation.expected) > 0.2) {
    return [{
      code: 'open_or_disconnected',
      label: `Tension quasi nulle alors que ${evaluation.expected} V étaient attendus : circuit ouvert, absence d'alimentation en amont, ou sonde non connectée sur ce nœud.`,
      confidence: 0.65,
    }];
  }
  if (measuredValue < evaluation.expected) {
    return [{
      code: 'dc_too_low',
      label: `Tension trop basse (${measuredValue.toFixed(2)} V au lieu de ${evaluation.expected} V) : alimentation insuffisante, chute de tension en amont (résistance série, connexion imparfaite), ou composant défaillant sur ce nœud.`,
      confidence,
    }];
  }
  return [{
    code: 'dc_too_high',
    label: `Tension trop haute (${measuredValue.toFixed(2)} V au lieu de ${evaluation.expected} V) : court-circuit vers une tension supérieure, référence/masse mal connectée, ou mauvais point de mesure.`,
    confidence,
  }];
}

/**
 * Résumé du pipeline pour un point de test donné + une analyse de
 * signal déjà calculée (SignalAnalyzer.analyze()). Ne fait aucun appel
 * réseau — l'IA (si sollicitée ailleurs) ne reçoit que ce résumé,
 * jamais l'inverse (cahier des charges §24 : mesures toujours
 * déterministes, l'IA n'invente jamais une valeur).
 * @param {object} testPoint
 * @param {{metrics:object, anomalies:Array}} analysis
 * @returns {{testPoint:object, evaluation:object, hypotheses:Array, anomalies:Array, nextTestPoint:object|null}}
 */
export function buildDiagnosticStep(testPoint, analysis, allTestPoints) {
  const evaluation = evaluateAgainstExpected(testPoint.expectedText, analysis.metrics.vavg);
  const hypotheses = suggestHypotheses(evaluation, analysis.metrics.vavg);
  const nextTestPoint = allTestPoints ? pickNextTestPoint(
    allTestPoints.map(tp => (tp.id === testPoint.id ? { ...tp, measurement: { status: evaluation.status } } : tp))
  ) : null;
  return { testPoint, evaluation, hypotheses, anomalies: analysis.anomalies || [], nextTestPoint };
}

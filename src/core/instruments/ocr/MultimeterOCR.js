// ═══════════════════════════════════════════════════════
// MultimeterOCR — pipeline de lecture d'écran de multimètre (§11)
// ═══════════════════════════════════════════════════════
// Module PUR (aucun fetch, aucun DOM) : construit le prompt envoyé à
// l'IA de vision et valide/parse sa réponse JSON. Le fetch réel vit
// dans GeminiVisionClient.js — cette séparation permet de tester ici
// la logique de validation (dont la règle "jamais inventer une mesure
// incertaine") sans dépendre du réseau.
//
// Pipeline (cahier des charges) :
//   CAMÉRA → détection multimètre → détection écran → correction
//   perspective → segmentation chiffres → OCR → valeur → unité → mode
//   → validation
// La détection/segmentation/perspective est déléguée au modèle de
// vision multimodal (comme le fait déjà Vision.analyze() pour les
// circuits, index.html) ; le code ICI est ce qui est déterministe :
// construction du prompt, extraction JSON stricte, validation, et la
// décision "confiance suffisante ?".

import { Measurement, SOURCE_KIND } from '../Measurement.js';
import { DMM_MODES } from '../sources/DMMSimulationSource.js';

/** En-dessous de ce seuil, la lecture ne doit JAMAIS être présentée
 *  comme acquise — l'UI doit demander confirmation à l'utilisateur. */
export const OCR_CONFIDENCE_THRESHOLD = 0.75;

export function buildMultimeterOCRPrompt() {
  return `Tu es un lecteur d'écran de multimètre. On te fournit une photo. Lis EXACTEMENT ce qui est affiché à l'écran du multimètre — n'invente RIEN. Si l'écran est flou, coupé, éteint, si aucun multimètre n'est visible, ou si tu n'es pas sûr, mets "readable": false et une "confidence" basse plutôt que de deviner une valeur.

Renvoie UNIQUEMENT un objet JSON valide (aucun texte autour), conforme à ce schéma :
{
  "readable": boolean,
  "raw_display_text": string|null,   // ce qui est écrit à l'écran, tel quel (ex: "12.47")
  "value": number|null,              // valeur numérique interprétée (ex: 12.47)
  "unit": string|null,               // unité affichée (ex: "V","mV","A","mA","Ω","kΩ","MΩ","F","µF","nF","Hz","°C","°F")
  "mode": ${JSON.stringify([...DMM_MODES, 'UNKNOWN'])} | null,
  "confidence": number,              // 0..1 — ta confiance réelle dans cette lecture
  "notes": string|null               // ex: "symbole AC visible", "écran partiellement flou"
}`;
}

/**
 * Extrait un objet JSON d'une réponse texte (tolère les fences
 * ```json``` et le texte parasite autour, comme le fait déjà
 * Vision.extractJson côté legacy).
 */
export function extractJson(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(cleaned); } catch (_) { /* repli ci-dessous */ }
  const i = cleaned.indexOf('{'), j = cleaned.lastIndexOf('}');
  if (i >= 0 && j > i) {
    try { return JSON.parse(cleaned.slice(i, j + 1)); } catch (_) { /* échec définitif */ }
  }
  return null;
}

/**
 * Parse + valide la réponse brute du modèle de vision et produit soit
 * une Measurement (source CAMERA_OCR) prête à afficher, soit un motif
 * d'échec explicite — jamais une valeur inventée.
 *
 * @param {string} rawText — texte brut renvoyé par l'API
 * @returns {{ok:true, measurement:Measurement, needsConfirmation:boolean, rawDisplayText:string|null, notes:string|null}
 *          | {ok:false, reason:string}}
 */
export function parseMultimeterOCRResponse(rawText) {
  const json = extractJson(rawText);
  if (!json) return { ok: false, reason: 'Réponse de vision non exploitable (JSON manquant).' };

  if (json.readable === false || json.value == null) {
    return {
      ok: false,
      reason: json.notes || '⚠ Lecture incertaine — écran illisible ou multimètre non détecté. Veuillez confirmer la mesure manuellement.',
    };
  }
  if (typeof json.value !== 'number' || Number.isNaN(json.value)) {
    return { ok: false, reason: '⚠ Valeur non numérique renvoyée par la vision — lecture rejetée.' };
  }
  if (!json.unit || typeof json.unit !== 'string') {
    return { ok: false, reason: '⚠ Unité manquante — lecture rejetée plutôt que de deviner.' };
  }

  const confidence = typeof json.confidence === 'number' ? Math.max(0, Math.min(1, json.confidence)) : 0;
  const mode = DMM_MODES.includes(json.mode) ? json.mode : 'UNKNOWN';

  const measurement = Measurement.create({
    value: json.value,
    unit: json.unit,
    mode,
    source: SOURCE_KIND.CAMERA_OCR,
    confidence,
  });

  return {
    ok: true,
    measurement,
    needsConfirmation: confidence < OCR_CONFIDENCE_THRESHOLD,
    rawDisplayText: json.raw_display_text ?? null,
    notes: json.notes ?? null,
  };
}

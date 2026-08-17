// ═══════════════════════════════════════════════════════
// GeminiVisionClient — appel réseau réel vers l'IA de vision
// ═══════════════════════════════════════════════════════
// Isolé de MultimeterOCR.js (qui reste pur/testable) : c'est le seul
// fichier de ce dossier qui fait un vrai fetch(). Reprend le même
// endpoint/modèle que le reste de l'app (Vision.analyze, index.html)
// pour rester cohérent avec la clé API / le modèle déjà configurés par
// l'utilisateur — sans dupliquer cette configuration : elle est lue en
// direct sur window.__state (référence vivante vers le `state` de
// l'app legacy, voir index.html).
//
// AUCUN résultat n'est simulé ici : en l'absence de clé API ou de
// réseau, cette fonction lève une erreur explicite plutôt que de
// renvoyer une fausse lecture.

/**
 * @param {string} base64 — image JPEG en base64 (sans le préfixe data:)
 * @param {string} mime
 * @param {string} promptText
 * @returns {Promise<string>} texte brut de la réponse
 */
export async function callGeminiVision(base64, mime, promptText) {
  const apiKey = window.__state?.apiKey;
  if (!apiKey) throw new Error('Clé API Gemini requise — configurez-la dans l\'application avant d\'utiliser l\'OCR caméra.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Hors-ligne — l\'OCR caméra nécessite une connexion Internet (IA). Utilisez la simulation ou l\'import en attendant.');
  }
  const model = window.__state?.textModel || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const generationConfig = { responseMimeType: 'application/json' };
  if (!/^gemini-3/.test(model)) generationConfig.temperature = 0.1;

  const body = {
    contents: [{ parts: [{ text: promptText }, { inlineData: { mimeType: mime, data: base64 } }] }],
    generationConfig,
  };

  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || `Erreur API Gemini (${r.status})`);
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  if (!text) throw new Error('Réponse vide de l\'API de vision.');
  return text;
}

// ═══════════════════════════════════════════════════════
// ImportSource — chargement d'une forme d'onde depuis un fichier
// ═══════════════════════════════════════════════════════
// CSV et JSON sont réellement parsés (pas de données inventées si le
// fichier est incomplet — on lève une erreur explicite à la place).
// WAV reste un stub documenté pour la Phase 2 (décodage audio plus
// lourd, hors du périmètre de cette itération).

import { InstrumentSource, NotImplementedError } from './InstrumentSource.js';
import { Waveform } from '../Waveform.js';
import { SOURCE_KIND } from '../Measurement.js';

export class ImportParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImportParseError';
  }
}

/**
 * Parse un CSV en Waveform.
 * Formats acceptés :
 *  - en-tête "time,voltage" (ou "t,v" / "temps,tension") : le sampleRate
 *    est déduit de l'écart moyen entre les temps.
 *  - une seule colonne de tensions : `opts.sampleRate` est OBLIGATOIRE
 *    (impossible de déduire une fréquence d'échantillonnage sans elle —
 *    on refuse de deviner).
 */
export function parseCSV(text, opts = {}) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) throw new ImportParseError('CSV vide');

  const firstCells = lines[0].split(/[,;\t]/).map(s => s.trim());
  const looksLikeHeader = firstCells.some(c => c.length > 0 && Number.isNaN(Number(c)));
  const headerNames = looksLikeHeader ? firstCells.map(c => c.toLowerCase()) : null;
  const dataLines = looksLikeHeader ? lines.slice(1) : lines;

  const timeIdx = headerNames ? headerNames.findIndex(h => ['time', 't', 'temps'].includes(h)) : -1;
  const voltIdx = headerNames
    ? headerNames.findIndex(h => ['voltage', 'v', 'tension', 'value', 'valeur'].includes(h))
    : -1;

  const times = [];
  const volts = [];
  for (const line of dataLines) {
    const cells = line.split(/[,;\t]/).map(s => s.trim());
    if (cells.every(c => c === '')) continue;
    if (timeIdx >= 0 && voltIdx >= 0) {
      const t = Number(cells[timeIdx]);
      const v = Number(cells[voltIdx]);
      if (Number.isNaN(t) || Number.isNaN(v)) continue;
      times.push(t);
      volts.push(v);
    } else if (cells.length >= 2 && !Number.isNaN(Number(cells[0])) && !Number.isNaN(Number(cells[1]))) {
      times.push(Number(cells[0]));
      volts.push(Number(cells[1]));
    } else {
      const v = Number(cells[0]);
      if (Number.isNaN(v)) continue;
      volts.push(v);
    }
  }

  if (volts.length < 2) {
    throw new ImportParseError('CSV invalide : pas assez d\'échantillons exploitables');
  }

  let sampleRate;
  if (times.length === volts.length && times.length >= 2) {
    let sumDt = 0;
    for (let i = 1; i < times.length; i++) sumDt += (times[i] - times[i - 1]);
    const avgDt = sumDt / (times.length - 1);
    if (!(avgDt > 0)) throw new ImportParseError('CSV invalide : colonne de temps non croissante');
    sampleRate = 1 / avgDt;
  } else if (opts.sampleRate) {
    sampleRate = opts.sampleRate;
  } else {
    throw new ImportParseError(
      'CSV à une seule colonne : la fréquence d\'échantillonnage ne peut pas être déduite — ' +
      'précisez-la (aucune valeur n\'est devinée).'
    );
  }

  return Waveform.create({
    sampleRate,
    samples: volts,
    channel: opts.channel ?? 'CH1',
    voltageRange: null,
    coupling: opts.coupling ?? 'DC',
    offset: 0,
    trigger: null,
    acquisitionMode: 'import',
    unit: opts.unit ?? 'V',
    metadata: {
      source: SOURCE_KIND.IMPORT,
      instrumentId: 'import-csv',
      note: `📂 Import CSV (${volts.length} échantillons)`,
      fileName: opts.fileName ?? null,
    },
  });
}

/**
 * Parse un JSON en Waveform. Deux formats acceptés :
 *  - un objet déjà proche du format Waveform ({sampleRate, samples, ...})
 *  - {sampleRate, samples:[...]} minimal
 * Le champ metadata.source est toujours forcé à IMPORT, quoi que dise le
 * fichier — on ne fait jamais confiance à un fichier externe pour
 * s'auto-déclarer "REAL".
 */
export function parseJSON(text, opts = {}) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new ImportParseError(`JSON invalide : ${e.message}`);
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.samples)) {
    throw new ImportParseError('JSON invalide : champ "samples" (tableau) requis');
  }
  if (!(data.sampleRate > 0)) {
    throw new ImportParseError('JSON invalide : champ "sampleRate" (nombre positif) requis');
  }
  return Waveform.create({
    sampleRate: data.sampleRate,
    samples: data.samples,
    channel: data.channel ?? opts.channel ?? 'CH1',
    voltageRange: data.voltageRange ?? null,
    coupling: data.coupling ?? 'DC',
    offset: data.offset ?? 0,
    trigger: data.trigger ?? null,
    acquisitionMode: 'import',
    unit: data.unit ?? 'V',
    metadata: {
      ...(data.metadata && typeof data.metadata === 'object' ? data.metadata : {}),
      source: SOURCE_KIND.IMPORT,
      instrumentId: data?.metadata?.instrumentId ?? 'import-json',
      note: `📂 Import JSON (${data.samples.length} échantillons)`,
      fileName: opts.fileName ?? null,
    },
  });
}

export function parseWAV() {
  throw new NotImplementedError(
    'Import WAV non implémenté (Phase 2) — utilisez CSV ou JSON pour le moment.'
  );
}

export class ImportSource extends InstrumentSource {
  constructor() {
    super('import');
    this._waveform = null;
    this._fileName = null;
  }

  async connect() { return true; }
  async disconnect() { this._waveform = null; this._fileName = null; }
  configure() { /* rien à configurer : le fichier fait foi */ }
  async startAcquisition() { /* no-op : readData() renvoie le fichier déjà chargé */ }
  async stopAcquisition() { /* no-op */ }

  loadCSV(text, opts = {}) {
    this._waveform = parseCSV(text, opts);
    this._fileName = opts.fileName ?? null;
    return this._waveform;
  }

  loadJSON(text, opts = {}) {
    this._waveform = parseJSON(text, opts);
    this._fileName = opts.fileName ?? null;
    return this._waveform;
  }

  loadWAV() {
    return parseWAV();
  }

  async readData() {
    if (!this._waveform) throw new Error('ImportSource: aucun fichier chargé');
    return this._waveform;
  }

  getStatus() {
    return {
      connected: !!this._waveform,
      mode: 'IMPORT',
      label: this._waveform ? '📂 IMPORT' : '⚪ AUCUN FICHIER',
      detail: this._fileName ?? '',
    };
  }
}

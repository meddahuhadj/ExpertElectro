// ═══════════════════════════════════════════════════════
// WaveformComparator — signal attendu vs signal mesuré (§8-9)
// ═══════════════════════════════════════════════════════
// Module pur, purement règles (zéro appel IA), qui compare un
// ExpectedWaveform déclaratif au résultat de SignalAnalyzer.analyze()
// pour une mesure réelle/simulée/importée, et propose des hypothèses.
//
// Tolérances : 10% relatif / 0.2 (unité de la grandeur) en plancher
// absolu — même convention que `tpEvaluate` déjà présent dans le
// module Circuit Analyzer de l'app (index.html), réimplémentée
// indépendamment ici pour ne pas toucher à ce module existant (voir
// le plan Phase 1 pour la justification).

export const DEFAULT_TOLERANCE = Object.freeze({
  freqPct: 10,
  amplitudePct: 10,
  dutyPct: 10,
  absFloor: 0.2,
});

function statusFor(expected, measured, tolerancePct, absFloor) {
  if (expected == null || measured == null) return 'unknown';
  const tolerance = Math.max(Math.abs(expected) * (tolerancePct / 100), absFloor);
  const delta = Math.abs(measured - expected);
  if (delta <= tolerance) return 'ok';
  if (delta <= tolerance * 2) return 'warn';
  return 'bad';
}

function deltaPct(expected, measured) {
  if (!expected) return measured ? Infinity : 0;
  return ((measured - expected) / expected) * 100;
}

/**
 * @param {object} expected — ExpectedWaveform : {shape, frequencyHz, amplitudeVpp, dutyCycle?, toleranceFreqPct?, toleranceAmplitudePct?, toleranceAbsFloor?}
 * @param {object} measured — résultat de SignalAnalyzer.analyze(waveform) : {metrics, anomalies}
 * @returns {{deltas:object, perMetricStatus:object, hypotheses:Array<{code:string,label:string,confidence:number}>}}
 */
export function compare(expected, measured) {
  if (!expected || !measured || !measured.metrics) {
    throw new Error('WaveformComparator.compare: expected et measured.metrics sont requis');
  }
  const tol = {
    freqPct: expected.toleranceFreqPct ?? DEFAULT_TOLERANCE.freqPct,
    amplitudePct: expected.toleranceAmplitudePct ?? DEFAULT_TOLERANCE.amplitudePct,
    dutyPct: expected.toleranceDutyPct ?? DEFAULT_TOLERANCE.dutyPct,
    absFloor: expected.toleranceAbsFloor ?? DEFAULT_TOLERANCE.absFloor,
  };
  const m = measured.metrics;

  const deltas = {
    frequency: expected.frequencyHz != null && m.frequency != null ? deltaPct(expected.frequencyHz, m.frequency) : null,
    amplitude: expected.amplitudeVpp != null && m.vpp != null ? deltaPct(expected.amplitudeVpp, m.vpp) : null,
    duty: expected.dutyCycle != null && m.dutyCycle != null ? deltaPct(expected.dutyCycle, m.dutyCycle) : null,
  };

  const perMetricStatus = {
    frequency: expected.frequencyHz != null ? statusFor(expected.frequencyHz, m.frequency, tol.freqPct, tol.absFloor) : 'n/a',
    amplitude: expected.amplitudeVpp != null ? statusFor(expected.amplitudeVpp, m.vpp, tol.amplitudePct, tol.absFloor) : 'n/a',
    duty: expected.dutyCycle != null ? statusFor(expected.dutyCycle, m.dutyCycle, tol.dutyPct, tol.absFloor) : 'n/a',
  };

  const hypotheses = [];
  const hasNoSignalAnomaly = (measured.anomalies || []).some(a => a.code === 'no_signal');
  const ampLow = perMetricStatus.amplitude === 'bad' && deltas.amplitude < 0;
  const ampHigh = perMetricStatus.amplitude === 'bad' && deltas.amplitude > 0;
  const freqOff = perMetricStatus.frequency === 'bad' || perMetricStatus.frequency === 'warn';
  const dutyOff = perMetricStatus.duty === 'bad' || perMetricStatus.duty === 'warn';

  if (hasNoSignalAnomaly) {
    hypotheses.push({ code: 'open_circuit_or_no_supply', label: 'Circuit ouvert, absence d\'alimentation, ou sonde non connectée', confidence: 0.7 });
  }
  if (ampLow && !freqOff) {
    hypotheses.push({ code: 'attenuation', label: 'Atténuation probable : sonde mal connectée, composant en amont défaillant, ou charge excessive', confidence: 0.6 });
  }
  if (ampHigh && !freqOff) {
    hypotheses.push({ code: 'overdrive', label: 'Amplitude anormalement élevée : gain excessif ou mauvais calibre de sonde', confidence: 0.5 });
  }
  if (freqOff && perMetricStatus.amplitude !== 'bad') {
    hypotheses.push({ code: 'timing_drift', label: 'Dérive de l\'oscillateur ou composant de temporisation hors tolérance', confidence: 0.55 });
  }
  if (dutyOff && !freqOff) {
    hypotheses.push({ code: 'duty_drift', label: 'Rapport cyclique hors tolérance : commande PWM ou driver à vérifier', confidence: 0.55 });
  }
  if (!hypotheses.length && Object.values(perMetricStatus).some(s => s === 'bad' || s === 'warn')) {
    hypotheses.push({ code: 'unclassified_deviation', label: 'Écart détecté par rapport au signal attendu — cause non déterminée automatiquement', confidence: 0.3 });
  }

  return { deltas, perMetricStatus, hypotheses };
}

export const WaveformComparator = { compare, DEFAULT_TOLERANCE };

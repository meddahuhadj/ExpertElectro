// ═══════════════════════════════════════════════════════
// SignalAnalyzer — mesures automatiques et détection d'anomalies
// ═══════════════════════════════════════════════════════
// Module pur, sans DOM : prend une Waveform (voir Waveform.js) et
// calcule de VRAIES mesures (aucun résultat pré-écrit). Fonctionne à
// l'identique quelle que soit la provenance de la Waveform (simulation,
// import, futur instrument réel) — c'est le Signal Engine du cahier
// des charges.
//
// Les seuils d'anomalie (THRESHOLDS) sont des heuristiques par défaut,
// documentées comme réglables — pas des vérités absolues.

export const THRESHOLDS = Object.freeze({
  HYSTERESIS_PCT: 0.05,        // bande d'hystérésis pour la détection de passages par zéro (% du Vpp)
  CLIPPING_NEAR_PCT: 0.005,    // "proche de l'extrême" = à moins de 0.5% du Vpp du sommet/creux
  CLIPPING_MIN_RUN: 5,         // plancher absolu (utilisé si la période est inconnue)
  CLIPPING_MIN_RUN_PERIOD_FRAC: 0.08, // ET/OU au moins 8% d'une période — un sommet de sinus
                                // idéal reste naturellement "proche de l'extrême" pendant
                                // quelques échantillons (dérivée ~nulle au sommet) ; seul un
                                // VRAI écrêtage (palier imposé par une limite d'alimentation/
                                // de gain) reste plat sur une fraction significative de la
                                // période — d'où ce seuil relatif plutôt qu'un simple compteur.
  CLIPPING_MIN_SHARE: 0.005,   // et au moins 0.5% des échantillons totaux
  EXCESSIVE_NOISE_PCT: 5,      // bruit > 5% du Vpp
  ABSENCE_VPP_V: 0.01,         // Vpp < 10 mV
  ABSENCE_NOISE_V: 0.002,      // et bruit < 2 mV
  INTERMITTENT_CV_PCT: 25,     // coefficient de variation de l'énergie RMS par segment > 25%
  DISTORTION_THD_PCT: 5,       // THD > 5% (fourni par FFTAnalyzer, optionnel)
  OSCILLATION_HF_ENERGY_PCT: 15, // énergie FFT > 3x la fondamentale, si >15% de l'énergie totale (fourni en option)
  RIPPLE_MIN_PCT_OF_OFFSET: 2, // amplitude de l'ondulation > 2% de l'offset DC (fourni en option)
});

function mean(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function vmaxVminOf(samples) {
  let vmax = -Infinity, vmin = Infinity;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    if (v > vmax) vmax = v;
    if (v < vmin) vmin = v;
  }
  return { vmax, vmin };
}

function rmsOf(samples) {
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) sumSq += samples[i] * samples[i];
  return Math.sqrt(sumSq / samples.length);
}

function interpTime(iLo, iHi, samples, sampleRate, threshold) {
  const a = samples[iLo], b = samples[iHi];
  const frac = b === a ? 0 : (threshold - a) / (b - a);
  return (iLo + frac) / sampleRate;
}

/** Détection de fréquence/période par passages par zéro avec hystérésis. */
function zeroCrossingPeriod(samples, sampleRate, vavg, vpp) {
  if (vpp <= 0) return null;
  const band = THRESHOLDS.HYSTERESIS_PCT * vpp;
  const upper = vavg + band, lower = vavg - band;
  let state = samples[0] > upper ? 'above' : (samples[0] < lower ? 'below' : 'mid');
  const risingTimes = [];
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1], cur = samples[i];
    if (state !== 'above' && cur >= upper && prev < upper) {
      risingTimes.push(interpTime(i - 1, i, samples, sampleRate, upper));
      state = 'above';
    } else if (state === 'above' && cur <= lower && prev > lower) {
      state = 'below';
    }
  }
  if (risingTimes.length < 2) return null;
  let sumDt = 0;
  for (let i = 1; i < risingTimes.length; i++) sumDt += risingTimes[i] - risingTimes[i - 1];
  const period = sumDt / (risingTimes.length - 1);
  if (!(period > 0)) return null;
  return { period, frequency: 1 / period, method: 'zero-crossing', edgeCount: risingTimes.length };
}

/** Repli : recherche du premier pic fort d'autocorrélation normalisée. */
function autocorrelationPeriod(samples, sampleRate) {
  const n = samples.length;
  const m = mean(samples);
  const centered = new Float64Array(n);
  for (let i = 0; i < n; i++) centered[i] = samples[i] - m;
  let energy0 = 0;
  for (let i = 0; i < n; i++) energy0 += centered[i] * centered[i];
  if (energy0 <= 0) return null;

  const maxLag = Math.floor(n / 2);
  const minLag = 2;
  let bestLag = -1, bestScore = -Infinity;
  for (let lag = minLag; lag < maxLag; lag++) {
    let sum = 0;
    const len = n - lag;
    for (let i = 0; i < len; i++) sum += centered[i] * centered[i + lag];
    const score = sum / energy0;
    if (score > bestScore) { bestScore = score; bestLag = lag; }
  }
  if (bestLag <= 0 || bestScore < 0.3) return null; // périodicité trop faible pour être fiable
  const period = bestLag / sampleRate;
  return { period, frequency: 1 / period, method: 'autocorrelation', confidence: bestScore };
}

function dutyCycleOf(samples, vmin, vmax) {
  const vpp = vmax - vmin;
  if (vpp <= 0) return null;
  const mid = (vmax + vmin) / 2;
  let above = 0;
  for (let i = 0; i < samples.length; i++) if (samples[i] > mid) above++;
  return (above / samples.length) * 100;
}

function findEdgeDuration(samples, sampleRate, vmin, vmax, rising) {
  const vpp = vmax - vmin;
  if (vpp <= 0) return null;
  const vLo = vmin + 0.1 * vpp;
  const vHi = vmin + 0.9 * vpp;
  if (rising) {
    for (let i = 1; i < samples.length; i++) {
      if (samples[i - 1] < vLo && samples[i] >= vLo) {
        for (let j = i; j < samples.length; j++) {
          if (samples[j] < vLo) break; // redescendu avant d'atteindre vHi : front invalide
          if (samples[j - 1] < vHi && samples[j] >= vHi) {
            const tLo = interpTime(i - 1, i, samples, sampleRate, vLo);
            const tHi = interpTime(j - 1, j, samples, sampleRate, vHi);
            if (tHi > tLo) return { duration: tHi - tLo, loIndex: i, hiIndex: j };
          }
        }
      }
    }
  } else {
    for (let i = 1; i < samples.length; i++) {
      if (samples[i - 1] > vHi && samples[i] <= vHi) {
        for (let j = i; j < samples.length; j++) {
          if (samples[j] > vHi) break;
          if (samples[j - 1] > vLo && samples[j] <= vLo) {
            const tHi = interpTime(i - 1, i, samples, sampleRate, vHi);
            const tLo = interpTime(j - 1, j, samples, sampleRate, vLo);
            if (tLo > tHi) return { duration: tLo - tHi, hiIndex: i, loIndex: j };
          }
        }
      }
    }
  }
  return null;
}

function overshootUndershootOf(samples, sampleRate, vmin, vmax, periodSamples, dutyCyclePct) {
  const vpp = vmax - vmin;
  if (vpp <= 0) return { overshoot: null, undershoot: null };
  // La fenêtre de "palier stabilisé" doit rester À L'INTÉRIEUR du plateau
  // qui suit le front, sans empiéter sur le front suivant — sinon un
  // signal à duty cycle non 50% produit un "overshoot"/"undershoot"
  // fantaisiste en mélangeant deux niveaux différents. Quand la période
  // ET le rapport cyclique sont connus (cas courant, calculés juste
  // avant), on borne la fenêtre à 60% du plus court des deux paliers
  // (haut/bas) plutôt qu'à une fraction fixe de la capture entière.
  let plateauLen = Math.max(4, Math.floor(samples.length / 8));
  if (periodSamples) {
    const dutyFrac = typeof dutyCyclePct === 'number' ? Math.min(dutyCyclePct, 100 - dutyCyclePct) / 100 : 0.3;
    plateauLen = Math.max(4, Math.min(plateauLen, Math.floor(periodSamples * dutyFrac * 0.6)));
  }

  // Un overshoot/undershoot n'a de sens que face à un vrai palier stabilisé
  // (front carré/impulsionnel). Sur un signal continûment variable (sinus,
  // triangle…), la "fenêtre stabilisée" ne l'est jamais réellement — on
  // vérifie donc qu'elle est effectivement plate (écart-type faible devant
  // le Vpp) avant de calculer quoi que ce soit ; sinon on renvoie null
  // plutôt qu'un pourcentage trompeur.
  const FLATNESS_MAX_STD_PCT_OF_VPP = 3;
  const isFlat = (window) => {
    if (window.length < 2) return false;
    const m = mean(window);
    const variance = mean(window.map(v => (v - m) ** 2));
    return (Math.sqrt(variance) / vpp) * 100 <= FLATNESS_MAX_STD_PCT_OF_VPP;
  };

  const rise = findEdgeDuration(samples, sampleRate, vmin, vmax, true);
  let overshoot = null;
  if (rise) {
    const preStart = Math.max(0, rise.loIndex - 10);
    const preEdge = mean(samples.slice(preStart, rise.loIndex + 1));
    const plateauEnd = Math.min(samples.length, rise.hiIndex + plateauLen);
    const plateau = samples.slice(rise.hiIndex, plateauEnd);
    if (plateau.length >= 4) {
      const settledWindow = plateau.slice(Math.floor(plateau.length / 2));
      if (isFlat(settledWindow)) {
        const settled = mean(settledWindow);
        const peak = Math.max(...plateau.slice(0, Math.max(1, Math.floor(plateau.length / 2))));
        const stepAmplitude = settled - preEdge;
        if (stepAmplitude > 0) overshoot = Math.max(0, ((peak - settled) / stepAmplitude) * 100);
      }
    }
  }

  const fall = findEdgeDuration(samples, sampleRate, vmin, vmax, false);
  let undershoot = null;
  if (fall) {
    const preStart = Math.max(0, fall.hiIndex - 10);
    const preEdge = mean(samples.slice(preStart, fall.hiIndex + 1));
    const plateauEnd = Math.min(samples.length, fall.loIndex + plateauLen);
    const plateau = samples.slice(fall.loIndex, plateauEnd);
    if (plateau.length >= 4) {
      const settledWindow = plateau.slice(Math.floor(plateau.length / 2));
      if (isFlat(settledWindow)) {
        const settled = mean(settledWindow);
        const trough = Math.min(...plateau.slice(0, Math.max(1, Math.floor(plateau.length / 2))));
        const stepAmplitude = preEdge - settled;
        if (stepAmplitude > 0) undershoot = Math.max(0, ((settled - trough) / stepAmplitude) * 100);
      }
    }
  }

  return { overshoot, undershoot };
}

function noiseOf(samples, periodSamples) {
  const win = Math.max(3, Math.min(samples.length, Math.floor((periodSamples || samples.length / 20) / 20) || 3));
  const residuals = [];
  for (let i = 0; i < samples.length; i++) {
    const lo = Math.max(0, i - win);
    const hi = Math.min(samples.length, i + win + 1);
    const local = mean(samples.slice(lo, hi));
    residuals.push(samples[i] - local);
  }
  const m = mean(residuals);
  let sumSq = 0;
  for (const r of residuals) sumSq += (r - m) * (r - m);
  return Math.sqrt(sumSq / residuals.length);
}

function detectAnomalies({ samples, sampleRate, vmax, vmin, vpp, noiseV, freqInfo, dutyCycle, thdPercent, oscillationEnergyPct, ripplePct }) {
  const anomalies = [];
  const near = THRESHOLDS.CLIPPING_NEAR_PCT * vpp;

  if (vpp > 0) {
    let run = 0, total = 0, maxRun = 0;
    for (let i = 0; i < samples.length; i++) {
      const nearExtreme = samples[i] >= vmax - near || samples[i] <= vmin + near;
      if (nearExtreme) { run++; total++; if (run > maxRun) maxRun = run; } else { run = 0; }
    }
    const periodSamples = freqInfo && sampleRate ? freqInfo.period * sampleRate : null;
    const minRun = periodSamples
      ? Math.max(THRESHOLDS.CLIPPING_MIN_RUN, Math.floor(periodSamples * THRESHOLDS.CLIPPING_MIN_RUN_PERIOD_FRAC))
      : THRESHOLDS.CLIPPING_MIN_RUN;
    if (maxRun >= minRun && total / samples.length >= THRESHOLDS.CLIPPING_MIN_SHARE) {
      anomalies.push({ code: 'clipping', label: 'Écrêtage / saturation détecté(e)', severity: 'warn' });
    }
  }

  if (vpp > 0 && noiseV / vpp * 100 > THRESHOLDS.EXCESSIVE_NOISE_PCT) {
    anomalies.push({ code: 'excessive_noise', label: `Bruit excessif (${(noiseV / vpp * 100).toFixed(1)}% du Vpp)`, severity: 'warn' });
  }

  if (vpp < THRESHOLDS.ABSENCE_VPP_V && noiseV < THRESHOLDS.ABSENCE_NOISE_V) {
    anomalies.push({ code: 'no_signal', label: 'Absence de signal détectée', severity: 'bad' });
  }

  // Signal intermittent : coefficient de variation de l'énergie RMS par
  // segment. On utilise le RMS plutôt que le Vpp par segment : un
  // segment majoritairement "coupé" peut encore contenir un seul
  // échantillon proche du pic (Vpp resterait alors trompeusement
  // élevé), alors que son énergie RMS chute proportionnellement à la
  // durée réelle du signal présent dans le segment.
  const segCount = 20;
  if (samples.length >= segCount * 4) {
    const segLen = Math.floor(samples.length / segCount);
    const segRms = [];
    for (let s = 0; s < segCount; s++) {
      const seg = samples.slice(s * segLen, (s + 1) * segLen);
      segRms.push(rmsOf(seg));
    }
    const segMean = mean(segRms);
    if (segMean > 0) {
      const variance = mean(segRms.map(v => (v - segMean) ** 2));
      const cv = (Math.sqrt(variance) / segMean) * 100;
      if (cv > THRESHOLDS.INTERMITTENT_CV_PCT) {
        anomalies.push({ code: 'intermittent', label: `Signal intermittent (variation ${cv.toFixed(0)}% de l'énergie entre segments)`, severity: 'warn' });
      }
    }
  }

  if (typeof thdPercent === 'number' && thdPercent > THRESHOLDS.DISTORTION_THD_PCT) {
    anomalies.push({ code: 'distortion', label: `Distorsion harmonique (THD ${thdPercent.toFixed(1)}%)`, severity: 'warn' });
  }

  if (typeof oscillationEnergyPct === 'number' && oscillationEnergyPct > THRESHOLDS.OSCILLATION_HF_ENERGY_PCT) {
    anomalies.push({ code: 'oscillation', label: 'Oscillation/ringing haute fréquence détecté(e)', severity: 'warn' });
  }

  if (typeof ripplePct === 'number' && ripplePct > THRESHOLDS.RIPPLE_MIN_PCT_OF_OFFSET) {
    anomalies.push({ code: 'ripple', label: `Ondulation résiduelle (${ripplePct.toFixed(1)}% de l'offset DC)`, severity: 'warn' });
  }

  return anomalies;
}

/**
 * Analyse complète d'une Waveform.
 * @param {import('../instruments/Waveform.js').Waveform} waveform
 * @param {object} [opts]
 * @param {number} [opts.thdPercent] — THD calculée par FFTAnalyzer (optionnel, active la détection "distortion")
 * @param {number} [opts.oscillationEnergyPct] — calculée par FFTAnalyzer (optionnel)
 * @param {number} [opts.ripplePct] — calculée par FFTAnalyzer (optionnel)
 * @returns {{metrics: object, anomalies: Array<{code:string,label:string,severity:string}>}}
 */
export function analyze(waveform, opts = {}) {
  const samples = waveform.samples;
  const sampleRate = waveform.sampleRate;
  if (!samples || samples.length < 2) {
    throw new Error('SignalAnalyzer.analyze: forme d\'onde vide ou trop courte');
  }

  const { vmax, vmin } = vmaxVminOf(samples);
  const vpp = vmax - vmin;
  const vavg = mean(samples);
  const vrms = rmsOf(samples);

  let freqInfo = zeroCrossingPeriod(samples, sampleRate, vavg, vpp);
  if (!freqInfo) freqInfo = autocorrelationPeriod(samples, sampleRate);
  const periodSamples = freqInfo ? freqInfo.period * sampleRate : null;

  const dutyCycle = dutyCycleOf(samples, vmin, vmax);
  const { overshoot, undershoot } = overshootUndershootOf(samples, sampleRate, vmin, vmax, periodSamples, dutyCycle);
  const rise = findEdgeDuration(samples, sampleRate, vmin, vmax, true);
  const fall = findEdgeDuration(samples, sampleRate, vmin, vmax, false);
  const noiseV = noiseOf(samples, periodSamples);

  const metrics = {
    vmax, vmin, vpp, vavg, vrms,
    offset: vavg,
    frequency: freqInfo ? freqInfo.frequency : null,
    period: freqInfo ? freqInfo.period : null,
    frequencyMethod: freqInfo ? freqInfo.method : null,
    dutyCycle,
    riseTime: rise ? rise.duration : null,
    fallTime: fall ? fall.duration : null,
    overshoot, undershoot,
    noise: noiseV,
    noisePctOfVpp: vpp > 0 ? (noiseV / vpp) * 100 : null,
  };

  const anomalies = detectAnomalies({
    samples, sampleRate, vmax, vmin, vpp, noiseV, freqInfo, dutyCycle,
    thdPercent: opts.thdPercent, oscillationEnergyPct: opts.oscillationEnergyPct, ripplePct: opts.ripplePct,
  });

  return { metrics, anomalies };
}

export const SignalAnalyzer = { analyze, THRESHOLDS };

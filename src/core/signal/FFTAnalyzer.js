// ═══════════════════════════════════════════════════════
// FFTAnalyzer — analyse spectrale réelle (cahier des charges §7)
// ═══════════════════════════════════════════════════════
// Vraie implémentation Cooley-Tukey radix-2 itérative, avec
// zero-padding à la puissance de 2 supérieure et fenêtre de Hann pour
// réduire les fuites spectrales. Aucun résultat n'est simulé — même
// quand le SIGNAL analysé provient de SimulationSource, l'analyse FFT
// elle-même est un calcul réel sur les échantillons réellement générés.

function nextPow2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function hannWindow(N) {
  const w = new Float64Array(N);
  if (N === 1) { w[0] = 1; return w; }
  for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  return w;
}

/** FFT radix-2 itérative in-place (re/im doivent avoir une longueur puissance de 2). */
function fftInPlace(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curWr = 1, curWi = 0;
      const half = len / 2;
      for (let j = 0; j < half; j++) {
        const uRe = re[i + j], uIm = im[i + j];
        const vRe = re[i + j + half] * curWr - im[i + j + half] * curWi;
        const vIm = re[i + j + half] * curWi + im[i + j + half] * curWr;
        re[i + j] = uRe + vRe; im[i + j] = uIm + vIm;
        re[i + j + half] = uRe - vRe; im[i + j + half] = uIm - vIm;
        const nextWr = curWr * wr - curWi * wi;
        const nextWi = curWr * wi + curWi * wr;
        curWr = nextWr; curWi = nextWi;
      }
    }
  }
}

/**
 * Spectre d'amplitude (fenêtré Hann, zero-paddé) d'un tableau d'échantillons.
 * @returns {{magnitude: Float64Array, N: number}} magnitude[i] = amplitude crête du bin i (0..N/2-1)
 */
export function fft(samples) {
  const N = nextPow2(samples.length);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const win = hannWindow(samples.length);
  let winSum = 0;
  for (let i = 0; i < samples.length; i++) winSum += win[i];
  for (let i = 0; i < samples.length; i++) re[i] = samples[i] * win[i];
  fftInPlace(re, im);
  const half = N / 2;
  const magnitude = new Float64Array(half);
  for (let i = 0; i < half; i++) {
    magnitude[i] = winSum > 0 ? (2 * Math.sqrt(re[i] * re[i] + im[i] * im[i])) / winSum : 0;
  }
  return { magnitude, N };
}

/** @returns {{magnitude:Float64Array, binHz:number, N:number}} */
export function spectrum(waveform) {
  const { magnitude, N } = fft(waveform.samples);
  return { magnitude, binHz: waveform.sampleRate / N, N };
}

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Fondamentale / harmoniques / THD% / plancher de bruit spectral.
 * @param {import('../instruments/Waveform.js').Waveform} waveform
 * @param {object} [opts]
 * @param {number} [opts.minFreqHz=1] — ignore le DC et les bins en-dessous
 * @param {number} [opts.maxHarmonics=9]
 * @returns {{fundamental:{freq:number,amplitude:number}|null, harmonics:Array<{order:number,freq:number,amplitude:number}>, thdPercent:number|null, spectralNoiseFloor:number, binHz:number}}
 */
export function analyzeHarmonics(waveform, opts = {}) {
  const { minFreqHz = 1, maxHarmonics = 9 } = opts;
  const { magnitude, binHz, N } = spectrum(waveform);
  const nyquist = waveform.sampleRate / 2;
  const minBin = Math.max(1, Math.ceil(minFreqHz / binHz));

  let fundamentalBin = -1, fundamentalAmp = -Infinity;
  for (let i = minBin; i < magnitude.length; i++) {
    if (magnitude[i] > fundamentalAmp) { fundamentalAmp = magnitude[i]; fundamentalBin = i; }
  }
  if (fundamentalBin < 0 || fundamentalAmp <= 0) {
    return { fundamental: null, harmonics: [], thdPercent: null, spectralNoiseFloor: median(Array.from(magnitude)), binHz, N };
  }
  const fundamentalFreq = fundamentalBin * binHz;

  const harmonics = [];
  const excludedBins = new Set([fundamentalBin - 1, fundamentalBin, fundamentalBin + 1]);
  for (let k = 2; k <= maxHarmonics; k++) {
    const targetFreq = fundamentalFreq * k;
    if (targetFreq >= nyquist) break;
    const targetBin = Math.round(targetFreq / binHz);
    // recherche du pic local à +-1 bin autour de la position théorique
    let peakBin = targetBin, peakAmp = -Infinity;
    for (let db = -1; db <= 1; db++) {
      const b = targetBin + db;
      if (b >= 0 && b < magnitude.length && magnitude[b] > peakAmp) { peakAmp = magnitude[b]; peakBin = b; }
    }
    if (peakAmp > 0) {
      harmonics.push({ order: k, freq: peakBin * binHz, amplitude: peakAmp });
      excludedBins.add(peakBin - 1); excludedBins.add(peakBin); excludedBins.add(peakBin + 1);
    }
  }

  const thdPercent = harmonics.length
    ? (100 * Math.sqrt(harmonics.reduce((s, h) => s + h.amplitude * h.amplitude, 0))) / fundamentalAmp
    : 0;

  const noiseBins = [];
  for (let i = minBin; i < magnitude.length; i++) if (!excludedBins.has(i)) noiseBins.push(magnitude[i]);
  const spectralNoiseFloor = median(noiseBins);

  return {
    fundamental: { freq: fundamentalFreq, amplitude: fundamentalAmp },
    harmonics,
    thdPercent,
    spectralNoiseFloor,
    binHz,
    N,
  };
}

/**
 * Part de l'énergie spectrale située au-delà de 3× la fondamentale —
 * utile comme indicateur d'oscillation/ringing haute fréquence
 * (fourni en option à SignalAnalyzer.analyze).
 */
export function oscillationEnergyPct(waveform, fundamentalFreq) {
  if (!fundamentalFreq) return null;
  const { magnitude, binHz } = spectrum(waveform);
  const cutoffBin = Math.round((3 * fundamentalFreq) / binHz);
  let totalEnergy = 0, hfEnergy = 0;
  for (let i = 1; i < magnitude.length; i++) {
    const e = magnitude[i] * magnitude[i];
    totalEnergy += e;
    if (i >= cutoffBin) hfEnergy += e;
  }
  return totalEnergy > 0 ? (hfEnergy / totalEnergy) * 100 : 0;
}

/**
 * Amplitude d'une ondulation résiduelle dans une bande de fréquence
 * (par défaut 90-120 Hz, dérivée secteur redressée), rapportée à
 * l'offset DC — utile pour la détection de "ripple" sur alimentation.
 */
export function ripplePct(waveform, offsetV, bandHz = [90, 120]) {
  if (!offsetV) return null;
  const { magnitude, binHz } = spectrum(waveform);
  const loBin = Math.max(1, Math.floor(bandHz[0] / binHz));
  const hiBin = Math.min(magnitude.length - 1, Math.ceil(bandHz[1] / binHz));
  let peak = 0;
  for (let i = loBin; i <= hiBin; i++) if (magnitude[i] > peak) peak = magnitude[i];
  return (peak / Math.abs(offsetV)) * 100;
}

export const FFTAnalyzer = { fft, spectrum, analyzeHarmonics, oscillationEnergyPct, ripplePct };

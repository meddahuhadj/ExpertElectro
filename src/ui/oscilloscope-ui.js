// ═══════════════════════════════════════════════════════
// oscilloscope-ui.js — point d'entrée DOM de l'onglet 🔬 Oscilloscope
// ═══════════════════════════════════════════════════════
// Seul fichier de l'Instrument Engine qui touche le DOM. Chargé par un
// second <script type="module"> à la toute fin de index.html — sa
// portée de module ES est totalement isolée du script legacy (aucun
// risque de collision d'identifiants). Il ne communique avec le reste
// de l'application que via window.* (window.HADJ_INSTR,
// window.__renderScopeReportSection, window.__lastScopeCapture),
// exactement comme le fait déjà le code existant entre ses propres
// modules (window.HADJ, window.__state, window.__CA_report…).
//
// RÈGLE D'HONNÊTETÉ (cahier des charges §29) appliquée partout ici :
// aucune donnée n'est jamais affichée sans que sa provenance
// (RÉEL/SIMULATION/IMPORT) soit visible, et aucune erreur de
// connexion/acquisition n'est masquée ou remplacée par une valeur
// inventée.

import { SimulationSource, SIGNAL_TYPES } from '../core/instruments/sources/SimulationSource.js';
import { ImportSource, ImportParseError } from '../core/instruments/sources/ImportSource.js';
import { USBSource, isUSBAvailable, USB_UNAVAILABLE_MESSAGE } from '../core/instruments/sources/USBSource.js';
import { BluetoothSource, isBluetoothAvailable, BLUETOOTH_UNAVAILABLE_MESSAGE } from '../core/instruments/sources/BluetoothSource.js';
import { OscilloscopeDriver } from '../core/instruments/drivers/OscilloscopeDriver.js';
import { InstrumentManager } from '../core/instruments/InstrumentManager.js';
import { SignalAnalyzer } from '../core/signal/SignalAnalyzer.js';
import { FFTAnalyzer } from '../core/signal/FFTAnalyzer.js';
import { evaluateAgainstExpected, suggestHypotheses, pickNextTestPoint } from '../core/diagnostics/TestPointBridge.js';

const q = (id) => document.getElementById(id);
const T = (fr) => (typeof window.t === 'function' ? window.t(fr) : fr);
const toast = (msg, isError) => {
  if (typeof window.__toast === 'function') window.__toast(msg, isError);
  else if (isError) console.error(msg); else console.log(msg);
};

// ── État du module ──────────────────────────────────────
const sources = {
  simulation: new SimulationSource(),
  import: new ImportSource(),
  usb: new USBSource(),
  bluetooth: new BluetoothSource(),
};

const driver = new OscilloscopeDriver({ source: sources.simulation });

const Scope = {
  activeSourceKind: 'simulation',
  waveform: null,
  analysis: null,   // {metrics, anomalies}
  harmonics: null,  // sortie FFTAnalyzer.analyzeHarmonics
  continuousTimer: null,
  zoomPct: 100,
  cursors: null,    // {aIndex, bIndex}
  initialized: false,
  testPoints: null,     // sortie de window.__CA_getTestPoints() — null si aucun scan de circuit
  selectedTpId: null,
  diagLog: [],           // journal du diagnostic guidé (le plus récent en premier)
};

// ═══════════════════════════════════════════════════════
// Couleurs (lues depuis les variables CSS existantes — aucune
// duplication de palette)
// ═══════════════════════════════════════════════════════
function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  const get = (name, fallback) => (cs.getPropertyValue(name) || fallback).trim();
  return {
    canvasBg: get('--canvas-bg', '#08090C'),
    gridMinor: get('--grid-minor', 'rgba(245,166,35,0.09)'),
    gridMajor: get('--grid-major', 'rgba(245,166,35,0.22)'),
    accentY: get('--accent-y', '#F5A623'),
    accentB: get('--accent-b', '#00CFFF'),
    accentG: get('--accent-g', '#00E68A'),
    accentR: get('--accent-r', '#FF4D4D'),
  };
}

// ═══════════════════════════════════════════════════════
// Rendu canvas — trace principale
// ═══════════════════════════════════════════════════════
function drawWaveform() {
  const canvas = q('oscCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const c = themeColors();
  ctx.fillStyle = c.canvasBg;
  ctx.fillRect(0, 0, w, h);

  // grille
  ctx.strokeStyle = c.gridMinor;
  ctx.lineWidth = 1;
  const cols = 10, rows = 8;
  for (let i = 0; i <= cols; i++) {
    const x = Math.round((i / cols) * w) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let j = 0; j <= rows; j++) {
    const y = Math.round((j / rows) * h) + 0.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.strokeStyle = c.gridMajor;
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();

  if (!Scope.waveform) {
    ctx.fillStyle = c.gridMajor;
    ctx.font = '13px monospace';
    ctx.fillText(T('Aucune acquisition'), 12, h / 2 - 8);
    Scope._view = null;
    return;
  }

  const total = Scope.waveform.samples.length;
  const visibleCount = Math.max(4, Math.min(total, Math.round(total * (Scope.zoomPct / 100))));
  const samples = Scope.waveform.samples.slice(0, visibleCount);

  let vMax = -Infinity, vMin = Infinity;
  for (const s of samples) { if (s > vMax) vMax = s; if (s < vMin) vMin = s; }
  if (!(vMax > vMin)) { vMax += 1; vMin -= 1; }
  const pad = (vMax - vMin) * 0.12;
  vMax += pad; vMin -= pad;

  ctx.strokeStyle = c.accentY;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i < samples.length; i++) {
    const x = (i / (samples.length - 1)) * w;
    const y = h - ((samples[i] - vMin) / (vMax - vMin)) * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  Scope._view = { visibleCount, vMin, vMax, w, h };

  if (Scope.cursors) drawCursors();
}

function drawCursors() {
  const canvas = q('oscCanvas');
  const view = Scope._view;
  if (!canvas || !view || !Scope.cursors) return;
  const ctx = canvas.getContext('2d');
  const c = themeColors();
  const { aIndex, bIndex } = Scope.cursors;
  ctx.strokeStyle = c.accentB;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  for (const idx of [aIndex, bIndex]) {
    if (idx == null) continue;
    const x = (idx / (view.visibleCount - 1)) * view.w;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, view.h); ctx.stroke();
  }
  ctx.setLineDash([]);

  if (aIndex != null && bIndex != null) {
    const sampleRate = Scope.waveform.sampleRate;
    const dt = Math.abs(bIndex - aIndex) / sampleRate;
    const vA = Scope.waveform.samples[aIndex];
    const vB = Scope.waveform.samples[bIndex];
    const info = q('oscCursorInfo');
    if (info) {
      info.textContent = `Δt = ${formatTime(dt)} · A = ${vA.toFixed(3)} V · B = ${vB.toFixed(3)} V`;
    }
  }
}

function canvasXToIndex(canvas, clientX) {
  const rect = canvas.getBoundingClientRect();
  const view = Scope._view;
  if (!view) return null;
  const xRatio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  return Math.round(xRatio * (view.visibleCount - 1));
}

function setupCursorInteraction() {
  const canvas = q('oscCanvas');
  if (!canvas || canvas._oscCursorsWired) return;
  canvas._oscCursorsWired = true;
  let dragging = false;
  canvas.addEventListener('mousedown', (e) => {
    if (!Scope._view) return;
    dragging = true;
    const idx = canvasXToIndex(canvas, e.clientX);
    Scope.cursors = { aIndex: idx, bIndex: idx };
    drawWaveform();
  });
  canvas.addEventListener('mousemove', (e) => {
    if (!dragging || !Scope.cursors) return;
    Scope.cursors.bIndex = canvasXToIndex(canvas, e.clientX);
    drawWaveform();
  });
  window.addEventListener('mouseup', () => { dragging = false; });
}

// ═══════════════════════════════════════════════════════
// Rendu canvas — FFT
// ═══════════════════════════════════════════════════════
function drawFFT() {
  const canvas = q('oscFftCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const c = themeColors();
  ctx.fillStyle = c.canvasBg;
  ctx.fillRect(0, 0, w, h);

  if (!Scope.harmonics) return;
  const { magnitude } = FFTAnalyzer.spectrum(Scope.waveform);
  let maxMag = 0;
  for (const m of magnitude) if (m > maxMag) maxMag = m;
  if (maxMag <= 0) return;

  ctx.strokeStyle = c.accentB;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  const n = Math.min(magnitude.length, 800);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * w;
    const y = h - (magnitude[i] / maxMag) * h * 0.92;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // marqueur fondamentale
  const { fundamental, harmonics, binHz } = Scope.harmonics;
  ctx.fillStyle = c.accentY;
  if (fundamental) {
    const bin = Math.round(fundamental.freq / binHz);
    if (bin < n) {
      const x = (bin / (n - 1)) * w;
      ctx.beginPath(); ctx.arc(x, h - (fundamental.amplitude / maxMag) * h * 0.92, 3, 0, 2 * Math.PI); ctx.fill();
    }
  }
  ctx.fillStyle = c.accentR;
  for (const hm of harmonics) {
    const bin = Math.round(hm.freq / binHz);
    if (bin < n) {
      const x = (bin / (n - 1)) * w;
      ctx.beginPath(); ctx.arc(x, h - (hm.amplitude / maxMag) * h * 0.92, 2.5, 0, 2 * Math.PI); ctx.fill();
    }
  }
}

// ═══════════════════════════════════════════════════════
// Formatage
// ═══════════════════════════════════════════════════════
function formatTime(s) {
  if (s == null || !Number.isFinite(s)) return '—';
  if (Math.abs(s) < 1e-3) return `${(s * 1e6).toFixed(1)} µs`;
  if (Math.abs(s) < 1) return `${(s * 1e3).toFixed(2)} ms`;
  return `${s.toFixed(3)} s`;
}
function formatFreq(hz) {
  if (hz == null || !Number.isFinite(hz)) return '—';
  if (Math.abs(hz) >= 1e6) return `${(hz / 1e6).toFixed(3)} MHz`;
  if (Math.abs(hz) >= 1e3) return `${(hz / 1e3).toFixed(3)} kHz`;
  return `${hz.toFixed(2)} Hz`;
}
function formatV(v) { return v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(3)} V`; }
function formatPct(v) { return v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(1)} %`; }

// ═══════════════════════════════════════════════════════
// Rendu — mesures, anomalies, statut, instruments
// ═══════════════════════════════════════════════════════
const TILE_DEFS = [
  ['Vmax', m => formatV(m.vmax)],
  ['Vmin', m => formatV(m.vmin)],
  ['Vpp', m => formatV(m.vpp)],
  ['Vmoy', m => formatV(m.vavg)],
  ['Vrms', m => formatV(m.vrms)],
  ['Fréquence', m => formatFreq(m.frequency)],
  ['Période', m => formatTime(m.period)],
  ['Rapport cyclique', m => formatPct(m.dutyCycle)],
  ['Temps de montée', m => formatTime(m.riseTime)],
  ['Temps de descente', m => formatTime(m.fallTime)],
  ['Dépassement', m => formatPct(m.overshoot)],
  ['Sous-dépassement', m => formatPct(m.undershoot)],
  ['Bruit', m => formatV(m.noise)],
  ['Décalage DC', m => formatV(m.offset)],
];

function renderMeasureGrid() {
  const el = q('oscMeasureGrid');
  if (!el) return;
  const m = Scope.analysis ? Scope.analysis.metrics : null;
  el.innerHTML = TILE_DEFS.map(([label, fmt]) => `
    <div class="osc-tile"><div class="lbl">${T(label)}</div><div class="val">${m ? fmt(m) : '—'}</div></div>
  `).join('');
}

function renderAnomalies() {
  const el = q('oscAnomalies');
  if (!el) return;
  const anomalies = Scope.analysis ? Scope.analysis.anomalies : [];
  if (!anomalies || !anomalies.length) { el.innerHTML = ''; return; }
  el.innerHTML = anomalies.map(a => `<div class="osc-anomaly">⚠️ ${a.label}</div>`).join('');
}

function renderFFTReadout() {
  const el = q('oscFftReadout');
  if (!el) return;
  const h = Scope.harmonics;
  if (!h || !h.fundamental) { el.innerHTML = `<span>${T('Fondamentale')} : —</span><span>${T('THD')} : —</span><span>${T('Plancher de bruit')} : —</span>`; return; }
  const harmList = h.harmonics.map(x => `H${x.order}:${formatFreq(x.freq)}`).join(' · ') || '—';
  el.innerHTML = `
    <span>${T('Fondamentale')} : ${formatFreq(h.fundamental.freq)}</span>
    <span>${T('Harmoniques')} : ${harmList}</span>
    <span>${T('THD')} : ${formatPct(h.thdPercent)}</span>
    <span>${T('Plancher de bruit')} : ${h.spectralNoiseFloor.toFixed(4)} V</span>
  `;
}

function renderStatusPill() {
  const el = q('oscStatusPill');
  if (!el) return;
  const kind = Scope.activeSourceKind;
  const source = sources[kind];
  const status = source.getStatus();
  el.classList.remove('st-sim', 'st-real', 'st-import', 'st-detected', 'st-none', 'st-err');
  let cls = 'st-none';
  if (kind === 'simulation') cls = 'st-sim';
  else if (kind === 'import') cls = status.connected ? 'st-import' : 'st-none';
  else if (kind === 'usb' || kind === 'bluetooth') cls = status.connected ? 'st-detected' : 'st-none';
  el.classList.add(cls);
  el.textContent = status.label || '⚪ NON CONNECTÉ';
  el.title = status.detail || '';
}

function renderInstruments() {
  const body = q('oscInstrumentsBody');
  if (!body) return;
  const dotClass = (status) => status === 'connected' ? 'on' : (status === 'available' ? 'warn' : '');
  const dot = (status) => `<span class="osc-dot ${dotClass(status)}"></span>`;
  const statusLabel = (status) => ({
    connected: '🟢 Connecté', available: '🟡 Disponible', error: '🔴 Erreur', disconnected: '⚪ Non connecté',
  }[status] || '⚪ Non connecté');

  body.innerHTML = InstrumentManager.registry.list().map(inst => `
    <tr>
      <td>${inst.icon} ${T(inst.label)}</td>
      <td>${dot(inst.status)}${statusLabel(inst.status)}</td>
      <td>${inst.detail ? esc(inst.detail) : ''}</td>
    </tr>
  `).join('');
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// ═══════════════════════════════════════════════════════
// Points de test & diagnostic guidé (§8/§22/§25)
// ═══════════════════════════════════════════════════════
// Pont en LECTURE (et écriture d'une mesure) vers le module Circuit
// Analyzer legacy via window.__CA_getTestPoints()/
// window.__CA_recordTestPointMeasurement() — aucune logique de graphe
// de circuit n'est dupliquée ici (voir TestPointBridge.js pour la
// partie pure/testable : évaluation de tolérance + hypothèses).

function refreshTestPoints() {
  Scope.testPoints = typeof window.__CA_getTestPoints === 'function' ? window.__CA_getTestPoints() : null;
  if (Scope.testPoints && Scope.testPoints.length && !Scope.testPoints.some(tp => tp.id === Scope.selectedTpId)) {
    Scope.selectedTpId = Scope.testPoints[0].id;
  }
}

function renderTestPointSection() {
  const wrap = q('oscTpWrap');
  if (!wrap) return;
  refreshTestPoints();
  const empty = q('oscTpEmpty');
  const body = q('oscTpBody');
  if (!Scope.testPoints || !Scope.testPoints.length) {
    if (empty) empty.style.display = '';
    if (body) body.style.display = 'none';
    return;
  }
  if (empty) empty.style.display = 'none';
  if (body) body.style.display = '';

  const sel = q('oscTpSelect');
  if (sel) {
    sel.innerHTML = Scope.testPoints.map(tp => {
      const measured = tp.measurement ? ` — ${tp.measurement.status === 'ok' ? '✅' : tp.measurement.status === 'warn' ? '⚠️' : tp.measurement.status === 'bad' ? '🔴' : '•'}` : '';
      return `<option value="${esc(tp.id)}"${tp.id === Scope.selectedTpId ? ' selected' : ''}>${esc(tp.id)} · ${esc(tp.label)}${measured}</option>`;
    }).join('');
  }
  const tp = Scope.testPoints.find(t => t.id === Scope.selectedTpId);
  const expectedEl = q('oscTpExpected');
  if (expectedEl && tp) expectedEl.textContent = `${T('Attendu')} : ${tp.expectedText}`;
  const summary = typeof window.__CA_getCircuitSummary === 'function' ? window.__CA_getCircuitSummary() : null;
  const circuitEl = q('oscTpCircuit');
  if (circuitEl) circuitEl.textContent = summary?.circuitType ? `📐 ${summary.circuitType}` : '';
}

function renderDiagLog() {
  const el = q('oscDiagLog');
  if (!el) return;
  if (!Scope.diagLog.length) { el.innerHTML = ''; return; }
  el.innerHTML = Scope.diagLog.slice(0, 10).map(entry => `<div class="osc-anomaly" style="border-color:rgba(0,207,255,.35);background:rgba(0,207,255,.08);color:#BEEBFF;">${entry}</div>`).join('');
}

/** Compare l'acquisition courante au point de test sélectionné, et synchronise le résultat avec le Circuit Analyzer. */
function compareToSelectedTestPoint({ silent = false } = {}) {
  if (!Scope.analysis) {
    if (!silent) toast('Acquérez d\'abord un signal (Mono/Continu) avant de comparer', true);
    return null;
  }
  const tp = (Scope.testPoints || []).find(t => t.id === Scope.selectedTpId);
  if (!tp) {
    if (!silent) toast('Sélectionnez un point de test', true);
    return null;
  }
  const vavg = Scope.analysis.metrics.vavg;
  const evaluation = evaluateAgainstExpected(tp.expectedText, vavg);
  const hypotheses = suggestHypotheses(evaluation, vavg);
  const sourceLabel = `🔬 Oscilloscope (${sources[Scope.activeSourceKind].getStatus().label})`;
  if (evaluation.status !== 'info' && typeof window.__CA_recordTestPointMeasurement === 'function') {
    window.__CA_recordTestPointMeasurement(tp.id, vavg, sourceLabel);
  }
  const line = `${evaluation.message} — ${tp.id} (${tp.label}) : mesuré ${vavg.toFixed(3)} V` +
    (hypotheses.length ? ` · ${hypotheses[0].label}` : '');
  Scope.diagLog.unshift(line);
  renderDiagLog();
  refreshTestPoints();
  renderTestPointSection();
  if (!silent) toast(evaluation.message);
  return { tp, evaluation, hypotheses };
}

/** Pipeline guidé "🤖 Diagnostic automatique" (§25) : un pas à la fois — guide, acquiert, compare, journalise, suggère la suite. */
async function runAutoDiagnostic() {
  refreshTestPoints();
  if (!Scope.testPoints || !Scope.testPoints.length) {
    toast('Aucun scan de circuit disponible — utilisez d\'abord 🔬 SCAN CIRCUIT COMPLET (Analyseur de circuits)', true);
    return;
  }
  const next = pickNextTestPoint(Scope.testPoints);
  if (!next) {
    toast('✅ Diagnostic automatique terminé — tous les points de test connus sont conformes');
    Scope.diagLog.unshift('✅ Tous les points de test sont conformes — diagnostic terminé.');
    renderDiagLog();
    return;
  }
  Scope.selectedTpId = next.id;
  renderTestPointSection();
  toast(`📍 Mesurez ${next.id} (${next.label}) — connectez la sonde, acquisition en cours…`);
  try {
    await acquireOnce('single');
  } catch (_) {
    return; // acquireOnce a déjà notifié l'erreur — on ne poursuit pas le pipeline sur une acquisition ratée
  }
  compareToSelectedTestPoint();
}

function renderAll() {
  drawWaveform();
  drawFFT();
  renderMeasureGrid();
  renderAnomalies();
  renderFFTReadout();
  renderStatusPill();
  renderInstruments();
  renderTestPointSection();
}

// ═══════════════════════════════════════════════════════
// Acquisition
// ═══════════════════════════════════════════════════════
const SIGNAL_TYPE_LABELS = {
  sine: 'Sinus', square: 'Carré', triangle: 'Triangle', sawtooth: 'Dent de scie',
  pulse: 'Impulsion', noise: 'Bruit', rectified_half: 'Redressé demi-onde',
  rectified_full: 'Redressé pleine onde', pwm: 'PWM', audio: 'Signal audio composite',
  dc: 'DC', faulty: 'Signal avec défaut', intermittent: 'Signal intermittent',
};

/** Peuple le <select> des formes de signal depuis SIGNAL_TYPES — une seule
 *  source de vérité (le moteur de simulation), pas de liste dupliquée en HTML. */
function populateSignalTypeSelect() {
  const sel = q('oscSimType');
  if (!sel || sel.options.length) return;
  sel.innerHTML = SIGNAL_TYPES.map(id => `<option value="${id}">${T(SIGNAL_TYPE_LABELS[id] || id)}</option>`).join('');
}

function applySimulationParamsFromUI() {
  const p = {
    signalType: q('oscSimType')?.value || 'sine',
    frequencyHz: Number(q('oscSimFreq')?.value) || 1000,
    amplitudeVpp: Number(q('oscSimAmp')?.value) || 5,
    offsetV: Number(q('oscSimOffset')?.value) || 0,
    dutyCycle: Number(q('oscSimDuty')?.value) || 50,
    phaseDeg: Number(q('oscSimPhase')?.value) || 0,
    noisePct: Number(q('oscSimNoise')?.value) || 0,
    defectType: q('oscSimDefect')?.value || 'clipping',
  };
  sources.simulation.configure(p);
  const defectWrap = q('oscSimDefectWrap');
  if (defectWrap) defectWrap.style.display = p.signalType === 'faulty' ? '' : 'none';
}

function runAnalysis() {
  if (!Scope.waveform) { Scope.analysis = null; Scope.harmonics = null; return; }
  try {
    Scope.harmonics = FFTAnalyzer.analyzeHarmonics(Scope.waveform);
    Scope.analysis = SignalAnalyzer.analyze(Scope.waveform, {
      thdPercent: Scope.harmonics.thdPercent,
      oscillationEnergyPct: Scope.harmonics.fundamental
        ? FFTAnalyzer.oscillationEnergyPct(Scope.waveform, Scope.harmonics.fundamental.freq)
        : null,
      ripplePct: Scope.waveform.offset ? FFTAnalyzer.ripplePct(Scope.waveform, Scope.waveform.offset) : null,
    });
  } catch (e) {
    Scope.analysis = null; Scope.harmonics = null;
    toast(`Analyse impossible : ${e.message}`, true);
  }
}

async function acquireOnce(mode = 'single') {
  const kind = Scope.activeSourceKind;
  const source = sources[kind];
  driver.setSource(source);
  try {
    if (kind === 'simulation') {
      applySimulationParamsFromUI();
      const status = source.getStatus();
      if (!status.connected) await source.connect();
      await source.startAcquisition();
    }
    const waveform = await driver.acquire(mode);
    Scope.waveform = waveform;
    Scope.cursors = null;
    runAnalysis();
    renderAll();
    InstrumentManager.registry.setStatus('oscilloscope', 'connected', source.getStatus().label);
    return waveform;
  } catch (e) {
    toast(`🔬 Oscilloscope — ${e.message}`, true);
    InstrumentManager.registry.setStatus('oscilloscope', kind === 'simulation' ? 'connected' : 'error', e.message);
    renderInstruments();
    renderStatusPill();
    throw e;
  }
}

function stopContinuous() {
  if (Scope.continuousTimer) { clearInterval(Scope.continuousTimer); Scope.continuousTimer = null; }
  const btn = q('oscBtnContinuous');
  if (btn) btn.textContent = '⏵ ' + T('Continu');
}

// ═══════════════════════════════════════════════════════
// Sources / import / USB / Bluetooth
// ═══════════════════════════════════════════════════════
function refreshAvailabilityLabels() {
  const usbEl = q('oscUsbAvail');
  const btEl = q('oscBtAvail');
  const usbOk = isUSBAvailable();
  const btOk = isBluetoothAvailable();
  if (usbEl) usbEl.textContent = usbOk ? '✓' : '✕';
  if (btEl) btEl.textContent = btOk ? '✓' : '✕';
  const usbSrc = q('oscSources')?.querySelector('[data-source="usb"]');
  const btSrc = q('oscSources')?.querySelector('[data-source="bluetooth"]');
  if (usbSrc) usbSrc.classList.toggle('unavailable', !usbOk);
  if (btSrc) btSrc.classList.toggle('unavailable', !btOk);
  const usbNote = q('oscUsbNote');
  if (usbNote) usbNote.textContent = usbOk ? T('Cliquez pour sélectionner un appareil USB réel (aucun pilote de mesure n\'est encore câblé pour la plupart des instruments).') : T(USB_UNAVAILABLE_MESSAGE);
  const btNote = q('oscBtNote');
  if (btNote) btNote.textContent = btOk ? T('Cliquez pour sélectionner un appareil Bluetooth réel (aucun pilote de mesure n\'est encore câblé pour la plupart des instruments).') : T(BLUETOOTH_UNAVAILABLE_MESSAGE);
}

function selectSource(kind) {
  stopContinuous();
  Scope.activeSourceKind = kind;
  const cards = q('oscSources')?.querySelectorAll('.osc-src') || [];
  cards.forEach(c => c.classList.toggle('active', c.dataset.source === kind));
  ['Simulation', 'Import', 'Usb', 'Bluetooth'].forEach(name => {
    const el = q('oscConfig' + name);
    if (el) el.classList.toggle('active', name.toLowerCase() === kind || (name === 'Simulation' && kind === 'simulation'));
  });
  Scope.waveform = null; Scope.analysis = null; Scope.harmonics = null; Scope.cursors = null;
  renderAll();
}

async function requestUSB() {
  try {
    await sources.usb.connect();
    toast('🔌 Appareil USB sélectionné — ' + (sources.usb.getStatus().detail || ''));
  } catch (e) {
    toast(`USB : ${e.message}`, true);
  }
  renderStatusPill();
  renderInstruments();
}

async function requestBluetooth() {
  try {
    await sources.bluetooth.connect();
    toast('📶 Appareil Bluetooth sélectionné — ' + (sources.bluetooth.getStatus().detail || ''));
  } catch (e) {
    toast(`Bluetooth : ${e.message}`, true);
  }
  renderStatusPill();
  renderInstruments();
}

function onImportFileChange(input) {
  const file = input.files && input.files[0];
  const statusEl = q('oscImportStatus');
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result);
      const isJSON = /\.json$/i.test(file.name);
      const opts = { fileName: file.name };
      const waveform = isJSON ? sources.import.loadJSON(text, opts) : sources.import.loadCSV(text, opts);
      Scope.waveform = waveform;
      Scope.cursors = null;
      runAnalysis();
      renderAll();
      if (statusEl) statusEl.textContent = `📂 ${file.name} — ${waveform.samples.length} échantillons chargés`;
      InstrumentManager.registry.setStatus('oscilloscope', 'connected', `Import : ${file.name}`);
    } catch (e) {
      const msg = e instanceof ImportParseError ? e.message : `Erreur d'import : ${e.message}`;
      if (statusEl) statusEl.textContent = `⚠️ ${msg}`;
      toast(msg, true);
    }
  };
  reader.onerror = () => { if (statusEl) statusEl.textContent = '⚠️ Impossible de lire le fichier'; };
  reader.readAsText(file);
}

// ═══════════════════════════════════════════════════════
// Export / rapport
// ═══════════════════════════════════════════════════════
function downloadBlob(content, type, filename) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function exportCSV() {
  if (!Scope.waveform) { toast('Aucune acquisition à exporter', true); return; }
  const w = Scope.waveform;
  const lines = ['time_s,voltage_V'];
  for (let i = 0; i < w.samples.length; i++) lines.push(`${(i / w.sampleRate).toFixed(9)},${w.samples[i]}`);
  downloadBlob(lines.join('\n'), 'text/csv', `oscilloscope-hadj-${Date.now()}.csv`);
  toast('CSV exporté');
}

function capturePNG() {
  const canvas = q('oscCanvas');
  if (!Scope.waveform || !canvas) { toast('Aucune acquisition à capturer', true); return; }
  const a = document.createElement('a');
  a.download = `oscilloscope-hadj-${Date.now()}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
  toast('PNG exporté');
}

function capture() {
  const canvas = q('oscCanvas');
  const fftCanvas = q('oscFftCanvas');
  if (!Scope.waveform || !Scope.analysis) { toast('Aucune acquisition à capturer', true); return; }
  window.__lastScopeCapture = {
    timestamp: Date.now(),
    sourceLabel: sources[Scope.activeSourceKind].getStatus().label,
    metadata: Scope.waveform.metadata,
    metrics: Scope.analysis.metrics,
    anomalies: Scope.analysis.anomalies,
    harmonics: Scope.harmonics,
    imageDataUrl: canvas ? canvas.toDataURL('image/png') : null,
    fftImageDataUrl: fftCanvas ? fftCanvas.toDataURL('image/png') : null,
  };
  toast('📸 Capture enregistrée pour le rapport');
}

function addToReport() {
  capture();
}

function renderScopeReportSection() {
  const cap = window.__lastScopeCapture;
  if (!cap) return '';
  const rows = TILE_DEFS.map(([label, fmt]) => `<tr><td>${label}</td><td>${fmt(cap.metrics)}</td></tr>`).join('');
  const anomaliesHtml = cap.anomalies && cap.anomalies.length
    ? `<ul>${cap.anomalies.map(a => `<li>⚠️ ${a.label}</li>`).join('')}</ul>`
    : '<p>Aucune anomalie détectée.</p>';
  const fftHtml = cap.harmonics && cap.harmonics.fundamental
    ? `<p>Fondamentale : ${formatFreq(cap.harmonics.fundamental.freq)} · THD : ${formatPct(cap.harmonics.thdPercent)}</p>`
    : '<p>FFT indisponible.</p>';
  return `
    <div class="section">
      <h3>🔬 Oscilloscope — ${cap.sourceLabel || ''}</h3>
      <p class="meta">Capture du ${new Date(cap.timestamp).toLocaleString('fr-FR')}</p>
      ${cap.imageDataUrl ? `<img src="${cap.imageDataUrl}" style="max-width:100%;border:1px solid #ccc;">` : ''}
      <table border="1" cellpadding="4" style="border-collapse:collapse;font-size:.85rem;margin-top:.5rem;">${rows}</table>
      ${fftHtml}
      ${cap.fftImageDataUrl ? `<img src="${cap.fftImageDataUrl}" style="max-width:100%;border:1px solid #ccc;margin-top:.4rem;">` : ''}
      ${anomaliesHtml}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════
// Instruments — recherche honnête (uniquement des appareils déjà
// autorisés par l'utilisateur ; aucune découverte "magique")
// ═══════════════════════════════════════════════════════
async function searchInstruments() {
  let found = 0;
  if (isUSBAvailable()) {
    try {
      const devices = await navigator.usb.getDevices();
      found += devices.length;
    } catch (_) { /* ignorer : pas d'accès accordé */ }
  }
  if (isBluetoothAvailable() && navigator.bluetooth.getDevices) {
    try {
      const devices = await navigator.bluetooth.getDevices();
      found += devices.length;
    } catch (_) { /* API expérimentale non disponible partout */ }
  }
  toast(found > 0
    ? `🔍 ${found} appareil(s) déjà autorisé(s) détecté(s) — sélectionnez USB/Bluetooth pour vous y connecter`
    : '🔍 Aucun appareil déjà autorisé — utilisez les cartes USB/Bluetooth pour en sélectionner un');
  renderInstruments();
}

// ═══════════════════════════════════════════════════════
// API publique (appelée depuis les onclick= de index.html)
// ═══════════════════════════════════════════════════════
window.HADJ_INSTR = {
  selectSource,
  requestUSB,
  requestBluetooth,
  onImportFileChange,
  onZoomChange(value) {
    Scope.zoomPct = Number(value) || 100;
    const label = q('oscZoomLabel');
    if (label) label.textContent = `${Scope.zoomPct}%`;
    drawWaveform();
  },
  acquireMono() {
    stopContinuous();
    acquireOnce('single').catch(() => {});
  },
  toggleContinuous() {
    const btn = q('oscBtnContinuous');
    if (Scope.continuousTimer) {
      stopContinuous();
      return;
    }
    if (Scope.activeSourceKind !== 'simulation') {
      acquireOnce('continuous').catch(() => {});
      return;
    }
    if (btn) btn.textContent = '⏸ ' + T('Pause');
    Scope.continuousTimer = setInterval(() => { acquireOnce('continuous').catch(() => stopContinuous()); }, 200);
  },
  capture,
  exportCSV,
  capturePNG,
  addToReport,
  searchInstruments,
  onTpSelectChange(value) {
    Scope.selectedTpId = value;
    renderTestPointSection();
  },
  compareToTestPoint() { compareToSelectedTestPoint(); },
  runAutoDiagnostic,
  onTabShown() {
    if (Scope.initialized) { renderAll(); return; }
    Scope.initialized = true;
    populateSignalTypeSelect();
    setupCursorInteraction();
    refreshAvailabilityLabels();
    InstrumentManager.registry.setDriver('oscilloscope', driver);
    // Première acquisition de démonstration en simulation — clairement
    // étiquetée, jamais présentée comme une mesure réelle.
    acquireOnce('single').catch(() => {});
  },
};

window.__renderScopeReportSection = renderScopeReportSection;

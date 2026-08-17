// ═══════════════════════════════════════════════════════
// multimeter-ui.js — point d'entrée DOM de l'onglet 📏 Multimètre
// ═══════════════════════════════════════════════════════
// Même architecture d'isolation que oscilloscope-ui.js (voir ce
// fichier pour le raisonnement complet) : module ES séparé, ne parle
// au reste de l'app que via window.*. Utilise SA PROPRE espace de noms
// (window.HADJ_INSTR_DMM) — surtout NE PAS réutiliser window.HADJ_INSTR
// (déjà pris par oscilloscope-ui.js) : deux scripts qui assignent le
// même window.X s'écraseraient l'un l'autre selon l'ordre de chargement.
//
// RÈGLE D'HONNÊTETÉ (§10/§11/§29) : REAL/SIMULATION/CAMERA_OCR/IMPORT
// ne sont jamais confondues ; une lecture caméra incertaine n'est
// jamais affichée comme acquise sans confirmation explicite.

import { DMMSimulationSource, DMM_MODES } from '../core/instruments/sources/DMMSimulationSource.js';
import { USBSource, isUSBAvailable, USB_UNAVAILABLE_MESSAGE } from '../core/instruments/sources/USBSource.js';
import { BluetoothSource, isBluetoothAvailable, BLUETOOTH_UNAVAILABLE_MESSAGE } from '../core/instruments/sources/BluetoothSource.js';
import { MultimeterDriver } from '../core/instruments/drivers/MultimeterDriver.js';
import { InstrumentManager } from '../core/instruments/InstrumentManager.js';
import { MeasurementHistory } from '../core/instruments/MeasurementHistory.js';
import { Measurement, SOURCE_KIND } from '../core/instruments/Measurement.js';

const q = (id) => document.getElementById(id);
const T = (fr) => (typeof window.t === 'function' ? window.t(fr) : fr);
const toast = (msg, isError) => {
  if (typeof window.__toast === 'function') window.__toast(msg, isError);
  else if (isError) console.error(msg); else console.log(msg);
};

const MODE_LABELS = {
  DC_VOLTAGE: 'Tension DC', AC_VOLTAGE: 'Tension AC', RESISTANCE: 'Résistance',
  CONTINUITY: 'Continuité', DIODE: 'Diode', CAPACITANCE: 'Capacité',
  FREQUENCY: 'Fréquence', TEMPERATURE: 'Température', CURRENT: 'Courant',
  UNKNOWN: 'Mode inconnu',
};

const dmmSources = {
  simulation: new DMMSimulationSource(),
  usb: new USBSource(),
  bluetooth: new BluetoothSource(),
};
const driver = new MultimeterDriver({ source: dmmSources.simulation });

const DMM = {
  activeSourceKind: 'simulation',
  camStream: null,
  lastMeasurement: null,      // Measurement affichée à l'écran
  pendingOCR: null,           // résultat OCR en attente de confirmation utilisateur
  continuousTimer: null,
  initialized: false,
};

function renderModeSelect() {
  const sel = q('dmmMode');
  if (!sel || sel.options.length) return;
  sel.innerHTML = DMM_MODES.map(m => `<option value="${m}">${T(MODE_LABELS[m] || m)}</option>`).join('');
}

function renderStatusPill() {
  const el = q('dmmStatusPill');
  if (!el) return;
  const kind = DMM.activeSourceKind;
  const source = dmmSources[kind];
  const status = source ? source.getStatus() : { connected: false, label: '⚪ NON CONNECTÉ' };
  el.classList.remove('st-sim', 'st-real', 'st-import', 'st-detected', 'st-none', 'st-err');
  let cls = 'st-none';
  if (kind === 'simulation') cls = 'st-sim';
  else if (kind === 'camera') cls = 'st-detected';
  else if ((kind === 'usb' || kind === 'bluetooth') && status.connected) cls = 'st-detected';
  el.classList.add(cls);
  el.textContent = status.label || '⚪ NON CONNECTÉ';
  el.title = status.detail || '';
}

function formatValue(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs !== 0 && (abs < 0.001 || abs >= 100000)) return v.toExponential(3);
  return v.toFixed(abs < 10 ? 3 : abs < 1000 ? 2 : 1);
}

function renderReadout() {
  const valEl = q('dmmValue');
  const unitEl = q('dmmUnit');
  const modeEl = q('dmmModeLabel');
  const srcBadge = q('dmmSourceBadge');
  const confEl = q('dmmConfidence');
  const m = DMM.lastMeasurement;
  if (valEl) valEl.textContent = m ? formatValue(m.value) : '—';
  if (unitEl) unitEl.textContent = m ? m.unit : '';
  if (modeEl) modeEl.textContent = m ? T(MODE_LABELS[m.mode] || m.mode) : T('Aucune mesure');
  if (srcBadge) srcBadge.textContent = m ? Measurement.sourceLabel(m.source) : '';
  if (confEl) confEl.textContent = m && m.confidence != null ? `${T('Confiance')} : ${(m.confidence * 100).toFixed(0)}%` : '';
}

function renderConfirmBanner() {
  const el = q('dmmConfirmBanner');
  if (!el) return;
  if (!DMM.pendingOCR) { el.innerHTML = ''; return; }
  const { reason } = DMM.pendingOCR;
  el.innerHTML = `
    <div class="dmm-confirm-banner">
      ⚠ ${T('Lecture incertaine')} — ${esc(reason || T('confiance insuffisante'))}. ${T('Veuillez confirmer la mesure.')}
      <div style="margin-top:.4rem;display:flex;gap:.4rem;">
        <button class="action-btn" onclick="window.HADJ_INSTR_DMM?.confirmPendingOCR()">✓ ${T('Confirmer')}</button>
        <button class="action-btn" onclick="window.HADJ_INSTR_DMM?.rejectPendingOCR()">✕ ${T('Rejeter')}</button>
      </div>
    </div>`;
}

function renderHistory() {
  const el = q('dmmHistory');
  if (!el) return;
  const entries = MeasurementHistory.list().slice(0, 25);
  if (!entries.length) { el.innerHTML = `<div class="osc-note">${T('Aucune mesure enregistrée')}</div>`; return; }
  el.innerHTML = entries.map(e => `
    <div class="dmm-history-row">
      <span>${new Date(e.timestamp).toLocaleTimeString('fr-FR')} · ${T(MODE_LABELS[e.mode] || e.mode)}</span>
      <span>${formatValue(e.value)} ${esc(e.unit)}</span>
      <span>${Measurement.sourceLabel(e.source)}</span>
    </div>
  `).join('');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function renderInstruments() {
  const body = q('dmmInstrumentsBody');
  if (!body) return;
  const dotClass = (status) => status === 'connected' ? 'on' : (status === 'available' ? 'warn' : '');
  const statusLabel = (status) => ({
    connected: '🟢 Connecté', available: '🟡 Disponible', error: '🔴 Erreur', disconnected: '⚪ Non connecté',
  }[status] || '⚪ Non connecté');
  body.innerHTML = InstrumentManager.registry.list().map(inst => `
    <tr>
      <td>${inst.icon} ${T(inst.label)}</td>
      <td><span class="osc-dot ${dotClass(inst.status)}"></span>${statusLabel(inst.status)}</td>
      <td>${inst.detail ? esc(inst.detail) : ''}</td>
    </tr>
  `).join('');
}

function renderAll() {
  renderStatusPill();
  renderReadout();
  renderConfirmBanner();
  renderHistory();
  renderInstruments();
}

// ═══════════════════════════════════════════════════════
// Simulation
// ═══════════════════════════════════════════════════════
function applySimConfigFromUI() {
  // Champ vide = "utiliser la valeur par défaut du mode". Number('') vaut 0
  // (pas NaN) en JS : il faut donc tester la chaîne brute, pas le résultat
  // de Number(), sous peine d'écraser silencieusement la valeur cible par
  // zéro. On force explicitement `undefined` (et non une clé omise) pour
  // aussi effacer une valeur personnalisée précédemment mémorisée par
  // DMMSimulationSource.configure() (Object.assign ne supprime pas les
  // clés absentes de l'objet fusionné).
  const rawTrueValue = q('dmmSimTrueValue')?.value?.trim();
  const p = {
    mode: q('dmmMode')?.value || 'DC_VOLTAGE',
    trueValue: rawTrueValue ? Number(rawTrueValue) : undefined,
    noisePct: Number(q('dmmSimNoise')?.value) || 0,
  };
  if (p.trueValue != null && Number.isNaN(p.trueValue)) p.trueValue = undefined;
  dmmSources.simulation.configure(p);
}

async function measureSimulated() {
  const source = dmmSources.simulation;
  driver.setSource(source);
  try {
    applySimConfigFromUI();
    const status = source.getStatus();
    if (!status.connected) await source.connect();
    await source.startAcquisition();
    const measurement = await driver.readSimulated();
    DMM.lastMeasurement = measurement;
    DMM.pendingOCR = null;
    MeasurementHistory.add({ measurement, instrument: 'multimeter' });
    renderAll();
    InstrumentManager.registry.setStatus('multimeter', 'connected', source.getStatus().label);
  } catch (e) {
    toast(`📏 Multimètre — ${e.message}`, true);
  }
}

function stopContinuous() {
  if (DMM.continuousTimer) { clearInterval(DMM.continuousTimer); DMM.continuousTimer = null; }
  const btn = q('dmmBtnContinuous');
  if (btn) btn.textContent = '⏵ ' + T('Continu');
}

// ═══════════════════════════════════════════════════════
// Caméra OCR — flux dédié, indépendant des autres flux caméra de l'app
// ═══════════════════════════════════════════════════════
async function startCamera() {
  const video = q('dmmVideo');
  if (!video) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
    DMM.camStream = stream;
    video.srcObject = stream;
    q('dmmCamWrap')?.classList.add('show');
  } catch (e) {
    toast('Caméra indisponible : ' + e.message, true);
  }
}

function stopCamera() {
  if (DMM.camStream) { DMM.camStream.getTracks().forEach(t => t.stop()); DMM.camStream = null; }
  const video = q('dmmVideo');
  if (video) video.srcObject = null;
  q('dmmCamWrap')?.classList.remove('show');
}

async function captureAndRead() {
  const video = q('dmmVideo');
  if (!video || !video.videoWidth) { toast('Démarrez d\'abord la caméra', true); return; }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];

  const statusEl = q('dmmOcrStatus');
  if (statusEl) statusEl.textContent = '⏳ ' + T('Analyse en cours…');
  try {
    const result = await driver.readFromCameraOCR(base64, 'image/jpeg');
    if (statusEl) statusEl.textContent = '';
    if (!result.ok) {
      DMM.pendingOCR = null;
      DMM.lastMeasurement = null;
      toast(result.reason, true);
      renderAll();
      return;
    }
    if (result.needsConfirmation) {
      DMM.pendingOCR = result;
      DMM.lastMeasurement = result.measurement; // affiché, mais visuellement marqué "à confirmer" via la bannière
      renderAll();
    } else {
      DMM.pendingOCR = null;
      DMM.lastMeasurement = result.measurement;
      MeasurementHistory.add({ measurement: result.measurement, instrument: 'multimeter', note: result.rawDisplayText });
      InstrumentManager.registry.setStatus('multimeter', 'connected', '📷 OCR caméra');
      renderAll();
      toast('📷 Lecture OCR enregistrée');
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = '';
    toast(`OCR : ${e.message}`, true);
  }
}

function confirmPendingOCR() {
  if (!DMM.pendingOCR) return;
  MeasurementHistory.add({ measurement: DMM.pendingOCR.measurement, instrument: 'multimeter', note: DMM.pendingOCR.rawDisplayText });
  toast('✓ Lecture confirmée et enregistrée');
  DMM.pendingOCR = null;
  renderAll();
}

function rejectPendingOCR() {
  DMM.pendingOCR = null;
  DMM.lastMeasurement = null;
  toast('Lecture rejetée — non enregistrée');
  renderAll();
}

// ═══════════════════════════════════════════════════════
// Sources / USB / Bluetooth
// ═══════════════════════════════════════════════════════
function refreshAvailabilityLabels() {
  const usbOk = isUSBAvailable();
  const btOk = isBluetoothAvailable();
  const usbEl = q('dmmUsbAvail'); if (usbEl) usbEl.textContent = usbOk ? '✓' : '✕';
  const btEl = q('dmmBtAvail'); if (btEl) btEl.textContent = btOk ? '✓' : '✕';
  const usbSrc = q('dmmSources')?.querySelector('[data-source="usb"]');
  const btSrc = q('dmmSources')?.querySelector('[data-source="bluetooth"]');
  if (usbSrc) usbSrc.classList.toggle('unavailable', !usbOk);
  if (btSrc) btSrc.classList.toggle('unavailable', !btOk);
  const usbNote = q('dmmUsbNote');
  if (usbNote) usbNote.textContent = usbOk ? T('Cliquez pour sélectionner un multimètre USB réel (aucun pilote de mesure n\'est encore câblé pour la plupart des modèles).') : T(USB_UNAVAILABLE_MESSAGE);
  const btNote = q('dmmBtNote');
  if (btNote) btNote.textContent = btOk ? T('Cliquez pour sélectionner un multimètre Bluetooth réel (aucun pilote de mesure n\'est encore câblé pour la plupart des modèles).') : T(BLUETOOTH_UNAVAILABLE_MESSAGE);
}

function selectSource(kind) {
  stopContinuous();
  if (DMM.activeSourceKind === 'camera' && kind !== 'camera') stopCamera();
  DMM.activeSourceKind = kind;
  DMM.pendingOCR = null;
  const cards = q('dmmSources')?.querySelectorAll('.osc-src') || [];
  cards.forEach(c => c.classList.toggle('active', c.dataset.source === kind));
  ['Simulation', 'Camera', 'Usb', 'Bluetooth'].forEach(name => {
    const el = q('dmmConfig' + name);
    if (el) el.classList.toggle('active', name.toLowerCase() === kind);
  });
  renderAll();
}

async function requestUSB() {
  try {
    await dmmSources.usb.connect();
    toast('🔌 Appareil USB sélectionné — ' + (dmmSources.usb.getStatus().detail || ''));
  } catch (e) { toast(`USB : ${e.message}`, true); }
  renderStatusPill(); renderInstruments();
}

async function requestBluetooth() {
  try {
    await dmmSources.bluetooth.connect();
    toast('📶 Appareil Bluetooth sélectionné — ' + (dmmSources.bluetooth.getStatus().detail || ''));
  } catch (e) { toast(`Bluetooth : ${e.message}`, true); }
  renderStatusPill(); renderInstruments();
}

async function searchInstruments() {
  let found = 0;
  if (isUSBAvailable()) { try { found += (await navigator.usb.getDevices()).length; } catch (_) {} }
  if (isBluetoothAvailable() && navigator.bluetooth.getDevices) { try { found += (await navigator.bluetooth.getDevices()).length; } catch (_) {} }
  toast(found > 0
    ? `🔍 ${found} appareil(s) déjà autorisé(s) détecté(s)`
    : '🔍 Aucun appareil déjà autorisé — utilisez les cartes USB/Bluetooth pour en sélectionner un');
  renderInstruments();
}

// ═══════════════════════════════════════════════════════
// Rapport
// ═══════════════════════════════════════════════════════
function renderDMMReportSection() {
  const entries = MeasurementHistory.list().slice(0, 20);
  if (!entries.length) return '';
  const rows = entries.map(e => `<tr>
    <td>${new Date(e.timestamp).toLocaleString('fr-FR')}</td>
    <td>${MODE_LABELS[e.mode] || e.mode}</td>
    <td>${formatValue(e.value)} ${esc(e.unit)}</td>
    <td>${Measurement.sourceLabel(e.source)}</td>
    <td>${e.confidence != null ? (e.confidence * 100).toFixed(0) + '%' : '—'}</td>
  </tr>`).join('');
  return `
    <div class="section">
      <h3>📏 Multimètre — historique des mesures</h3>
      <table border="1" cellpadding="4" style="border-collapse:collapse;font-size:.85rem;">
        <tr><th>Date</th><th>Mode</th><th>Valeur</th><th>Source</th><th>Confiance</th></tr>
        ${rows}
      </table>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════
// API publique
// ═══════════════════════════════════════════════════════
window.HADJ_INSTR_DMM = {
  selectSource,
  requestUSB,
  requestBluetooth,
  searchInstruments,
  measureSimulated,
  toggleContinuous() {
    if (DMM.continuousTimer) { stopContinuous(); return; }
    if (DMM.activeSourceKind !== 'simulation') { measureSimulated(); return; }
    const btn = q('dmmBtnContinuous');
    if (btn) btn.textContent = '⏸ ' + T('Pause');
    DMM.continuousTimer = setInterval(() => { measureSimulated(); }, 800);
  },
  startCamera,
  stopCamera,
  captureAndRead,
  confirmPendingOCR,
  rejectPendingOCR,
  clearHistory() {
    MeasurementHistory.clear();
    renderHistory();
    toast('Historique vidé');
  },
  onTabShown() {
    if (DMM.initialized) { renderAll(); return; }
    DMM.initialized = true;
    renderModeSelect();
    refreshAvailabilityLabels();
    InstrumentManager.registry.setDriver('multimeter', driver);
    renderAll();
  },
};

window.__renderDMMReportSection = renderDMMReportSection;

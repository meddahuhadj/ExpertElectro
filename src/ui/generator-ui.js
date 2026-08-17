// ═══════════════════════════════════════════════════════
// generator-ui.js — point d'entrée DOM de l'onglet 〰 Générateur
// ═══════════════════════════════════════════════════════
// Même architecture d'isolation que oscilloscope-ui.js/multimeter-ui.js.
// Espace de noms dédié : window.HADJ_INSTR_GEN.
//
// HONNÊTETÉ : la sortie affichée est un APERÇU calculé réellement
// (mêmes maths que la simulation oscilloscope), jamais présentée comme
// un signal réellement émis. "Envoyer au générateur" passe par le vrai
// pipeline de sécurité et échoue toujours honnêtement tant qu'aucun
// générateur réel n'est connecté (Phase 4).

import { FunctionGeneratorDriver, GENERATOR_WAVEFORMS } from '../core/instruments/drivers/FunctionGeneratorDriver.js';
import { InstrumentManager } from '../core/instruments/InstrumentManager.js';

const q = (id) => document.getElementById(id);
const T = (fr) => (typeof window.t === 'function' ? window.t(fr) : fr);
const toast = (msg, isError) => {
  if (typeof window.__toast === 'function') window.__toast(msg, isError);
  else if (isError) console.error(msg); else console.log(msg);
};

const WAVEFORM_LABELS = {
  sine: 'Sinus', square: 'Carré', triangle: 'Triangle', sawtooth: 'Dent de scie',
  pulse: 'Impulsion', dc: 'DC', arbitrary: 'Arbitraire',
};

const driver = new FunctionGeneratorDriver();
const GEN = { initialized: false };

function populateWaveformSelect() {
  const sel = q('genWaveform');
  if (!sel || sel.options.length) return;
  sel.innerHTML = GENERATOR_WAVEFORMS.map(w => `<option value="${w}">${T(WAVEFORM_LABELS[w] || w)}</option>`).join('');
}

function applyConfigFromUI() {
  driver.configure({
    waveform: q('genWaveform')?.value || 'sine',
    frequencyHz: Number(q('genFreq')?.value) || 1000,
    amplitudeVpp: Number(q('genAmp')?.value) || 5,
    offsetV: Number(q('genOffset')?.value) || 0,
    dutyCycle: Number(q('genDuty')?.value) || 50,
    phaseDeg: Number(q('genPhase')?.value) || 0,
  });
}

function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  const get = (name, fallback) => (cs.getPropertyValue(name) || fallback).trim();
  return { canvasBg: get('--canvas-bg', '#08090C'), gridMinor: get('--grid-minor', 'rgba(245,166,35,0.09)'), accentY: get('--accent-y', '#F5A623') };
}

function drawPreview(waveform) {
  const canvas = q('genCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const c = themeColors();
  ctx.fillStyle = c.canvasBg; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = c.gridMinor; ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) { const x = Math.round((i / 10) * w) + 0.5; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let j = 0; j <= 6; j++) { const y = Math.round((j / 6) * h) + 0.5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  const samples = waveform.samples;
  let vMax = -Infinity, vMin = Infinity;
  for (const s of samples) { if (s > vMax) vMax = s; if (s < vMin) vMin = s; }
  if (!(vMax > vMin)) { vMax += 1; vMin -= 1; }
  const pad = (vMax - vMin) * 0.12; vMax += pad; vMin -= pad;

  ctx.strokeStyle = c.accentY; ctx.lineWidth = 1.6; ctx.beginPath();
  for (let i = 0; i < samples.length; i++) {
    const x = (i / (samples.length - 1)) * w;
    const y = h - ((samples[i] - vMin) / (vMax - vMin)) * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function updatePreview() {
  try {
    applyConfigFromUI();
    const waveform = driver.previewWaveform();
    drawPreview(waveform);
    const note = q('genPreviewNote');
    if (note) note.textContent = '🟡 ' + T('APERÇU — aucun signal réellement émis');
  } catch (e) {
    toast(`Générateur : ${e.message}`, true);
  }
}

async function sendOutput() {
  applyConfigFromUI();
  const cfg = driver.getConfig();
  const dangerous = cfg.amplitudeVpp > 20; // au-delà d'une sortie "labo" usuelle
  try {
    await driver.sendOutput(cfg, {
      dangerous,
      confirmFn: async () => window.confirm(
        `⚠️ ATTENTION\nCette action peut alimenter le circuit connecté au générateur.\n\n` +
        `${WAVEFORM_LABELS[cfg.waveform] || cfg.waveform}, ${cfg.frequencyHz} Hz, ${cfg.amplitudeVpp} Vpp\n\n` +
        `Confirmez-vous l'activation ?`
      ),
    });
  } catch (e) {
    toast(`〰 ${e.message}`, true);
  }
  InstrumentManager.registry.setStatus('function-generator', 'disconnected', T('Configuration prête — aucun générateur réel connecté'));
  renderInstruments();
}

function renderInstruments() {
  const body = q('genInstrumentsBody');
  if (!body) return;
  const dotClass = (status) => status === 'connected' ? 'on' : (status === 'available' ? 'warn' : '');
  const statusLabel = (status) => ({
    connected: '🟢 Connecté', available: '🟡 Disponible', error: '🔴 Erreur', disconnected: '⚪ Non connecté',
  }[status] || '⚪ Non connecté');
  body.innerHTML = InstrumentManager.registry.list().map(inst => `
    <tr><td>${inst.icon} ${T(inst.label)}</td><td><span class="osc-dot ${dotClass(inst.status)}"></span>${statusLabel(inst.status)}</td><td>${inst.detail ? esc(inst.detail) : ''}</td></tr>
  `).join('');
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }

function renderGenReportSection() {
  const cfg = driver.getConfig();
  const status = InstrumentManager.registry.get('function-generator');
  return `
    <div class="section">
      <h3>〰 Générateur de fonctions — configuration</h3>
      <p>${WAVEFORM_LABELS[cfg.waveform] || cfg.waveform} · ${cfg.frequencyHz} Hz · ${cfg.amplitudeVpp} Vpp · offset ${cfg.offsetV} V · duty ${cfg.dutyCycle}% · phase ${cfg.phaseDeg}°</p>
      <p class="meta">Statut : ${status ? status.status : 'disconnected'} — aucune sortie réelle n'a été émise (aperçu de calcul uniquement).</p>
    </div>
  `;
}
window.__renderGenReportSection = renderGenReportSection;

window.HADJ_INSTR_GEN = {
  updatePreview,
  sendOutput,
  onTabShown() {
    if (GEN.initialized) { updatePreview(); renderInstruments(); return; }
    GEN.initialized = true;
    populateWaveformSelect();
    InstrumentManager.registry.setDriver('function-generator', driver);
    InstrumentManager.registry.setStatus('function-generator', 'disconnected', '');
    updatePreview();
    renderInstruments();
  },
};

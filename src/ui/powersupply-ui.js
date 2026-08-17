// ═══════════════════════════════════════════════════════
// powersupply-ui.js — point d'entrée DOM de l'onglet 🔋 Alimentation
// ═══════════════════════════════════════════════════════
// Espace de noms dédié : window.HADJ_INSTR_PSU. Voir
// oscilloscope-ui.js pour le raisonnement d'isolation complet.
//
// SÉCURITÉ (§13/§14) : "Armer la sortie" passe TOUJOURS par
// InstrumentSafety.checkCommand avant quoi que ce soit d'autre. Selon
// le niveau de risque évalué par PowerSupplyDriver.assessRisk() :
//  - risque usuel (tension/courant dans les limites, <50V) → une
//    confirmation légère (window.confirm) suffit ;
//  - risque élevé (hors limites, ou tension ≥50V "TBTS/SELV") → la
//    procédure de consignation NFC 18-510 complète existante
//    (window.openConsignation) est exigée, comme pour tout travail
//    dangereux ailleurs dans l'app.
// Dans tous les cas, la commande échoue ensuite honnêtement tant
// qu'aucune alimentation réelle n'est connectée (Phase 4) — jamais de
// fausse confirmation de sortie activée.

import { PowerSupplyDriver } from '../core/instruments/drivers/PowerSupplyDriver.js';
import { InstrumentManager } from '../core/instruments/InstrumentManager.js';

const q = (id) => document.getElementById(id);
const T = (fr) => (typeof window.t === 'function' ? window.t(fr) : fr);
const toast = (msg, isError) => {
  if (typeof window.__toast === 'function') window.__toast(msg, isError);
  else if (isError) console.error(msg); else console.log(msg);
};

const driver = new PowerSupplyDriver();
const PSU = { initialized: false };

function applyConfigFromUI() {
  return driver.configure({
    voltageV: Number(q('psuVoltage')?.value) || 0,
    currentLimitA: Number(q('psuCurrentLimit')?.value) || 0,
    ovpV: q('psuOVP')?.value ? Number(q('psuOVP').value) : null,
    ocpA: q('psuOCP')?.value ? Number(q('psuOCP').value) : null,
  });
}

function renderMainsWarning() {
  const cfg = applyConfigFromUI();
  const el = q('psuMainsWarning');
  if (!el) return;
  el.style.display = cfg.voltageV >= 50 ? '' : 'none';
}

/** Confirmation légère : simple confirm() natif — un vrai geste utilisateur, sans construire de modal dédiée pour cette phase. */
function confirmLight(cfg) {
  return window.confirm(
    `⚠️ ATTENTION\nCette action peut alimenter le circuit connecté à l'alimentation.\n\n` +
    `${cfg.voltageV} V · limite ${cfg.currentLimitA} A\n\nConfirmez-vous l'activation de la sortie ?`
  );
}

/** Confirmation lourde : réutilise la procédure de consignation NFC 18-510 déjà existante dans l'app (5 étapes obligatoires). */
function confirmViaConsignation() {
  return new Promise((resolve) => {
    if (typeof window.openConsignation !== 'function') {
      toast('Procédure de consignation indisponible dans cette version de la page', true);
      resolve(false);
      return;
    }
    toast('🔒 Tension ≥ 50V ou hors limites — procédure de consignation NFC 18-510 requise avant activation');
    window.openConsignation(() => resolve(true));
  });
}

async function armOutput() {
  const cfg = applyConfigFromUI();
  try {
    await driver.armOutput(cfg, {
      // `info` = {dangerous, overVoltage, overCurrent} tel qu'évalué par
      // InstrumentSafety.checkCommand (à partir de PowerSupplyDriver.assessRisk) —
      // c'est cette évaluation, pas une recalculée en double ici, qui décide
      // de la procédure de confirmation à afficher.
      confirmFn: async (info) => ((info.dangerous || info.overVoltage || info.overCurrent) ? confirmViaConsignation() : confirmLight(cfg)),
    });
  } catch (e) {
    toast(`🔋 ${e.message}`, true);
  }
  InstrumentManager.registry.setStatus('power-supply', 'disconnected', T('Configuration prête — aucune alimentation réelle connectée'));
  renderInstruments();
}

function renderInstruments() {
  const body = q('psuInstrumentsBody');
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

function renderPSUReportSection() {
  const cfg = driver.getConfig();
  const status = InstrumentManager.registry.get('power-supply');
  return `
    <div class="section">
      <h3>🔋 Alimentation programmable — configuration</h3>
      <p>Consigne : ${cfg.voltageV} V · limite de courant ${cfg.currentLimitA} A${cfg.ovpV != null ? ` · OVP ${cfg.ovpV} V` : ''}${cfg.ocpA != null ? ` · OCP ${cfg.ocpA} A` : ''}</p>
      <p class="meta">Statut : ${status ? status.status : 'disconnected'} — sortie jamais activée réellement (aucune alimentation connectée).</p>
    </div>
  `;
}
window.__renderPSUReportSection = renderPSUReportSection;

window.HADJ_INSTR_PSU = {
  onVoltageChange: renderMainsWarning,
  armOutput,
  onTabShown() {
    if (PSU.initialized) { renderMainsWarning(); renderInstruments(); return; }
    PSU.initialized = true;
    InstrumentManager.registry.setDriver('power-supply', driver);
    InstrumentManager.registry.setStatus('power-supply', 'disconnected', '');
    renderMainsWarning();
    renderInstruments();
  },
};

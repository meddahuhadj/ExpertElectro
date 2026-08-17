// ═══════════════════════════════════════════════════════
// random.js — petit PRNG déterministe + bruit gaussien
// ═══════════════════════════════════════════════════════
// Extrait de SimulationSource.js pour être réutilisé par toutes les
// sources de simulation (oscilloscope, multimètre…) sans dupliquer le
// code (cahier des charges §28 : « ne pas dupliquer le code »).

/** Petit PRNG déterministe (mulberry32) — permet des tests reproductibles via `seed`. */
export function makeRng(seed) {
  if (seed == null) return Math.random;
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bruit gaussien (Box-Muller) à partir d'un générateur uniforme [0,1). */
export function gaussian(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

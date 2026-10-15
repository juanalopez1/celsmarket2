const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || './data';
const SETTINGS = path.join(DATA_DIR, 'settings.json');

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch { return {}; }
}
function writeSettings(patch) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const next = { ...readSettings(), ...patch };
  fs.writeFileSync(SETTINGS, JSON.stringify(next, null, 2));
  return next;
}

let last = null; // { rate, at }
const TTL = 30 * 60 * 1000;

async function fetchMarketRate() {
  if (last && Date.now() - last.at < TTL) return last.rate;
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    const v = j && j.rates && j.rates.UYU;
    if (typeof v === 'number' && v > 0) { last = { rate: v, at: Date.now() }; return v; }
  } catch {}
  return last ? last.rate : null;
}

// Prioridad: valor manual del dueño > mercado (automático) > RATE_FALLBACK
async function getRate() {
  const s = readSettings();
  if (s.rateOverride > 0) return { rate: s.rateOverride, source: 'manual' };
  const m = await fetchMarketRate();
  if (m) return { rate: Math.round(m * 100) / 100, source: 'mercado' };
  return { rate: Number(process.env.RATE_FALLBACK) || 40, source: 'fallback' };
}

module.exports = { getRate, readSettings, writeSettings };

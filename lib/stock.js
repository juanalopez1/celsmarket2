const { readTab } = require('./sheets');
const photos = require('./photos');
const bat = (v) => (typeof v === 'number' ? `${Math.round(v <= 1 ? v * 100 : v)}%` : String(v ?? '').trim());
const { slug, normModel, normGb, cap, num, isTotalRow } = require('./util');

// Columnas esperadas
//  Seminuevos: Modelo | GB | Detalle | Color | Precio c | Precio v | Batería
//  Sellados:   Modelo | GB | Color | Precio c | Precio v
function parseSemi(rows) {
  return rows.filter((r) => r[0] && !isTotalRow(r)).map((r) => ({
    modelo: normModel(r[0]), gb: normGb(r[1]), detalle: String(r[2] || '').trim(),
    color: cap(r[3]), costo: num(r[4]), precio: num(r[5]),
    bateria: bat(r[6]), estado: 'Seminuevo',
  }));
}
function parseSellados(rows) {
  return rows.filter((r) => r[0] && !isTotalRow(r)).map((r) => ({
    modelo: normModel(r[0]), gb: normGb(r[1]), detalle: '', color: cap(r[2]),
    costo: num(r[3]), precio: num(r[4]), bateria: '', estado: 'Sellado',
  }));
}

async function loadAll() {
  const T = process.env;
  const [s1, s2, sl] = await Promise.all([
    readTab(T.TAB_SEMI_1 || 'Stock Seminuevos 1'),
    readTab(T.TAB_SEMI_2 || 'Stock Seminuevos 2'),
    readTab(T.TAB_SELLADOS || 'Stock Sellados').catch(() => []),
  ]);
  const semi = [...parseSemi(s1), ...parseSemi(s2)].map((x) => ({ ...x, moneda: T.CURRENCY_SEMI || 'UYU' }));
  const sel = parseSellados(sl).map((x) => ({ ...x, moneda: T.CURRENCY_SELLADOS || 'USD' }));
  return [...sel, ...semi].map((x) => ({ ...x, photoKey: slug(`${x.modelo} ${x.gb} ${x.color}`) }));
}

// Lo que ve el público: SIN precio de compra. Equipos idénticos se agrupan.
async function publicStock() {
  const items = (await loadAll()).filter((x) => x.precio > 0);
  const groups = new Map();
  for (const x of items) {
    const k = [x.estado, x.modelo, x.gb, x.color, x.bateria, x.detalle, x.precio, x.moneda].join('|');
    const g = groups.get(k);
    if (g) g.cantidad += 1;
    else groups.set(k, {
      estado: x.estado, modelo: x.modelo, gb: x.gb, color: x.color, bateria: x.bateria,
      detalle: /^(nada|ninguno|-)?$/i.test(x.detalle) ? '' : x.detalle,
      precio: x.precio, moneda: x.moneda, cantidad: 1, fotos: photos.list(x.photoKey),
    });
  }
  return [...groups.values()];
}

// Para el panel: un "slot" de foto por modelo + GB + color
async function photoSlots() {
  const slots = new Map();
  for (const x of await loadAll()) {
    const s = slots.get(x.photoKey) || { key: x.photoKey, modelo: x.modelo, gb: x.gb, color: x.color, equipos: 0, fotos: photos.list(x.photoKey) };
    s.equipos += 1;
    slots.set(x.photoKey, s);
  }
  return [...slots.values()].sort((a, b) => a.fotos.length - b.fotos.length || a.modelo.localeCompare(b.modelo));
}

module.exports = { loadAll, publicStock, photoSlots };

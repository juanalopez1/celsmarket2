const { readTab } = require('./sheets');
const { loadAll } = require('./stock');
const { normModel, num, parseDate } = require('./util');

const FINANCIERO = /pr[eé]stamo|inter[eé]s/i;
const stripGb = (m) => m.replace(/\s+(64|128|256|512|1024)\s*(gb)?$/i, '');
const ym = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

// Hoja Ventas: iPhone | Precio C | Precio V | Batería | Detalles | Fecha/Venta | Color | Ganancia
async function loadSales() {
  const rows = await readTab(process.env.TAB_VENTAS || 'Ventas');
  return rows.filter((r) => r[0]).map((r) => ({
    nombre: String(r[0]).trim(), costo: num(r[1]) || 0, venta: num(r[2]) || 0,
    fecha: parseDate(r[5]), ganancia: num(r[7]) ?? ((num(r[2]) || 0) - (num(r[1]) || 0)),
  })).filter((x) => x.fecha);
}

async function salesStats(month) {
  const all = await loadSales();
  const months = [...new Set(all.map((x) => ym(x.fecha)))].sort();
  const sel = month && months.includes(month) ? month : months[months.length - 1];
  const rows = all.filter((x) => ym(x.fecha) === sel);
  const equipos = rows.filter((x) => !FINANCIERO.test(x.nombre));
  const fin = rows.filter((x) => FINANCIERO.test(x.nombre));
  const sum = (a, k) => a.reduce((s, x) => s + x[k], 0);
  const revenue = sum(equipos, 'venta'), profit = sum(equipos, 'ganancia');

  const [y, m] = sel.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const maxDay = Math.max(...rows.map((x) => x.fecha.getUTCDate()));
  const byDay = Array.from({ length: maxDay }, (_, i) => ({ dia: i + 1, unidades: 0 }));
  equipos.forEach((x) => { byDay[x.fecha.getUTCDate() - 1].unidades += 1; });

  const models = new Map();
  for (const x of equipos) {
    const k = stripGb(normModel(x.nombre));
    const c = models.get(k) || { modelo: k, unidades: 0, facturado: 0, ganancia: 0 };
    c.unidades += 1; c.facturado += x.venta; c.ganancia += x.ganancia;
    models.set(k, c);
  }
  return {
    month: sel, months, diasDelMes: lastDay,
    kpis: {
      unidades: equipos.length, facturado: revenue, ganancia: profit,
      margen: revenue ? profit / revenue : 0,
      ticketMedio: equipos.length ? revenue / equipos.length : 0,
      promedioDiario: maxDay ? equipos.length / maxDay : 0,
      financieroGanancia: sum(fin, 'ganancia'), financieroMovimientos: fin.length,
    },
    byDay,
    byModel: [...models.values()].sort((a, b) => b.unidades - a.unidades || b.ganancia - a.ganancia).slice(0, 10),
  };
}

// Valor del stock calculado desde las filas (no desde los "TOTAL" escritos a mano)
async function stockValue() {
  const items = await loadAll();
  const by = (moneda) => {
    const a = items.filter((x) => x.moneda === moneda && x.precio > 0);
    const costo = a.reduce((s, x) => s + (x.costo || 0), 0), venta = a.reduce((s, x) => s + x.precio, 0);
    return { moneda, equipos: a.length, costo, venta, ganancia: venta - costo };
  };
  return [by('UYU'), by('USD')].filter((x) => x.equipos);
}

// Deudores: Nombre | A pagar | Modelo de Celular   ·   Caja: encabezados en fila 1, valores en fila 2
async function debts() {
  const rows = (await readTab(process.env.TAB_DEUDORES || 'Deudores')).filter((r) => r[0]);
  const list = rows.map((r) => {
    const detalle = String(r[2] || '').trim();
    const grupo = /iphone|samsung|macbook/i.test(detalle) ? 'Equipos'
      : /pr[eé]stamo|inversi/i.test(detalle) ? 'Préstamos e inversión' : 'Otros';
    return { nombre: String(r[0]).trim(), monto: num(r[1]) || 0, detalle, grupo };
  }).sort((a, b) => b.monto - a.monto);
  const grupos = {};
  list.forEach((x) => { grupos[x.grupo] = grupos[x.grupo] || { total: 0, cantidad: 0 }; grupos[x.grupo].total += x.monto; grupos[x.grupo].cantidad += 1; });
  return { total: list.reduce((s, x) => s + x.monto, 0), grupos, list };
}

async function cash() {
  const rows = await readTab(process.env.TAB_CAJA || 'Caja');
  // readTab descarta el encabezado, así que leemos los nombres fijos de la hoja original
  const names = ['Préstamos', 'Publicidad', 'Gastos P', 'Ganancias', 'Invertido', 'Facturación'];
  const vals = rows[0] || [];
  return names.map((n, i) => ({ concepto: n, importe: num(vals[i]) })).filter((x) => x.importe !== null);
}

module.exports = { salesStats, stockValue, debts, cash };

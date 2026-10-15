(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 0 });
  const money = (n, cur = 'UYU') => (cur === 'USD' ? 'US$ ' : '$ ') + nf.format(n);
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const TABS = [['resumen', 'Resumen'], ['fotos', 'Fotos'], ['cobrar', 'Cuentas a cobrar'], ['ajustes', 'Ajustes']];
  let tab = 'resumen', month = '';

  async function api(url, opts) {
    const r = await fetch(url, opts);
    if (r.status === 401) { showLogin(); throw new Error('401'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Error');
    return j;
  }
  const showLogin = () => { $('#app').classList.add('hide'); $('#login').classList.remove('hide'); };
  const showApp = () => { $('#login').classList.add('hide'); $('#app').classList.remove('hide'); drawTabs(); load(); };

  $('#go').onclick = async () => {
    try { await api('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#pw').value }) }); $('#pw').value = ''; showApp(); }
    catch (e) { $('#loginMsg').textContent = e.message; }
  };
  $('#pw').onkeydown = (e) => { if (e.key === 'Enter') $('#go').click(); };
  $('#logout').onclick = async () => { await fetch('/api/admin/logout', { method: 'POST' }); showLogin(); };

  function drawTabs() {
    $('#tabs').innerHTML = TABS.map(([k, l]) => `<button class="tab ${tab === k ? 'on' : ''}" data-t="${k}">${l}</button>`).join('');
    document.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { tab = b.dataset.t; drawTabs(); load(); }));
  }

  const kpi = (l, v, s) => `<div class="k"><span>${l}</span><b>${v}</b>${s ? `<small>${s}</small>` : ''}</div>`;

  async function resumen() {
    const { sales: s, stock } = await api('/api/admin/stats' + (month ? `?month=${month}` : ''));
    month = s.month; const k = s.kpis; const max = Math.max(1, ...s.byDay.map((d) => d.unidades));
    const [y, m] = s.month.split('-');
    $('#view').innerHTML = `
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><h2 style="margin:20px 0">${MESES[m - 1]} ${y}</h2>
      <select class="in" id="mSel" aria-label="Mes">${s.months.map((x) => `<option ${x === s.month ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div class="kpis">${kpi('Equipos vendidos', k.unidades, `Promedio ${k.promedioDiario.toFixed(1).replace('.', ',')} por día`)}
        ${kpi('Facturado', money(k.facturado), `Ticket medio ${money(k.ticketMedio)}`)}
        ${kpi('Ganancia en equipos', money(k.ganancia), `Margen ${Math.round(k.margen * 100)}%`)}
        ${kpi('Préstamos e intereses', money(k.financieroGanancia), `${k.financieroMovimientos} movimientos`)}</div>
      <div class="two" style="margin-top:20px">
        <div class="box"><h3>Equipos vendidos por día</h3><div class="bars">${s.byDay.map((d) => `<div class="bar"><span>${d.unidades || ''}</span><i style="height:${Math.round((d.unidades / max) * 150)}px"></i><span>${d.dia}</span></div>`).join('')}</div></div>
        <div class="box"><h3>Modelos que más salen</h3><table class="tbl"><tr><th>Modelo</th><th class="n">Unid.</th><th class="n">Facturado</th><th class="n">Ganancia</th></tr>
        ${s.byModel.map((x) => `<tr><td>${esc(x.modelo)}</td><td class="n">${x.unidades}</td><td class="n">${money(x.facturado)}</td><td class="n">${money(x.ganancia)}</td></tr>`).join('')}</table></div></div>
      <h2>Stock actual</h2><p class="sub">Calculado sumando los equipos de tus hojas de stock.</p>
      <div class="kpis">${stock.map((x) => kpi(`Stock en ${x.moneda} · ${x.equipos} equipos`, money(x.venta, x.moneda), `Invertido ${money(x.costo, x.moneda)} · ganancia potencial ${money(x.ganancia, x.moneda)}`)).join('')}</div>`;
    $('#mSel').onchange = (e) => { month = e.target.value; resumen(); };
  }

  async function fotos() {
    const slots = await api('/api/admin/photo-slots');
    const sin = slots.filter((s) => !s.fotos.length).length;
    $('#view').innerHTML = `<h2 style="margin:20px 0 6px">Fotos de tu stock</h2><p class="sub">La web toma los modelos y precios de tu planilla. Subí una foto por modelo y color: se usa en todos los equipos iguales. ${sin ? `Faltan fotos en ${sin} de ${slots.length}.` : 'Todos tienen foto.'}</p><p class="msg" id="fMsg"></p>
      <div class="slots">${slots.map((s) => `<div class="box slot"><div class="thumb">${s.fotos[0] ? `<img src="${esc(s.fotos[0])}" alt="">` : 'Sin foto'}</div>
        <div style="flex:1;min-width:160px"><b>${esc(s.modelo)}</b><p class="sub" style="margin:4px 0 10px">${esc([s.gb, s.color].filter(Boolean).join(' · '))} · ${s.equipos} ${s.equipos > 1 ? 'equipos' : 'equipo'}</p>
        <label class="up">${s.fotos.length ? 'Agregar fotos' : 'Subir foto'}<input type="file" accept="image/*" multiple data-up="${esc(s.key)}"></label>
        <div class="thumbs">${s.fotos.map((f) => `<div><img src="${esc(f)}" alt=""><button title="Borrar" aria-label="Borrar foto" data-del="${esc(f)}">×</button></div>`).join('')}</div></div></div>`).join('')}</div>`;
    document.querySelectorAll('[data-up]').forEach((i) => (i.onchange = async () => {
      if (!i.files.length) return; $('#fMsg').textContent = 'Subiendo…';
      const fd = new FormData(); [...i.files].slice(0, 6).forEach((f) => fd.append('photos', f));
      try { await api(`/api/admin/photos/${i.dataset.up}`, { method: 'POST', body: fd }); fotos(); } catch (e) { $('#fMsg').textContent = e.message; }
    }));
    document.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
      if (!confirm('¿Borrar esta foto?')) return;
      const [, , key, file] = b.dataset.del.split('/'); await api(`/api/admin/photos/${key}/${file}`, { method: 'DELETE' }); fotos();
    }));
  }

  async function cobrar() {
    const { debts: d, cash } = await api('/api/admin/debts');
    $('#view').innerHTML = `<h2 style="margin:20px 0 6px">Cuentas a cobrar</h2><p class="sub">Desde tu hoja Deudores. Importes en pesos.</p>
      <div class="kpis">${kpi('Total a cobrar', money(d.total))}${Object.entries(d.grupos).map(([g, v]) => kpi(g, money(v.total), `${v.cantidad} ${v.cantidad > 1 ? 'personas' : 'persona'}`)).join('')}</div>
      <div class="two" style="margin-top:20px"><div class="box"><h3>Saldos</h3><table class="tbl"><tr><th>Nombre</th><th>Detalle</th><th class="n">A pagar</th></tr>
      ${d.list.map((x) => `<tr><td>${esc(x.nombre)}</td><td>${esc(x.detalle)}</td><td class="n">${money(x.monto)}</td></tr>`).join('')}</table></div>
      <div class="box"><h3>Caja</h3><table class="tbl"><tr><th>Concepto</th><th class="n">Importe</th></tr>${cash.map((x) => `<tr><td>${esc(x.concepto)}</td><td class="n">${x.importe < 0 ? '- ' : ''}${money(Math.abs(x.importe))}</td></tr>`).join('')}</table>
      <p class="sub" style="margin-top:14px">Valores tal cual figuran en tu hoja Caja.</p></div></div>`;
  }

  async function ajustes() {
    const [st, r] = await Promise.all([api('/api/admin/settings'), fetch('/api/rate').then((x) => x.json())]);
    $('#view').innerHTML = `<h2 style="margin:20px 0 6px">Ajustes</h2><div class="box" style="max-width:520px"><h3>Cotización del dólar</h3>
      <p class="sub">Ahora la web usa $ ${r.rate.toFixed(2).replace('.', ',')} (${r.source}). Si querés fijar tu propia cotización, cargala acá. Dejalo vacío para volver al valor automático.</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap"><input class="in" id="rate" inputmode="decimal" placeholder="Ej: 40,50" value="${st.rateOverride || ''}" aria-label="Cotización manual"><button class="btn" id="saveRate">Guardar</button></div><p class="msg" id="sMsg"></p></div>`;
    $('#saveRate').onclick = async () => {
      const v = parseFloat($('#rate').value.replace(',', '.'));
      await api('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rateOverride: v || null }) });
      $('#sMsg').textContent = 'Guardado.'; setTimeout(ajustes, 800);
    };
  }

  const load = () => ({ resumen, fotos, cobrar, ajustes }[tab]().catch((e) => { if (e.message !== '401') $('#view').innerHTML = `<p class="msg">No se pudo cargar: ${esc(e.message)}</p>`; }));
  fetch('/api/admin/me').then((r) => r.json()).then((j) => (j.admin ? showApp() : showLogin()));
})();

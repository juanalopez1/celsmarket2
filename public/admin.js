(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let toastT;
  function toast(text, kind = 'info', sticky = false) {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
    el.className = 'toast ' + kind; el.textContent = text; clearTimeout(toastT);
    if (!sticky) toastT = setTimeout(() => el.remove(), 4500);
  }
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

  const pc = (x) => `${Math.round((x || 0) * 100)}%`;
  const delta = (v) => (v == null ? '' : `<span class="${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+' : ''}${Math.round(v * 100)}%</span>`);
  const DIA = { Lunes: 'Lun', Martes: 'Mar', 'Miércoles': 'Mié', Jueves: 'Jue', Viernes: 'Vie', 'Sábado': 'Sáb', Domingo: 'Dom' };
  const hl = (label, o, line) => `<div class="k hl"><span>${label}</span>${o ? `<b>${esc(o.modelo)}</b><small>${line(o)}</small>` : '<b>—</b><small>Todavía no hay datos suficientes.</small>'}</div>`;
  const bars = (list, key, label, topIdx) => { const max = Math.max(1, ...list.map((d) => d[key])); return `<div class="bars">${list.map((d, i) => `<div class="bar ${i === topIdx ? 'top' : ''}"><span>${d[key] || ''}</span><i style="height:${Math.round((d[key] / max) * 150)}px"></i><span>${label(d)}</span></div>`).join('')}</div>`; };

  async function resumen() {
    const { sales: s, stock } = await api('/api/admin/stats' + (month ? `?month=${month}` : ''));
    month = s.month; const k = s.kpis, h = s.highlights, mes = MESES[Number(s.month.split('-')[1]) - 1];
    const [y] = s.month.split('-');

    // frases con datos reales para decidir qué hacer
    const tips = [];
    if (s.proyeccion) tips.push(`A este ritmo cerrás ${mes} con <b>${money(s.proyeccion.facturado)}</b> facturados y <b>${money(s.proyeccion.ganancia)}</b> de ganancia (${s.proyeccion.unidades} equipos).${s.anterior ? ` Eso es ${delta(s.anterior.vsGanancia)} en ganancia y ${delta(s.anterior.vsFacturado)} en ventas frente a ${MESES[Number(s.anterior.month.split('-')[1]) - 1]}.` : ''}`);
    else if (s.anterior) tips.push(`Frente a ${MESES[Number(s.anterior.month.split('-')[1]) - 1]}: ${delta(s.anterior.vsGanancia)} en ganancia y ${delta(s.anterior.vsFacturado)} en ventas.`);
    if (s.mejorDia) tips.push(`Tu mejor día de la semana es el <b>${s.mejorDia.dia.toLowerCase()}</b>: ${s.mejorDia.unidades} equipos (${pc(s.mejorDia.unidades / (k.unidades || 1))} de lo vendido).`);
    if (h.masVentas && k.margen && h.masVentas.margen < k.margen) tips.push(`El <b>${esc(h.masVentas.modelo)}</b> es el que más factura (${pc(h.masVentas.pctVentas)} de las ventas) pero deja ${pc(h.masVentas.margen)} de margen, menos que tu promedio de ${pc(k.margen)}. Revisá su precio de compra o de venta.`);
    if (h.mejorMargen && h.masVendido && h.mejorMargen.modelo !== h.masVendido.modelo) tips.push(`El <b>${esc(h.mejorMargen.modelo)}</b> es el que mejor margen deja (${pc(h.mejorMargen.margen)}). Si podés conseguir más, te conviene empujarlo.`);
    if (s.reponer.length) tips.push(`Se venden y no tenés en stock: <b>${s.reponer.map((x) => esc(x.modelo)).join(', ')}</b>. Son candidatos para reponer primero.`);
    const parado = {}; s.inmovilizado.forEach((x) => x.capital.forEach((c) => { parado[c.moneda] = (parado[c.moneda] || 0) + c.monto; }));
    if (s.inmovilizado.length) tips.push(`Tenés <b>${Object.entries(parado).map(([m, v]) => money(v, m)).join(' + ')}</b> invertidos en modelos que no vendieron nada en ${mes}.`);

    $('#view').innerHTML = `
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-top:32px"><h2 style="margin:0">${mes[0].toUpperCase() + mes.slice(1)} ${y}</h2>
        <select class="in" id="mSel" aria-label="Mes">${s.months.map((x) => `<option value="${x}" ${x === s.month ? 'selected' : ''}>${MESES[Number(x.split('-')[1]) - 1][0].toUpperCase() + MESES[Number(x.split('-')[1]) - 1].slice(1)} ${x.split('-')[0]}</option>`).join('')}</select></div>
      <p class="sub" style="margin-top:8px">${s.current ? `Van ${s.dias} de ${s.diasMes} días del mes. ` : ''}Importes en pesos uruguayos.</p>
      <div class="kpis">${kpi('Equipos vendidos', k.unidades, `Promedio ${k.promedioDiario.toFixed(1).replace('.', ',')} por día`)}
        ${kpi('Facturado', money(k.facturado), `Ticket medio ${money(k.ticketMedio)}`)}
        ${kpi('Ganancia en equipos', money(k.ganancia), `Margen ${pc(k.margen)}`)}
        ${kpi('Préstamos e intereses', money(k.financieroGanancia), `${k.financieroMovimientos} movimientos`)}</div>

      ${tips.length ? `<div class="box gap"><h3>Para hacer más plata</h3><p class="sub">Lo que dicen tus números este mes.</p><ul class="insights">${tips.map((t) => `<li>${t}</li>`).join('')}</ul></div>` : ''}

      <h2>Qué modelos te convienen</h2><p class="sub">Los que más se venden y los que más plata te dejan.</p>
      <div class="kpis hlg">
        ${hl('Más vendido', h.masVendido, (o) => `<em>${o.unidades}</em> equipos · ${pc(o.pctUnidades)} de las unidades`)}
        ${hl('Más facturó', h.masVentas, (o) => `<em>${money(o.facturado)}</em> · ${pc(o.pctVentas)} de las ventas`)}
        ${hl('Dejó más plata', h.masGanancia, (o) => `<em>${money(o.ganancia)}</em> de ganancia · ${pc(o.pctGanancia)} del total`)}
        ${hl('Mejor margen', h.mejorMargen, (o) => `<em>${pc(o.margen)}</em> de margen · ${o.unidades} vendidos`)}
        ${hl('Más ganancia por equipo', h.mejorPorUnidad, (o) => `<em>${money(o.gananciaUnidad)}</em> por equipo · ${o.unidades} vendidos`)}
      </div>

      <div class="two gap">
        <div class="box"><h3>Equipos vendidos por día</h3>${bars(s.byDay, 'unidades', (d) => d.dia, -1)}</div>
        <div class="box"><h3>Por día de la semana</h3>${bars(s.byWeekday, 'unidades', (d) => DIA[d.dia], s.mejorDia ? s.byWeekday.findIndex((d) => d.dia === s.mejorDia.dia) : -1)}</div>
      </div>

      <div class="box gap"><h3>Todos los modelos</h3><p class="sub">Qué parte de las ventas y de la ganancia aporta cada uno.</p>
        <div class="scroll"><table class="tbl"><thead><tr><th>Modelo</th><th class="n">Equipos</th><th class="n">Facturado</th><th class="n">% de ventas</th><th class="n">Ganancia</th><th class="n">% de ganancia</th><th class="n">Margen</th></tr></thead><tbody>
        ${s.byModel.map((x) => `<tr><td>${esc(x.modelo)}</td><td class="n">${x.unidades}</td><td class="n">${money(x.facturado)}</td><td class="n"><span class="meter"><i style="width:${Math.round(x.pctVentas * 100)}%"></i></span>${pc(x.pctVentas)}</td><td class="n">${money(x.ganancia)}</td><td class="n"><span class="meter"><i style="width:${Math.round(x.pctGanancia * 100)}%"></i></span>${pc(x.pctGanancia)}</td><td class="n">${pc(x.margen)}</td></tr>`).join('')}</tbody></table></div></div>

      <div class="two gap">
        <div class="box"><h3>Se vende y no tenés</h3><p class="sub">Modelos con 2 o más ventas este mes y ninguno en stock. Si todavía no cargaste la hoja Stock Sellados, puede aparecer alguno que sí tenés.</p>
          ${s.reponer.length ? `<table class="tbl sm"><tbody>${s.reponer.map((x) => `<tr><td>${esc(x.modelo)}</td><td class="n">${x.unidades} vendidos</td><td class="n">${money(x.gananciaUnidad)} por equipo</td></tr>`).join('')}</tbody></table>` : '<p class="sub" style="margin:0">Todo lo que se vende lo tenés en stock.</p>'}</div>
        <div class="box"><h3>Plata parada</h3><p class="sub">Modelos en stock que no vendieron nada este mes, con lo que invertiste en ellos.</p>
          ${s.inmovilizado.length ? `<table class="tbl sm"><tbody>${s.inmovilizado.map((x) => `<tr><td>${esc(x.modelo)}</td><td class="n">${x.equipos} ${x.equipos > 1 ? 'equipos' : 'equipo'}</td><td class="n">${x.capital.map((c) => money(c.monto, c.moneda)).join(' + ')}</td></tr>`).join('')}</tbody></table>` : '<p class="sub" style="margin:0">Todo tu stock tuvo ventas este mes.</p>'}</div>
      </div>

      <h2>Stock actual</h2><p class="sub">Calculado sumando los equipos de tus hojas de stock.</p>
      <div class="kpis">${stock.map((x) => kpi(`Stock en ${x.moneda} · ${x.equipos} equipos`, money(x.venta, x.moneda), `Invertido ${money(x.costo, x.moneda)} · ganancia potencial ${money(x.ganancia, x.moneda)}`)).join('')}</div>`;
    $('#mSel').onchange = (e) => { month = e.target.value; resumen(); };
  }

  async function fotos() {
    const slots = await api('/api/admin/photo-slots');
    const sin = slots.filter((s) => !s.fotos.length).length;
    $('#view').innerHTML = `<h2 class="first">Fotos de tu stock</h2><p class="sub">La web toma los modelos y precios de tu planilla. Subí una foto por modelo y color: se usa en todos los equipos iguales. ${sin ? `Faltan fotos en ${sin} de ${slots.length}.` : 'Todos tienen foto.'}</p><p class="msg" id="fMsg"></p>
      <div class="slots">${slots.map((s) => `<div class="box slot"><div class="thumb">${s.fotos[0] ? `<img src="${esc(s.fotos[0].url)}" alt="">` : 'Sin foto'}</div>
        <div style="flex:1;min-width:160px"><b>${esc(s.modelo)}</b><p class="sub" style="margin:4px 0 10px">${esc([s.gb, s.color].filter(Boolean).join(' · '))} · ${s.equipos} ${s.equipos > 1 ? 'equipos' : 'equipo'}</p>
        <label class="up">${s.fotos.length ? 'Agregar fotos' : 'Subir foto'}<input type="file" accept="image/*" multiple data-up="${esc(s.key)}"></label>
        <div class="thumbs">${s.fotos.map((f) => `<div><img src="${esc(f.url)}" alt=""><button title="Borrar" aria-label="Borrar foto" data-del="${esc(f.id)}">×</button></div>`).join('')}</div></div></div>`).join('')}</div>`;
    document.querySelectorAll('[data-up]').forEach((i) => (i.onchange = async () => {
      const files = [...i.files].filter((f) => f.type.startsWith('image/'));
      i.value = '';
      if (!files.length) return toast('Elegí una imagen (JPG, PNG o similar).', 'err');
      if (files.some((f) => f.size > 12 * 1024 * 1024)) return toast('Cada foto puede pesar hasta 12 MB.', 'err');
      const n = Math.min(files.length, 6), card = i.closest('.slot');
      card.classList.add('busy');
      toast(`Subiendo ${n} ${n > 1 ? 'fotos' : 'foto'}…`, 'info', true);
      const fd = new FormData(); files.slice(0, 6).forEach((f) => fd.append('photos', f));
      try {
        const r = await api(`/api/admin/photos/${i.dataset.up}`, { method: 'POST', body: fd });
        await fotos();
        toast(`✓ ${r.saved.length > 1 ? r.saved.length + ' fotos subidas' : 'Foto subida'}. Ya se ve en el catálogo.`, 'ok');
      } catch (e) { card.classList.remove('busy'); if (e.message !== '401') toast(e.message, 'err'); }
    }));
    document.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
      if (!confirm('¿Borrar esta foto? Va a dejar de verse en el catálogo.')) return;
      b.disabled = true; toast('Borrando foto…', 'info', true);
      try {
        await api(`/api/admin/photos?public_id=${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' });
        await fotos();
        toast('✓ Foto borrada. Ya no se ve en el catálogo.', 'ok');
      } catch (e) { b.disabled = false; if (e.message !== '401') toast(e.message, 'err'); }
    }));
  }

  async function cobrar() {
    const { debts: d, cash } = await api('/api/admin/debts');
    $('#view').innerHTML = `<h2 class="first">Cuentas a cobrar</h2><p class="sub">Desde tu hoja Deudores. Importes en pesos.</p>
      <div class="kpis">${kpi('Total a cobrar', money(d.total))}${Object.entries(d.grupos).map(([g, v]) => kpi(g, money(v.total), `${v.cantidad} ${v.cantidad > 1 ? 'personas' : 'persona'}`)).join('')}</div>
      <div class="two gap"><div class="box"><h3>Saldos</h3><table class="tbl"><tr><th>Nombre</th><th>Detalle</th><th class="n">A pagar</th></tr>
      ${d.list.map((x) => `<tr><td>${esc(x.nombre)}</td><td>${esc(x.detalle)}</td><td class="n">${money(x.monto)}</td></tr>`).join('')}</table></div>
      <div class="box"><h3>Caja</h3><table class="tbl"><tr><th>Concepto</th><th class="n">Importe</th></tr>${cash.map((x) => `<tr><td>${esc(x.concepto)}</td><td class="n">${x.importe < 0 ? '- ' : ''}${money(Math.abs(x.importe))}</td></tr>`).join('')}</table>
      <p class="sub" style="margin-top:14px">Valores tal cual figuran en tu hoja Caja.</p></div></div>`;
  }

  async function ajustes() {
    const [st, r] = await Promise.all([api('/api/admin/settings'), fetch('/api/rate').then((x) => x.json())]);
    $('#view').innerHTML = `<h2 class="first">Ajustes</h2><div class="box" style="max-width:520px"><h3>Cotización del dólar</h3>
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

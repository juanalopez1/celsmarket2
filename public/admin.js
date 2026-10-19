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
  const TABS = [['resumen', 'Resumen'], ['venta', 'Registrar venta'], ['fotos', 'Fotos'], ['cobrar', 'Cuentas a cobrar'], ['ajustes', 'Ajustes']];
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

  const hintFor = (m) => {
    m = String(m || '');
    if (/403|PERMISSION|permission/i.test(m)) return 'La planilla no está compartida con la cuenta de servicio. Compartila con ese email como lector.';
    if (/not been used|disabled|SERVICE_DISABLED/i.test(m)) return 'Falta activar la Google Sheets API en el proyecto de Google Cloud.';
    if (/Unable to parse range|not found|404/i.test(m)) return 'El nombre de la pestaña no coincide con el de la planilla, o el SHEET_ID es incorrecto.';
    if (/not supported for this document/i.test(m)) return 'Es un Excel (.xlsx) subido a Drive. Abrilo y usá Archivo → Guardar como Google Sheets.';
    if (/invalid_grant|JWT|Invalid/i.test(m)) return 'La clave de la cuenta de servicio es inválida o está mal pegada.';
    if (/JSON|Unexpected|Falta GOOGLE/i.test(m)) return 'El secreto GOOGLE_SERVICE_ACCOUNT_JSON está vacío o no es un JSON válido.';
    return '';
  };
  async function diagnostico() {
    const box = $('#diagOut'); box.innerHTML = '<p class="sub" style="margin:12px 0 0">Revisando…</p>';
    try {
      const d = await api('/api/admin/diagnostico');
      const falta = Object.entries(d.secretos).filter(([, v]) => !v).map(([k]) => k);
      const filas = [];
      filas.push(`<tr><td>Claves cargadas</td><td class="n ${falta.length ? 'neg' : 'pos'}">${falta.length ? 'Faltan: ' + esc(falta.join(', ')) : 'Todas'}</td></tr>`);
      filas.push(`<tr><td>Acceso a Google</td><td class="n ${d.google === 'ok' ? 'pos' : 'neg'}">${d.google === 'ok' ? 'Conectado' : esc(d.google)}</td></tr>`);
      (d.pestanas || []).forEach((p) => filas.push(`<tr><td>Pestaña “${esc(p.tab)}”</td><td class="n ${p.error ? 'neg' : 'pos'}">${p.error ? esc(p.error) : p.filas + ' filas'}</td></tr>`));
      const hints = [d.google !== 'ok' ? hintFor(d.google) : '', ...(d.pestanas || []).map((p) => (p.error ? hintFor(p.error) : ''))].filter(Boolean);
      box.innerHTML = `<div class="scroll"><table class="tbl sm" style="margin-top:12px"><tbody>${filas.join('')}</tbody></table></div>
        ${d.cuenta ? `<p class="sub" style="margin:12px 0 0;font-size:14px">Cuenta de servicio: <b>${esc(d.cuenta)}</b>. La planilla tiene que estar compartida con este email.</p>` : ''}
        ${[...new Set(hints)].map((h) => `<div class="note">${esc(h)}</div>`).join('')}`;
    } catch (e) { if (e.message !== '401') box.innerHTML = `<div class="note">${esc(e.message)}</div>`; }
  }

  /* ---------- ventana emergente y utilidades de formularios ---------- */
  function modal(html) {
    const el = document.createElement('div'); el.className = 'modal'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<div class="box">${html}</div>`;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
    document.addEventListener('keydown', onKey); document.body.appendChild(el);
    const f = el.querySelector('input,select,button'); if (f) f.focus();
    return { el, close };
  }
  const uyToday = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const dmy = (iso) => { const [y, m, d] = (iso || uyToday()).split('-').map(Number); return `${d}/${m}/${y}`; };
  const rid = () => (crypto.randomUUID ? crypto.randomUUID() : `r-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const post = (url, body) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  /* ---------- registrar venta ---------- */
  async function venta() {
    const [rows, rate] = await Promise.all([api('/api/admin/stock-rows'), fetch('/api/rate').then((x) => x.json())]);
    $('#view').innerHTML = `<h2 class="first">Registrar venta</h2>
      <p class="sub">Elegí el equipo que vendiste. Se agrega a la hoja Ventas con tu formato y se quita del stock.</p>
      <input class="in" id="vq" type="search" placeholder="Buscar modelo, color…" aria-label="Buscar equipo" style="width:100%;max-width:420px;margin-bottom:16px">
      <div class="box"><div class="scroll"><table class="tbl"><thead><tr><th>Equipo</th><th>Batería</th><th class="n">Precio</th><th></th></tr></thead><tbody id="vb"></tbody></table></div></div>`;
    const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const draw = () => {
      const toks = norm($('#vq').value).split(/\s+/).filter(Boolean);
      const list = rows.map((x, i) => ({ x, i })).filter(({ x }) => toks.every((t) => norm([x.modelo, x.gb, x.color, x.estado, x.detalle].join(' ')).includes(t)));
      $('#vb').innerHTML = list.length ? list.map(({ x, i }) => `<tr><td><b>${esc(x.modelo)}</b> ${esc(x.gb)} · ${esc(x.color)}${x.estado === 'Sellado' ? ' <span class="pill sm">Sellado</span>' : ''}</td><td>${esc(x.bateria || '—')}</td><td class="n">${money(x.precio, x.moneda)}</td><td class="n"><button class="btn alt sm" data-sell="${i}">Vender</button></td></tr>`).join('')
        : '<tr><td colspan="4" class="sub" style="padding:18px 6px">No hay equipos con esa búsqueda.</td></tr>';
      document.querySelectorAll('[data-sell]').forEach((b) => (b.onclick = () => vender(rows[b.dataset.sell], rate.rate)));
    };
    $('#vq').oninput = draw; draw();
  }

  function vender(x, rate) {
    const usd = x.moneda === 'USD';
    const sugerido = usd ? Math.round((x.precio * rate) / 100) * 100 : x.precio;
    const costo = Math.round((x.costo || 0) * (usd ? rate : 1));
    const { el, close } = modal(`<h3>Registrar venta</h3>
      <p class="sub" style="margin:6px 0 0;font-size:16px"><b style="color:var(--text)">${esc(x.modelo)} ${esc(x.gb)} · ${esc(x.color)}</b>${x.bateria ? ` · batería ${esc(x.bateria)}` : ''}</p>
      <label class="fld">Precio de venta (en pesos)<input class="in" id="vPrecio" inputmode="numeric" value="${sugerido}"></label>
      ${usd ? `<p class="fh">Está publicado en US$ ${nf.format(x.precio)}. La hoja Ventas es en pesos, así que lo pasé a $ ${nf.format(sugerido)} (dólar a $ ${rate.toFixed(2).replace('.', ',')}). Podés cambiarlo.</p>` : ''}
      <label class="fld">Fecha<input class="in" id="vFecha" type="date" value="${uyToday()}"></label>
      <p class="sub" id="vGan" style="margin:16px 0 0;font-size:15px"></p>
      <div class="actions"><button class="btn" id="vOk">Registrar venta</button><button class="btn alt" id="vNo">Cancelar</button></div>`);
    const q = (s) => el.querySelector(s), val = () => Number(String(q('#vPrecio').value).replace(/\D/g, ''));
    const upd = () => { const g = val() - costo; q('#vGan').innerHTML = val() > 0 ? `Ganancia estimada: <b class="${g >= 0 ? 'pos' : 'neg'}">${money(g)}</b> <span style="opacity:.7">(costo ${money(costo)})</span>` : ''; };
    q('#vPrecio').oninput = upd; upd();
    q('#vNo').onclick = close;
    q('#vOk').onclick = async () => {
      if (!(val() > 0)) return toast('Poné el precio de venta.', 'err');
      const btn = q('#vOk'); btn.disabled = true; toast('Registrando la venta…', 'info', true);
      try {
        const r = await post('/api/admin/venta', { reqId: rid(), tab: x.tab, fila: x.fila, esperado: { modelo: x.modelo, gb: x.gb, color: x.color }, precioVenta: val(), fecha: dmy(q('#vFecha').value) });
        close();
        if (r.aviso) { toast(r.aviso, 'err'); alert(r.aviso); } else toast(`✓ Venta registrada: ${r.venta.nombre} · ${money(r.venta.precioVenta)} · ganancia ${money(r.venta.ganancia)}`, 'ok');
        await venta();
      } catch (e) {
        btn.disabled = false;
        if (e.message === '401') return;
        toast(e.message, 'err');
        if (/cambió/.test(e.message)) { close(); venta(); }
      }
    };
  }

  /* ---------- mes nuevo ---------- */
  function wirePlanilla(pl) {
    $('#mesNuevo').onclick = () => {
      const d = new Date(Date.now() - 3 * 3600e3); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
      const { el, close } = modal(`<h3>Crear mes nuevo</h3>
        <p class="sub" style="margin:6px 0 0;font-size:15px">Se crea una planilla nueva con las mismas pestañas y formato que la actual. La hoja Ventas queda vacía y la web y el panel pasan a usar la nueva. Los meses anteriores se siguen sumando en las estadísticas.</p>
        <label class="fld">Mes<input class="in" id="mMes" type="month" value="${d.toISOString().slice(0, 7)}"></label>
        <label class="fld">Email de Google del dueño<input class="in" id="mMail" type="email" placeholder="nombre@gmail.com" value="${esc(pl.email)}"></label>
        <p class="fh">Ahí se comparte la planilla nueva para que puedas abrirla y editarla.</p>
        <div class="chk"><label><input type="checkbox" id="mStock" checked> Pasar el stock actual</label><label><input type="checkbox" id="mDeu" checked> Pasar los deudores</label><label><input type="checkbox" id="mCaja"> Pasar la caja</label></div>
        <div class="actions"><button class="btn" id="mOk">Crear y usar</button><button class="btn alt" id="mNo">Cancelar</button></div>`);
      const q = (s) => el.querySelector(s);
      q('#mNo').onclick = close;
      q('#mOk').onclick = async () => {
        if (!q('#mMes').value) return toast('Elegí el mes.', 'err');
        if (!/^\S+@\S+\.\S+$/.test(q('#mMail').value.trim())) return toast('Poné el email de Google del dueño.', 'err');
        const mail = q('#mMail').value.trim(), btn = q('#mOk'); btn.disabled = true; toast('Creando la planilla… puede tardar unos segundos.', 'info', true);
        try {
          const r = await post('/api/admin/planilla/nuevo', { reqId: rid(), mes: q('#mMes').value, email: q('#mMail').value.trim(), pasar: { stock: q('#mStock').checked, deudores: q('#mDeu').checked, caja: q('#mCaja').checked } });
          close(); toast('✓ Planilla creada.', 'ok');
          const done = modal(`<h3>Listo, ya estás en ${esc(r.planilla.nombre)}</h3>
            <p class="sub" style="margin:8px 0 0;font-size:15px">La web y el panel ya leen de la planilla nueva. Te la compartimos a <b>${esc(mail)}</b> para que puedas abrirla y editarla.</p>
            <p style="margin-top:14px"><a class="lnk" href="${esc(r.planilla.url)}" target="_blank" rel="noopener">Abrir la planilla nueva</a></p>
            <div class="note">Acordate de actualizar la hoja <b>Resumen</b> (Total mes pasado y Pronóstico), que se copia tal cual estaba.</div>
            <div class="actions"><button class="btn" id="dOk">Entendido</button></div>`);
          done.el.querySelector('#dOk').onclick = () => { done.close(); ajustes(); };
        } catch (e) { btn.disabled = false; if (e.message !== '401') toast(e.message, 'err'); }
      };
    };
    document.querySelectorAll('[data-act]').forEach((b) => (b.onclick = async () => {
      if (!confirm('¿Volver a usar esta planilla? La web y el panel van a leer de ahí.')) return;
      b.disabled = true;
      try { await post('/api/admin/planilla/activar', { id: b.dataset.act }); toast('✓ Planilla cambiada.', 'ok'); await ajustes(); }
      catch (e) { b.disabled = false; if (e.message !== '401') toast(e.message, 'err'); }
    }));
  }

  async function ajustes() {
    const [st, r, pl] = await Promise.all([api('/api/admin/settings'), fetch('/api/rate').then((x) => x.json()), api('/api/admin/planilla').catch(() => null)]);
    const planillaBox = pl ? `<div class="box gap" style="max-width:720px"><h3>Planilla del mes</h3><p class="sub">Planilla activa: <b style="color:var(--text)">${esc(pl.activa.nombre || 'sin nombre')}</b> · <a class="lnk" href="${esc(pl.activa.url)}" target="_blank" rel="noopener">Abrir</a></p><button class="btn" id="mesNuevo">Crear mes nuevo</button>${pl.archivo.length ? `<p class="sub" style="margin:24px 0 6px;font-size:15px">Meses anteriores</p><table class="tbl sm"><tbody>${pl.archivo.map((x) => `<tr><td>${esc(x.nombre)}</td><td class="n"><a class="lnk" href="${esc(x.url)}" target="_blank" rel="noopener">Abrir</a></td><td class="n"><button class="btn alt sm" data-act="${esc(x.id)}">Usar de nuevo</button></td></tr>`).join('')}</tbody></table>` : ''}</div>` : '';
    $('#view').innerHTML = `<h2 class="first">Ajustes</h2><div class="box" style="max-width:520px"><h3>Cotización del dólar</h3>
      <p class="sub">Ahora la web usa $ ${r.rate.toFixed(2).replace('.', ',')} (${r.source}). Si querés fijar tu propia cotización, cargala acá. Dejalo vacío para volver al valor automático.</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap"><input class="in" id="rate" inputmode="decimal" placeholder="Ej: 40,50" value="${st.rateOverride || ''}" aria-label="Cotización manual"><button class="btn" id="saveRate">Guardar</button></div><p class="msg" id="sMsg"></p></div>
      ${planillaBox}
      <div class="box gap" style="max-width:720px"><h3>Conexión con Google Sheets</h3><p class="sub">Comprueba que la web puede leer tu planilla y te dice qué falta si algo no anda.</p><button class="btn alt" id="diag">Revisar conexión</button><div id="diagOut"></div></div>`;
    $('#diag').onclick = diagnostico;
    if (pl) wirePlanilla(pl);
    $('#saveRate').onclick = async () => {
      const v = parseFloat($('#rate').value.replace(',', '.'));
      await api('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rateOverride: v || null }) });
      $('#sMsg').textContent = 'Guardado.'; setTimeout(ajustes, 800);
    };
  }

  const load = () => ({ resumen, venta, fotos, cobrar, ajustes }[tab]().catch((e) => { if (e.message !== '401') $('#view').innerHTML = `<p class="msg">No se pudo cargar: ${esc(e.message)}</p>`; }));
  fetch('/api/admin/me').then((r) => r.json()).then((j) => (j.admin ? showApp() : showLogin()));
})();

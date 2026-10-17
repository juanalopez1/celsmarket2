(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const LIMIT = 4; // tarjetas visibles antes de "Ver todo"
  const state = { items: [], f: 'all', q: '', mdl: 'all', sort: 'rel', open: false, cur: 'USD', rate: 40, wa: '59891070450' };
  const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 0 });
  const wa = (text) => `https://wa.me/${state.wa}?text=${encodeURIComponent(text)}`;
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function priceNum(it) {
    if (it.moneda === state.cur) return it.precio;
    return it.moneda === 'USD' ? it.precio * state.rate : it.precio / state.rate;
  }
  function price(it) {
    let v = priceNum(it);
    if (it.moneda !== state.cur && state.cur === 'UYU') v = Math.round(v / 100) * 100;
    return (state.cur === 'USD' ? 'US$ ' : '$ ') + nf.format(v);
  }
  const isMac = (m) => /macbook/i.test(m);

  /* ---------- filtros ---------- */
  const TABS = [['all', 'Todos'], ['Sellado', 'Sellados'], ['Seminuevo', 'Seminuevos'], ['mac', 'MacBook']];
  const byTab = (it, f) => f === 'all' || (f === 'mac' ? isMac(it.modelo) : it.estado === f);
  function byQuery(it) {
    const toks = norm(state.q).split(/\s+/).filter(Boolean);
    if (!toks.length) return true;
    const hay = norm([it.modelo, it.gb, it.color, it.estado, it.detalle, it.bateria].join(' '));
    return toks.every((t) => hay.includes(t));
  }
  const filtersActive = () => state.f !== 'all' || state.q.trim() !== '' || state.mdl !== 'all' || state.sort !== 'rel';

  function renderTabs() {
    $('#tabs').innerHTML = TABS.map(([k, l]) => [k, l, state.items.filter((x) => byTab(x, k)).length])
      .filter(([k, , n]) => n > 0 || k === 'all')
      .map(([k, l, n]) => `<button class="tab ${state.f === k ? 'on' : ''}" role="tab" aria-selected="${state.f === k}" data-f="${esc(k)}">${esc(l)}<small>${n}</small></button>`).join('');
  }

  // Todos los modelos que hay en stock: iPhone del más nuevo al más viejo, MacBook al final
  function renderModels() {
    const num = (n) => Number((n.match(/iPhone (\d+)/) || [0, -1])[1]);
    const models = [...new Set(state.items.map((x) => x.modelo))].sort((a, b) => num(b) - num(a) || a.localeCompare(b));
    if (state.mdl !== 'all' && !models.includes(state.mdl)) state.mdl = 'all'; // ya no hay de ese modelo
    const sel = $('#mdl');
    sel.innerHTML = '<option value="all">Modelo: todos</option>' + models.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
    sel.value = state.mdl;
  }

  /* ---------- tarjetas ---------- */
  function card(it, i) {
    const specs = [it.gb, it.color, it.bateria ? `Batería ${it.bateria}` : ''].filter(Boolean).join(' · ');
    const name = `${it.modelo}${it.gb ? ' ' + it.gb : ''}${it.color ? ' ' + it.color : ''}`;
    const photo = it.fotos.length ? `<img src="${esc(it.fotos[0])}" alt="${esc(it.modelo + ' ' + it.color)}" loading="lazy">` : '<span class="noph">Foto próximamente</span>';
    const cnt = it.fotos.length > 1 ? `<span class="cnt">1/${it.fotos.length}</span>` : '';
    return `<article class="card" data-i="${i}"><div class="ph"><span class="tag">${esc(it.estado === 'Sellado' ? 'Sellado' : 'Seminuevo')}</span>${photo}${cnt}</div>
      <h3>${esc(it.modelo)}</h3><p class="sp">${esc(specs)}</p>
      ${it.detalle ? `<p class="sp">Detalle: ${esc(it.detalle)}</p>` : ''}
      ${it.cantidad > 1 ? `<p class="qty">${it.cantidad} disponibles</p>` : ''}
      <div class="row"><b>${price(it)}</b><a class="wa" href="${wa(`Hola! Me interesa el ${name} que vi en la web.`)}">Consultar</a></div></article>`;
  }

  function renderGrid() {
    let list = state.items.filter((x) => byTab(x, state.f) && byQuery(x) && (state.mdl === 'all' || x.modelo === state.mdl));
    if (state.sort !== 'rel') list = [...list].sort((a, b) => (state.sort === 'asc' ? 1 : -1) * (priceNum(a) - priceNum(b)));
    const total = list.length;
    const shown = state.open ? list : list.slice(0, LIMIT);
    state.view = shown;

    $('#grid').innerHTML = total ? shown.map(card).join('')
      : '<div class="empty"><p>No encontramos equipos con ese filtro. Escribinos por WhatsApp y te avisamos cuando entre uno.</p><button class="clear" data-clear>Limpiar filtros</button></div>';

    $('#count').textContent = !total ? '' : total > LIMIT && !state.open ? `Mostrando ${LIMIT} de ${total} equipos` : `${total} ${total > 1 ? 'equipos' : 'equipo'}`;
    $('#clear').hidden = !filtersActive();
    const more = $('#more');
    more.hidden = total <= LIMIT;
    $('#seeallTxt').textContent = state.open ? 'Ver menos' : `Ver todo (${total})`;
    $('#seeall').classList.toggle('open', state.open);
    $('#seeall').setAttribute('aria-expanded', String(state.open));

    document.querySelectorAll('[data-cur]').forEach((b) => b.classList.toggle('on', b.dataset.cur === state.cur));
    $('#rateNote').textContent = state.cur === 'UYU' ? `Los precios en dólares se muestran en pesos a $ ${state.rate.toFixed(2).replace('.', ',')} por dólar. Consultá la cotización del día.` : 'Precios en dólares.';
  }
  function render() { renderTabs(); renderModels(); renderGrid(); }

  function clearAll() {
    Object.assign(state, { f: 'all', q: '', mdl: 'all', sort: 'rel', open: false });
    $('#q').value = ''; $('#sort').value = 'rel';
    render();
  }

  /* ---------- varios ---------- */
  function links() {
    document.querySelectorAll('.wa-link').forEach((a) => { a.href = wa(a.dataset.msg || 'Hola! Vi la web de CelsMarket y quiero consultar.'); });
  }

  function calc() {
    const models = ['iPhone 11', 'iPhone 12', 'iPhone 13', 'iPhone 13 Pro', 'iPhone 14', 'iPhone 14 Pro', 'iPhone 14 Pro Max', 'iPhone 15', 'iPhone 15 Pro', 'iPhone 15 Pro Max', 'iPhone 16', 'iPhone 16 Pro', 'iPhone 16 Pro Max', 'iPhone 17 Pro', 'iPhone 17 Pro Max'];
    const bats = ['Más de 90%', '80% a 90%', '70% a 79%', 'Menos de 70%'];
    $('#cModel').innerHTML = models.map((m) => `<option>${m}</option>`).join('');
    $('#cBat').innerHTML = bats.map((m) => `<option>${m}</option>`).join('');
    const upd = () => { $('#cGo').href = wa(`Hola! Quiero cotizar el canje de mi ${$('#cModel').value} (batería ${$('#cBat').value}).`); };
    $('#cModel').onchange = upd; $('#cBat').onchange = upd; upd();
  }

  // Scroll suave solo hacia Stock (menú y botón "Ver stock")
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    const id = a && a.getAttribute('href');
    if (id !== '#stock') return;
    const t = document.querySelector(id);
    if (!t) return;
    e.preventDefault();
    t.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', id);
  });

  $('#q').addEventListener('input', (e) => { state.q = e.target.value; state.open = false; renderGrid(); });
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; renderGrid(); });
  $('#mdl').addEventListener('change', (e) => { state.mdl = e.target.value; state.open = false; renderGrid(); });
  $('#clear').addEventListener('click', clearAll);
  $('#seeall').addEventListener('click', () => {
    state.open = !state.open; renderGrid();
    if (!state.open) $('#stock').scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'start' }); // al cerrar, volvemos al inicio del stock
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-clear]')) { clearAll(); return; }
    const f = e.target.closest('[data-f]'); if (f) { state.f = f.dataset.f; state.open = false; renderTabs(); renderGrid(); return; }
    const c = e.target.closest('[data-cur]'); if (c) { state.cur = c.dataset.cur; renderGrid(); return; }
    const ph = e.target.closest('.ph'); // tocar la foto pasa a la siguiente
    if (ph && e.target.tagName !== 'A') {
      const it = state.view[ph.closest('.card').dataset.i];
      if (it && it.fotos.length > 1) {
        it._p = ((it._p || 0) + 1) % it.fotos.length;
        ph.querySelector('img').src = it.fotos[it._p];
        const cnt = ph.querySelector('.cnt'); if (cnt) cnt.textContent = `${it._p + 1}/${it.fotos.length}`;
      }
    }
  });

  let last = '';
  async function load(first) {
    try {
      const [s, r] = await Promise.all([fetch('/api/stock', { cache: 'no-store' }).then((x) => x.json()), fetch('/api/rate').then((x) => x.json())]);
      const sig = JSON.stringify([s.items, r.rate]);
      if (sig === last) return; // sin cambios: no redibujamos
      last = sig;
      state.items = s.items || []; state.wa = s.whatsapp || state.wa; state.rate = r.rate || state.rate;
      links(); render();
    } catch { if (first) $('#grid').innerHTML = '<p class="empty">No pudimos cargar el stock. Escribinos por WhatsApp y te pasamos la lista.</p>'; }
  }
  async function init() {
    calc(); links();
    await load(true);
    setInterval(load, 30000); // el catálogo se actualiza solo (fotos, precios, stock)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  }
  init();
})();

(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const state = { items: [], filter: 'all', q: '', sort: 'rel', cur: 'USD', rate: 40, wa: '59891070450' };
  const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 0 });
  const wa = (text) => `https://wa.me/${state.wa}?text=${encodeURIComponent(text)}`;

  function priceNum(it) {
    if (it.moneda === state.cur) return it.precio;
    return it.moneda === 'USD' ? it.precio * state.rate : it.precio / state.rate;
  }
  function price(it) {
    let v = priceNum(it);
    if (it.moneda !== state.cur && state.cur === 'UYU') v = Math.round(v / 100) * 100;
    return (state.cur === 'USD' ? 'US$ ' : '$ ') + nf.format(v);
  }
  const kind = (m) => (/macbook/i.test(m) ? 'mac' : /iphone/i.test(m) ? 'iphone' : 'otros');
  const isPro = (m) => /pro/i.test(m);

  const seriesList = () => [...new Set(state.items.map((x) => (x.modelo.match(/^iPhone (\d+)/) || [])[1]).filter(Boolean))].sort((x, y) => y - x);
  function byFilter(it, f) {
    if (f === 'all') return true;
    if (f === 'Sellado' || f === 'Seminuevo') return it.estado === f;
    if (f === 'pro') return isPro(it.modelo);
    if (f === 'mac') return kind(it.modelo) === 'mac';
    if (f.startsWith('ser:')) return new RegExp(`^iPhone ${f.slice(4)}( |$)`).test(it.modelo);
    return true;
  }
  function byQuery(it) {
    const toks = norm(state.q).split(/\s+/).filter(Boolean);
    if (!toks.length) return true;
    const hay = norm([it.modelo, it.gb, it.color, it.estado, it.detalle, it.bateria].join(' '));
    return toks.every((t) => hay.includes(t));
  }
  function renderFilters() {
    const defs = [['all', 'Todos'], ['Sellado', 'Sellados'], ['Seminuevo', 'Seminuevos'], ['pro', 'Línea Pro'], ['mac', 'MacBook'], ...seriesList().map((n) => [`ser:${n}`, `iPhone ${n}`])];
    $('#filters').innerHTML = defs.map(([k, l]) => [k, l, state.items.filter((x) => byFilter(x, k)).length])
      .filter(([k, , n]) => n > 0 || k === 'all')
      .map(([k, l, n]) => `<button class="chip ${state.filter === k ? 'on' : ''}" data-f="${esc(k)}">${esc(l)}<small>${n}</small></button>`).join('');
  }

  function card(it, i) {
    const specs = [it.gb, it.color, it.bateria ? `Batería ${it.bateria}` : ''].filter(Boolean).join(' · ');
    const name = `${it.modelo}${it.gb ? ' ' + it.gb : ''}${it.color ? ' ' + it.color : ''}`;
    const photo = it.fotos.length ? `<img src="${esc(it.fotos[0])}" alt="${esc(it.modelo + ' ' + it.color)}" loading="lazy">` : '<span class="noph">Foto próximamente</span>';
    const cnt = it.fotos.length > 1 ? `<span class="cnt">1/${it.fotos.length}</span>` : '';
    return `<article class="card" data-i="${i}"><div class="ph"><span class="tag">${esc(it.estado === 'Sellado' ? 'Sellado' : 'Seminuevo')}</span>${photo}${cnt}</div>
      <h3>${esc(it.modelo)}</h3><p class="sp">${esc(specs)}</p>
      ${it.detalle ? `<p class="sp">Detalle: ${esc(it.detalle)}</p>` : ''}
      ${it.cantidad > 1 ? `<p class="qty">${it.cantidad} disponibles</p>` : ''}
      <div class="row"><b>${price(it)}</b><a class="wa" href="${wa(`Hola! Me interesa el ${name}que vi en la web.`)}">Consultar</a></div></article>`;
  }

  function renderGrid() {
    let list = state.items.filter((x) => byFilter(x, state.filter) && byQuery(x));
    if (state.sort !== 'rel') list = [...list].sort((a, b) => (state.sort === 'asc' ? 1 : -1) * (priceNum(a) - priceNum(b)));
    state.view = list;
    const total = list.reduce((n, x) => n + x.cantidad, 0);
    $('#count').textContent = list.length ? `${total} ${total > 1 ? 'equipos' : 'equipo'}` : '';
    $('#grid').innerHTML = list.length ? list.map(card).join('')
      : '<div class="empty"><p>No encontramos equipos con ese filtro. Escribinos por WhatsApp y te avisamos cuando entre uno.</p><button class="chip" data-clear>Limpiar filtros</button></div>';
    document.querySelectorAll('[data-cur]').forEach((b) => b.classList.toggle('on', b.dataset.cur === state.cur));
    $('#rateNote').textContent = state.cur === 'UYU' ? `Los precios en dólares se muestran en pesos a $ ${state.rate.toFixed(2).replace('.', ',')} por dólar. Consultá la cotización del día.` : 'Precios en dólares.';
  }
  function render() { renderFilters(); renderGrid(); }

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

  // Scroll suave a las secciones (menú, "Ver stock", etc.)
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    const id = a && a.getAttribute('href');
    if (!id || id.length < 2) return;
    const t = document.querySelector(id);
    if (!t) return;
    e.preventDefault();
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    t.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', id);
  });

  $('#q').addEventListener('input', (e) => { state.q = e.target.value; renderGrid(); });
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; renderGrid(); });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-clear]')) { state.filter = 'all'; state.q = ''; $('#q').value = ''; render(); return; }
    const f = e.target.closest('[data-f]'); if (f) { state.filter = f.dataset.f; render(); return; }
    const c = e.target.closest('[data-cur]'); if (c) { state.cur = c.dataset.cur; render(); return; }
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

  async function init() {
    calc();
    try {
      const [s, r] = await Promise.all([fetch('/api/stock').then((x) => x.json()), fetch('/api/rate').then((x) => x.json())]);
      state.items = s.items || []; state.wa = s.whatsapp || state.wa; state.rate = r.rate || state.rate;
    } catch { $('#grid').innerHTML = '<p class="empty">No pudimos cargar el stock. Escribinos por WhatsApp y te pasamos la lista.</p>'; }
    links(); render();
  }
  init();
})();

(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const state = { items: [], filter: 'all', cur: 'USD', rate: 40, wa: '59891070450' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 0 });
  const wa = (text) => `https://wa.me/${state.wa}?text=${encodeURIComponent(text)}`;

  function price(it) {
    let v = it.precio;
    if (it.moneda !== state.cur) v = it.moneda === 'USD' ? it.precio * state.rate : it.precio / state.rate;
    if (it.moneda !== state.cur && state.cur === 'UYU') v = Math.round(v / 100) * 100;
    return (state.cur === 'USD' ? 'US$ ' : '$ ') + nf.format(v);
  }
  const kind = (m) => (/macbook/i.test(m) ? 'mac' : /iphone/i.test(m) ? 'iphone' : 'otros');
  const isPro = (m) => /pro/i.test(m);

  function renderFilters() {
    const defs = [['all', 'Todos'], ['Sellado', 'Sellados'], ['Seminuevo', 'Seminuevos'], ['pro', 'Línea Pro'], ['mac', 'MacBook']];
    $('#filters').innerHTML = defs.map(([k, l]) => `<button class="chip ${state.filter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('');
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

  function render() {
    renderFilters();
    const list = state.items.filter((x) => state.filter === 'all' || x.estado === state.filter ||
      (state.filter === 'pro' && isPro(x.modelo)) || (state.filter === 'mac' && kind(x.modelo) === 'mac'));
    state.view = list;
    $('#grid').innerHTML = list.length ? list.map(card).join('') : '<p class="empty">No hay equipos en esta categoría por ahora. Escribinos y te avisamos cuando entre uno.</p>';
    document.querySelectorAll('[data-cur]').forEach((b) => b.classList.toggle('on', b.dataset.cur === state.cur));
    $('#rateNote').textContent = state.cur === 'UYU' ? `Los precios en dólares se muestran en pesos a $ ${state.rate.toFixed(2).replace('.', ',')} por dólar. Consultá la cotización del día.` : 'Precios en dólares.';
  }

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

  document.addEventListener('click', (e) => {
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

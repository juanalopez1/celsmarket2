const slug = (s) =>
  String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const normModel = (s) =>
  String(s || '').trim().replace(/\s+/g, ' ')
    .replace(/iphone/gi, 'iPhone').replace(/macbook/gi, 'MacBook')
    .replace(/\bpro\b/gi, 'Pro').replace(/\bmax\b/gi, 'Max')
    .replace(/\bsamsung\b/gi, 'Samsung');

const normGb = (s) => {
  const m = String(s || '').match(/(\d+)\s*(gb|tb)?/i);
  if (!m) return '';
  return `${m[1]} ${(m[2] || 'gb').toUpperCase()}`;
};

const cap = (s) => {
  const t = String(s || '').trim();
  return t ? t[0].toUpperCase() + t.slice(1).toLowerCase() : '';
};

const num = (v) => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// Fecha "d/m/yyyy" (texto) o número de serie de Sheets -> Date (UTC)
const parseDate = (v) => {
  if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + v * 86400000);
  const m = String(v || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : null;
};

const isTotalRow = (r) => /^total/i.test(String(r[0] || '').trim());

module.exports = { slug, normModel, normGb, cap, num, parseDate, isTotalRow };

require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieSession = require('cookie-session');
const multer = require('multer');

const photos = require('./lib/photos');
const { publicStock, photoSlots } = require('./lib/stock');
const { salesStats, stockValue, debts, cash } = require('./lib/stats');
const { getRate, readSettings, writeSettings } = require('./lib/rate');

const app = express();
const PROD = process.env.NODE_ENV === 'production';
if (PROD) app.set('trust proxy', 1);

app.use(express.json({ limit: '50kb' }));
app.use(cookieSession({
  name: 'cm_session', keys: [process.env.SESSION_SECRET || 'dev-secret'],
  httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: 1000 * 60 * 60 * 12,
}));

// ---------- Auth ----------
const attempts = new Map(); // ip -> { n, at }
const safeEq = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};
const requireAdmin = (req, res, next) =>
  req.session && req.session.admin ? next() : res.status(401).json({ error: 'No autorizado' });

app.post('/api/admin/login', (req, res) => {
  const ip = req.ip, now = Date.now();
  const a = attempts.get(ip) || { n: 0, at: now };
  if (now - a.at > 10 * 60 * 1000) { a.n = 0; a.at = now; }
  if (a.n >= 5) return res.status(429).json({ error: 'Demasiados intentos. Probá en unos minutos.' });
  if (!process.env.ADMIN_PASSWORD || !safeEq(req.body.password || '', process.env.ADMIN_PASSWORD)) {
    a.n += 1; attempts.set(ip, a);
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }
  attempts.delete(ip);
  req.session.admin = true;
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => { req.session = null; res.json({ ok: true }); });
app.get('/api/admin/me', (req, res) => res.json({ admin: !!(req.session && req.session.admin) }));

// ---------- API pública (nunca expone precios de compra ni ventas) ----------
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: 'Error interno' }); });

app.get('/api/stock', wrap(async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=30');
  res.json({ items: await publicStock(), whatsapp: process.env.WHATSAPP || '' });
}));
app.get('/api/rate', wrap(async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json(await getRate());
}));
app.use('/photos', express.static(photos.DIR, { maxAge: '7d', immutable: true }));

// ---------- API privada ----------
app.get('/api/admin/stats', requireAdmin, wrap(async (req, res) => {
  const [sales, stock] = await Promise.all([salesStats(req.query.month), stockValue()]);
  res.json({ sales, stock });
}));
app.get('/api/admin/debts', requireAdmin, wrap(async (_req, res) => {
  const [d, c] = await Promise.all([debts(), cash()]);
  res.json({ debts: d, cash: c });
}));
app.get('/api/admin/photo-slots', requireAdmin, wrap(async (_req, res) => res.json(await photoSlots())));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});
app.post('/api/admin/photos/:key', requireAdmin, upload.array('photos', 6), wrap(async (req, res) => {
  if (!photos.keyOk(req.params.key)) return res.status(400).json({ error: 'Clave inválida' });
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No llegó ninguna imagen' });
  const saved = [];
  try { for (const f of req.files) saved.push(await photos.save(req.params.key, f.buffer)); }
  catch (e) { return res.status(400).json({ error: e.message, saved }); }
  res.json({ saved });
}));
app.delete('/api/admin/photos/:key/:file', requireAdmin, (req, res) => {
  try { photos.remove(req.params.key, req.params.file); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/admin/settings', requireAdmin, (_req, res) => res.json(readSettings()));
app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const v = Number(req.body.rateOverride);
  res.json(writeSettings({ rateOverride: v > 0 && v < 1000 ? v : null }));
});

// ---------- Front ----------
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`CelsMarket en http://localhost:${port}`));

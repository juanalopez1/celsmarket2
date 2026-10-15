const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const DIR = path.join(process.env.DATA_DIR || './data', 'photos');
const MAX_PER_KEY = 8;
fs.mkdirSync(DIR, { recursive: true });

const keyOk = (k) => /^[a-z0-9-]{1,120}$/.test(k);
const fileOk = (f) => /^[\w-]{1,60}\.webp$/.test(f);

function list(key) {
  const d = path.join(DIR, key);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(fileOk).sort().map((f) => `/photos/${key}/${f}`);
}

async function save(key, buffer) {
  if (!keyOk(key)) throw new Error('Clave inválida');
  const d = path.join(DIR, key);
  fs.mkdirSync(d, { recursive: true });
  if (fs.readdirSync(d).length >= MAX_PER_KEY) throw new Error(`Máximo ${MAX_PER_KEY} fotos por modelo`);
  const name = `${Date.now()}.webp`;
  await sharp(buffer).rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 }).toFile(path.join(d, name));
  return `/photos/${key}/${name}`;
}

function remove(key, file) {
  if (!keyOk(key) || !fileOk(file)) throw new Error('Parámetros inválidos');
  fs.rmSync(path.join(DIR, key, file), { force: true });
}

module.exports = { DIR, list, save, remove, keyOk, fileOk };

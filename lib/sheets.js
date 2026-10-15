const { google } = require('googleapis');

let client;
function sheetsClient() {
  if (client) return client;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON');
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  client = google.sheets({ version: 'v4', auth });
  return client;
}

const cache = new Map(); // tab -> { at, rows }
const TTL = 60 * 1000;

// Devuelve las filas (arrays) de una pestaña, sin la fila de encabezado.
async function readTab(tab) {
  const hit = cache.get(tab);
  if (hit && Date.now() - hit.at < TTL) return hit.rows;
  try {
    const res = await sheetsClient().spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: `'${tab}'`,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'SERIAL_NUMBER',
    });
    const rows = (res.data.values || []).slice(1);
    cache.set(tab, { at: Date.now(), rows });
    return rows;
  } catch (e) {
    if (hit) return hit.rows; // si Google falla, usamos lo último que teníamos
    throw e;
  }
}

module.exports = { readTab };

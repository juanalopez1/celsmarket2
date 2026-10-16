# CelsMarket Uy — Cloudflare Workers + Google Sheets + Cloudinary

Esta versión no usa Cloudflare R2. Las fotos se suben a Cloudinary; Google Sheets sigue siendo la fuente del stock/ventas/caja/deudores; Cloudflare KV guarda únicamente el ajuste de cotización del panel.

## Configuración única

1. En Cloudflare, creá un namespace KV: desde la carpeta del proyecto ejecutá `npx wrangler kv namespace create SETTINGS`.
2. Copiá el `id` que devuelve y reemplazá `REPLACE_WITH_KV_NAMESPACE_ID` en `wrangler.jsonc`.
3. Configurá los secretos del Worker (los valores no se guardan en Git):

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
npx wrangler secret put SHEET_ID
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
npx wrangler secret put CLOUDINARY_CLOUD_NAME
npx wrangler secret put CLOUDINARY_API_KEY
npx wrangler secret put CLOUDINARY_API_SECRET
```

Pegá el valor cuando Wrangler lo solicite. `GOOGLE_SERVICE_ACCOUNT_JSON` es el JSON entero de la cuenta de servicio en una sola línea. La hoja debe estar compartida con el email `client_email` de esa cuenta, con permiso de lectura.

Para probar localmente, copiá `.env.example` a `.dev.vars` y completá las mismas variables. No subas `.dev.vars` ni `.env` a GitHub.

## Instalar, probar y desplegar

```bash
npm install
npx wrangler dev
```

Probá la web pública y el panel, especialmente login, stock, fotos, estadísticas, deudores/caja y cotización. Para desplegar: `npx wrangler deploy`.

## Fotos

El panel consulta Cloudinary para listar las fotos por modelo, sube imágenes con un máximo de 12 MB por archivo y 8 fotos por modelo, y permite borrarlas. Cloudinary aplica CDN/entrega optimizada. No se necesita crear un bucket R2.

# CelsMarket Uy — web + panel

Web pública (stock, canje, pagos, FAQ) y panel privado del dueño (estadísticas, fotos, cuentas a cobrar).
**El stock vive en Google Sheets.** El dueño solo sube fotos desde el panel.

## Cómo funciona

```
Google Sheets (privado) ──lectura──▶  Backend Node/Express  ──▶  Web pública  (/)
   Stock · Ventas · Deudores · Caja        │  cache 60 s            solo ve: modelo, GB, color,
                                           │                        batería, precio de venta, fotos
                                           ├──▶ Panel privado (/admin, con contraseña)
                                           │      ventas, ganancias, deudores, caja
                                           └──▶ Disco persistente (DATA_DIR): fotos + ajustes
```

**¿Por qué hace falta un backend?** Por dos cosas que un front solo no puede hacer bien:
1. **Fotos**: alguien tiene que recibir el archivo, achicarlo y guardarlo.
2. **Datos privados**: la hoja Ventas tiene costos y ganancias, y Deudores tiene nombres. Si el front leyera el Sheet directo, esa información quedaría expuesta. El backend es el filtro: la web pública nunca recibe precio de compra.

## Reglas de las planillas (importante)

- Tiene que ser un **Google Sheet real**. Si es un `.xlsx` subido a Drive: *Archivo → Guardar como Google Sheets*.
- Pestañas y columnas que lee el código (se pueden renombrar desde `.env`):
  - `Stock Seminuevos 1` y `2`: Modelo | GB | Detalle | Color | Precio c | Precio v | Batería
  - `Stock Sellados`: Modelo | GB | Color | Precio c | Precio v
  - `Ventas`: iPhone | Precio C | Precio V | Batería | Detalles | Fecha/Venta | Color | Ganancia
  - `Deudores`: Nombre | A pagar | Modelo de Celular
  - `Caja`: fila 1 con títulos, fila 2 con valores (orden: Préstamos, Publicidad, Gastos P, Ganancias, Invertido, Facturación)
- **Cuando se vende un equipo, hay que borrar su fila del stock** (y anotarlo en Ventas). Lo que está en el stock se muestra como disponible.
- Los renglones `TOTAL:` se ignoran (el panel suma solo). Ojo: los totales actuales del Excel no coinciden con los equipos listados.
- Fechas en Ventas: `d/m/aaaa`. Las filas "Préstamo" e "Intereses" se cuentan aparte de los equipos.
- Si hay dos equipos idénticos (mismo modelo, GB, color, batería y precio), la web los agrupa y muestra "2 disponibles".
- **Fotos**: una por *modelo + GB + color*, compartida por todos los equipos iguales. Si el dueño cambia el nombre de un modelo en la hoja, se pierde la asociación con su foto (hay que volver a subirla).

## Puesta en marcha

1. **Cuenta de servicio de Google** (una sola vez)
   - console.cloud.google.com → proyecto nuevo → habilitar *Google Sheets API*.
   - *IAM → Cuentas de servicio → Crear* → *Claves → Agregar clave → JSON*.
   - Abrir el Sheet → *Compartir* → pegar el email de la cuenta de servicio (`...@...iam.gserviceaccount.com`) como **Lector**.
2. `cp .env.example .env` y completar: `SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON` (el JSON en una línea), `ADMIN_PASSWORD`, `SESSION_SECRET`.
3. `npm install` y `npm start` → http://localhost:3000 (web) y http://localhost:3000/admin (panel).

## Hosting

Necesita **Node 18+** y un **disco persistente** (para `DATA_DIR`, donde quedan las fotos). Opciones:
- **VPS** (DigitalOcean, Hetzner, etc.) con Node + `pm2` + Nginx/Caddy para HTTPS. Es lo más simple en cuanto a disco.
- **Render / Railway / Fly.io**: crear un servicio Node, agregar un *Volume/Disk* y apuntar `DATA_DIR` ahí (ej. `/data`). Sin disco, las fotos se pierden en cada deploy.
- Siempre con **HTTPS** (la cookie del panel es `secure` en producción). `NODE_ENV=production`.
- Dominio: apuntar el DNS al servicio. Backups: copiar la carpeta `DATA_DIR` de vez en cuando.

## Seguridad

- Panel con contraseña, cookie `httpOnly`, 12 h de sesión y límite de 5 intentos cada 10 min por IP.
- El Sheet se comparte solo con la cuenta de servicio, nunca público.
- Endpoints `/api/admin/*` rechazan todo sin sesión. `/api/stock` filtra el precio de compra.
- Las fotos se re-codifican a WebP (se descarta el contenido original), máx. 12 MB por archivo y 8 por modelo.
- Cambiar la contraseña = editar `ADMIN_PASSWORD` y reiniciar. No pongas `.env` en git.

## Cotización del dólar

Prioridad: valor manual del dueño (panel → Ajustes) → mercado automático (open.er-api.com, cada 30 min) → `RATE_FALLBACK`.
Es cotización de mercado, no la del BROU. Si prefieren BROU, cambiar `fetchMarketRate` en `lib/rate.js`. Los equipos de `Stock Sellados` se leen en USD y los seminuevos en UYU (`CURRENCY_*` en `.env`).

## Plan de trabajo

1. **Base** (este código): web + panel + Sheets + fotos. Revisar que las columnas coincidan y probar con el Sheet real.
2. **Contenido**: número de WhatsApp (ya cargado), Facebook, textos finales, lista de sellados cargada en el Sheet.
3. **Deploy**: hosting con disco, dominio, HTTPS, contraseña real.
4. **Después**: marcar "vendido" desde el panel, mapa/horarios, testimonios con fotos de clientes, pixel de Meta/Google Analytics.

## Estructura

```
server.js          rutas, sesión, subida de fotos
lib/sheets.js      lectura del Sheet con cache de 60 s
lib/stock.js       stock público (sin costos) y slots de fotos
lib/stats.js       ventas, stock valorizado, deudores, caja
lib/rate.js        cotización + ajustes
lib/photos.js      guardado en WebP
public/            index.html, site.js, site.css, admin.html, admin.js, admin.css
```

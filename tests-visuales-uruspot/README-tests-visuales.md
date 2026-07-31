# URU SPOT — Baseline de tests visuales

Cierra el P0 que quedó abierto desde **Fase 1 §19/§21** ("cero tests
visuales/E2E/accesibilidad automatizados") y que **Fase 3D §9/§10**
sigue marcando como bloqueante antes de tocar más CSS o
`motor-render.js`.

## Qué es esto (y qué NO es)

- **Es**: una suite de Playwright que saca screenshots de las 5 vistas
  clave del sitio (Home/Guía, Exploración, Búsqueda vacía, Mapa,
  Ficha) en 3 breakpoints reales (1440/768/375, los mismos que ya usa
  `mapa.css`), y las compara pixel a pixel contra un baseline
  aprobado.
- **No es** un reemplazo de tests E2E funcionales ni de accesibilidad
  automatizada (axe-core) — esos siguen siendo huecos separados, ya
  señalados en Fase 1 §13, y no se resuelven acá.
- **No modifica ningún archivo de `donde-comer-cdu/`** — vive aparte,
  como herramienta de CI, igual que `js/run-tests.js` vive aparte del
  código que Cloudflare Pages sirve.

## Por qué no generé el baseline ya mismo

Este entorno de trabajo no tiene un navegador headless disponible
(Chromium/Firefox no están instalables vía `apt` en esta imagen — en
Ubuntu 24 se movieron a paquetes snap-only, y el sandbox no tiene
acceso a la Chrome Web Store ni al CDN de descarga de navegadores de
Playwright). Por eso no pude correr `playwright install` ni sacar una
sola captura real acá. Lo que sí puedo garantizar:

- Los 3 archivos JS (`playwright.config.js`, `estado-helper.js`,
  `visual.spec.js`) pasaron `node --check` sin errores de sintaxis.
- Los selectores usados (`#tituloRegion`, `#subtituloRegion`,
  `#inputBuscar`, `#mapaHerramienta`, `#region-descubrimiento`) fueron
  verificados **contra el `index.html` real del repo**, no inventados.
- La clave de `localStorage` (`uru_plano::concepcion-del-uruguay::<uid>`)
  y la forma exacta del objeto de estado fueron verificadas línea por
  línea contra `esEstadoValido()`/`estadoInicial()` en
  `js/motor-plano.js` para que la siembra sea aceptada como estado
  válido en el primer render, no descartada por `migrarEstado()`.

Lo único que falta es correrlo una vez en un entorno con navegador
real (tu máquina o GitHub Actions) para generar las imágenes.

## Instalación (en tu máquina o en CI)

```bash
# 1. Copiar esta carpeta a la raíz del repo uruspot (junto a donde-comer-cdu/)
cp -r visual-tests/* /ruta/a/uruspot/
cp -r visual-tests/.github /ruta/a/uruspot/

# 2. Instalar dependencias
cd /ruta/a/uruspot
npm install --no-save @playwright/test http-server
npx playwright install --with-deps chromium
```

## Generar el baseline por primera vez

```bash
npx playwright test --update-snapshots
```

Esto crea `tests/visual/__baseline__/<breakpoint>/*.png` — **revisá
estas imágenes a ojo antes de commitearlas** (es el único paso manual
de todo el proceso: confirmar que lo que ves hoy es, de hecho, lo que
querés proteger). Después:

```bash
git add tests/visual/__baseline__/
git commit -m "Baseline de tests visuales (Fase 1 §19 / Fase 3D §9)"
```

## Uso normal (después de tener baseline)

```bash
npx playwright test              # compara contra el baseline
npx playwright show-report       # ver diffs si algo falló
npx playwright test --update-snapshots   # aceptar un cambio visual intencional
```

## En CI (GitHub Actions)

El workflow `.github/workflows/tests-visuales.yml` ya está armado
para correr automáticamente en cualquier PR que toque `css/`,
`motor-render.js`, `rubros-meta.js`, `index.html`, `locales/` o los
tests mismos. Corre primero `run-tests.js` (contrato de negocio) y
recién después los visuales — mismo orden de prioridad que el propio
repo ya demuestra en su disciplina de auditoría.

**Importante**: el primer baseline (`tests/visual/__baseline__/`) hay
que generarlo y commitearlo manualmente una vez (paso anterior) antes
de que el workflow tenga algo contra qué comparar — CI no genera un
baseline nuevo solo, por diseño (si lo hiciera, nunca detectaría una
regresión real).

## Qué cubre cada test

| Test | Vista | Por qué esta y no otra |
|---|---|---|
| `01-home-guia` | Primer contacto real, región Guía | Fase 3A §1.2 confirmó que **todo** usuario nuevo arranca acá — es la vista que más gente ve |
| `02-region-exploracion` | Región Exploración, mapa con más densidad | Único lugar donde Guía/Exploración deberían diferenciarse cualitativamente (Fase 3D, MUST HAVE pendiente) |
| `03-busqueda-vacia` | Estado vacío de búsqueda | Estado técnico ya resuelto (`template-empty`, Fase 3A §8) — protegerlo de regresión de CSS |
| `04-mapa-interactivo` | Canvas del mapa con marcadores | Es el archivo de mayor esfuerzo/riesgo real del repo (`motor-render.js`, Fase 1 §17/§20) |
| `05-ficha` | Documento de ficha completo | Estructura ya confirmada (`hero-*`/`info-strip`/`action-row`, Fase 2C) — cross-document, no SPA |

## Ajustar el umbral de sensibilidad

`playwright.config.js` usa `maxDiffPixelRatio: 0.002` (0.2%). Si el
baseline empieza a fallar por ruido de antialiasing entre máquinas
(común entre tu Mac/Linux local y el runner de GitHub Actions),
generá el baseline **directamente en CI** (`workflow_dispatch` con
`--update-snapshots` local, descargando el artifact `baseline-actualizado`)
en vez de subir uno generado en tu máquina — evita falsos positivos
por diferencias de renderizado de fuente entre sistemas operativos.

## Próximo paso natural

Una vez que este baseline esté commiteado y en verde, recién ahí
tiene sentido avanzar con seguridad razonable a los ítems P2 de la
lista priorizada (mapa embebido en ficha, vista de Evaluación,
reordenamiento mobile) — todos tocan CSS o superficie visual nueva
que este baseline ya puede proteger.

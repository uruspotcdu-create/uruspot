/**
 * URU SPOT — Baseline visual pre-Fase 4
 * ---------------------------------------------------------------------
 * Captura screenshots de referencia del estado ACTUAL del producto,
 * antes de tocar tokens.css / motor-render.js.
 *
 * Requiere Node.js. No modifica ningún archivo del repo.
 *
 * INSTALACIÓN (una sola vez, en tu máquina, con red normal):
 *   npm install -D @playwright/test
 *   npx playwright install chromium
 *
 * USO:
 *   node baseline-visual-uruspot.js [URL_BASE]
 *
 * Ejemplo:
 *   node baseline-visual-uruspot.js https://uruspot.pages.dev
 *   node baseline-visual-uruspot.js http://localhost:8000   (si servís el repo local)
 *
 * Guarda todo en ./baseline/<estado>--<viewport>.png
 */

const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.argv[2] || 'https://uruspot.pages.dev';
const OUT_DIR = path.join(__dirname, 'baseline');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
};

async function shot(page, name, viewportName) {
  const file = path.join(OUT_DIR, `${name}--${viewportName}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log('  ✓', file);
}

async function esperarReady(page) {
  // La app pasa a READY cuando #panelDescubrimiento deja de mostrar el esqueleto.
  await page.waitForSelector('#panelDescubrimiento .tarjeta, #panelDescubrimiento .vacio', {
    timeout: 15000,
  }).catch(() => console.log('  ⚠ timeout esperando READY, capturo igual'));
}

async function run() {
  const browser = await chromium.launch();

  for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
    console.log(`\n=== Viewport: ${vpName} (${viewport.width}x${viewport.height}) ===`);
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();

    // 1. Home / estado inicial
    await page.goto(`${BASE_URL}/donde-comer-cdu/`, { waitUntil: 'domcontentloaded' });
    await shot(page, '01-home-cargando', vpName);
    await esperarReady(page);
    await shot(page, '02-home-ready-guia', vpName);

    // 2. Búsqueda / Acción Directa
    const input = page.locator('#inputBuscar');
    if (await input.count()) {
      await input.fill('pizza');
      await page.waitForTimeout(600);
      await shot(page, '03-busqueda-accion-directa', vpName);

      // Resultados vacíos
      await input.fill('zzzznoexiste');
      await page.waitForTimeout(600);
      await shot(page, '04-resultados-vacios', vpName);

      await input.fill('');
      await page.waitForTimeout(400);
    }

    // 3. Filtro de rubro
    const chip = page.locator('#listaRubros button, #listaRubros [data-accion], #listaRubros a').first();
    if (await chip.count()) {
      await chip.click().catch(() => {});
      await page.waitForTimeout(600);
      await shot(page, '05-filtro-rubro-activo', vpName);
    }

    // 4. Mapa (si está visible)
    const mapa = page.locator('#mapaContainer');
    if (await mapa.count()) {
      await shot(page, '06-mapa', vpName);
    }

    await context.close();
  }

  // 5. Ficha de lugar (documento separado)
  const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/donde-comer-cdu/locales/antigua-fonda/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await shot(page, '07-ficha-lugar', 'desktop');
  await context.close();

  await browser.close();
  console.log('\nListo. Screenshots en', OUT_DIR);
  console.log('Volvé a correr este script después de cada cambio visual y compará carpeta por carpeta.');
}

run().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});

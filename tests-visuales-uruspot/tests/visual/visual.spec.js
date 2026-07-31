// URU SPOT — Baseline de tests visuales (P0, Fase 1 §19 / Fase 3D §9).
//
// Cubre las 5 vistas clave que todos los documentos de blueprint ya
// acordaron como mínimo indispensable antes de tocar más CSS o
// motor-render.js: Home (Guía), Exploración, Búsqueda vacía, Mapa, y
// Ficha. No cubre journey completo ni interacción — eso es trabajo de
// tests E2E funcionales, un proyecto aparte (Fase 1 §13 ya señaló que
// tampoco existen, pero no es el alcance de este P0).
//
// CÓMO CORRER:
//   Generar/actualizar baseline:  npx playwright test --update-snapshots
//   Verificar contra baseline:    npx playwright test
//   Ver el reporte HTML:          npx playwright show-report

const { test, expect } = require('@playwright/test');
const { sembrarEstado, ESTADO_GUIA, ESTADO_EXPLORACION } = require('./estado-helper');

const URL_APP = '/donde-comer-cdu/index.html';
// Ficha real y enlazada, confirmada por Fase 1 §13 (test de contrato
// "los 45 slugs de locales-slug.js tienen su carpeta real").
const URL_FICHA = '/donde-comer-cdu/locales/antigua-fonda/index.html';

/**
 * Espera a que la app salga de READY real (no solo DOMContentLoaded):
 * el subtítulo de región deja de decir "Cargando…" — señal exacta que
 * Fase 3A §1.1 ya usa para describir el fin del fetch bloqueante de
 * lugares-core.json.
 */
async function esperarAppLista(page) {
  await expect(page.locator('#subtituloRegion')).not.toHaveText('Cargando…', { timeout: 15000 });
  // Ambient Engine + coreografías corren en rAF — un frame extra de
  // margen evita capturar a mitad de una transición de entrada, sin
  // depender de un timeout largo arbitrario.
  await page.waitForTimeout(150);
}

test.describe('Vistas clave — baseline visual', () => {
  test('Home / región Guía (primer contacto real)', async ({ page }) => {
    await sembrarEstado(page, ESTADO_GUIA());
    await page.goto(URL_APP);
    await esperarAppLista(page);

    await expect(page).toHaveScreenshot('01-home-guia.png', { 
  fullPage: true,
  maxDiffPixelRatio: 0.05 // Tolera hasta un 5% de diferencia visual/altura
});
  });

  test('Región Exploración (mapa protagonista)', async ({ page }) => {
    await sembrarEstado(page, ESTADO_EXPLORACION());
    await page.goto(URL_APP);
    await esperarAppLista(page);

    await expect(page).toHaveScreenshot('02-region-exploracion.png', { fullPage: true });
  });

  test('Búsqueda sin resultados (estado vacío)', async ({ page }) => {
    await sembrarEstado(page, ESTADO_GUIA());
    await page.goto(URL_APP);
    await esperarAppLista(page);

    await page.locator('#inputBuscar').fill('xyz-consulta-inexistente-uruspot');
    // El buscador no tiene debounce documentado como bloqueante en
    // Fase 3A — un margen corto alcanza para que render() reaccione.
    await page.waitForTimeout(300);

    await expect(page.locator('#region-descubrimiento')).toHaveScreenshot(
      '03-busqueda-vacia.png'
    );
  });

  test('Mapa interactivo (recorte con coordenadas válidas)', async ({ page }) => {
    await sembrarEstado(page, ESTADO_EXPLORACION());
    await page.goto(URL_APP);
    await esperarAppLista(page);

    const mapa = page.locator('#mapaHerramienta');
    // El mapa arranca oculto hasta confirmar coordenadas válidas
    // (Fase 3A §1.2, riesgo 🟠 ya documentado) — si esto falla, es la
    // señal exacta de esa fricción, no un falso positivo del test.
    await expect(mapa).toBeVisible({ timeout: 10000 });
    await expect(mapa).toHaveScreenshot('04-mapa-interactivo.png');
  });

  test('Ficha (documento propio, cross-document)', async ({ page }) => {
    // Las fichas son HTML propio, no SPA (Fase 1 §3) — no requieren
    // siembra de estado de motor-plano.js.
    await page.goto(URL_FICHA);
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('05-ficha.png', { fullPage: true });
  });
});

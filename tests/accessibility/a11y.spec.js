const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

/*
 * Fase 5.2 — Accesibilidad con herramienta real (axe-core).
 *
 * Cubre:
 *  - WCAG 2.2 AA (contraste real, no simulado) vía tags de axe.
 *  - Un set representativo de páginas: home/mapa + una ficha de cada
 *    familia de generador (donde-comer-cdu y los-mejores-restaurantes-cdu,
 *    que son los dos generadores independientes) + las familias "las-mejores-*"
 *    y "los-mejores-*" de un solo nivel.
 *  - Navegación por teclado en el mapa interactivo (motor-render.js):
 *    Tab debe mover el foco de forma visible y en orden lógico.
 *
 * Lo que este archivo NO reemplaza: la prueba manual en navegador real
 * pedida en 5.2 (lector de pantalla, zoom, etc.). Esto es la base
 * automatizada; falta la pasada manual antes de marcar 5.2 como cerrada.
 */

const PAGINAS_REPRESENTATIVAS = [
  { nombre: 'home / mapa (donde-comer-cdu)', url: '/donde-comer-cdu/' },
  { nombre: 'ficha donde-comer-cdu/locales', url: '/donde-comer-cdu/locales/7-colinas/' },
  { nombre: 'ficha los-mejores-restaurantes-cdu', url: '/los-mejores-restaurantes-cdu/al-spiedo/' },
  { nombre: 'las-mejores-cafeterias-cdu', url: '/las-mejores-cafeterias-cdu/' },
  { nombre: 'las-mejores-heladerias-cdu', url: '/las-mejores-heladerias-cdu/' },
  { nombre: 'las-mejores-hosterias-cdu', url: '/las-mejores-hosterias-cdu/' },
  { nombre: 'las-mejores-panaderias-cdu', url: '/las-mejores-panaderias-cdu/' },
  { nombre: 'los-mejores-bares-cdu', url: '/los-mejores-bares-cdu/' },
  { nombre: 'los-mejores-gimnasios-cdu', url: '/los-mejores-gimnasios-cdu/' },
  { nombre: 'mejores-veterinarias-cdu', url: '/mejores-veterinarias-cdu/' },
];

for (const pagina of PAGINAS_REPRESENTATIVAS) {
  test(`axe: ${pagina.nombre} no tiene violaciones WCAG 2.2 AA`, async ({ page }) => {
    await page.goto(pagina.url);
    await page.waitForLoadState('networkidle');

    const resultados = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();

    if (resultados.violations.length > 0) {
      const detalle = resultados.violations
        .map((v) => `- [${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} nodo/s)`)
        .join('\n');
      test.info().annotations.push({ type: 'axe-violations', description: detalle });
    }

    expect(resultados.violations, JSON.stringify(resultados.violations, null, 2)).toEqual([]);
  });
}

test('teclado: el mapa interactivo (motor-render.js) es navegable con Tab', async ({ page }) => {
  await page.goto('/donde-comer-cdu/');
  await page.waitForLoadState('networkidle');

  // Recorre N tabs y verifica que en cada paso haya un elemento con foco
  // visible (outline / box-shadow distinto de 'none') y que el foco
  // efectivamente se mueva entre elementos distintos (no se queda pegado).
  const PASOS = 15;
  const focosVistos = new Set();

  for (let i = 0; i < PASOS; i++) {
    await page.keyboard.press('Tab');
    const activo = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const estilo = getComputedStyle(el);
      return {
        tag: el.tagName,
        id: el.id || null,
        clase: el.className || null,
        outline: estilo.outlineStyle,
        outlineWidth: estilo.outlineWidth,
        boxShadow: estilo.boxShadow,
      };
    });

    if (activo) {
      focosVistos.add(`${activo.tag}#${activo.id}.${activo.clase}`);
      const tieneIndicadorVisible =
        (activo.outline !== 'none' && activo.outlineWidth !== '0px') ||
        (activo.boxShadow && activo.boxShadow !== 'none');
      expect(
        tieneIndicadorVisible,
        `Elemento sin indicador de foco visible: ${JSON.stringify(activo)}`
      ).toBeTruthy();
    }
  }

  // El foco debe haberse movido a más de un elemento distinto (si el mapa
  // atrapa el foco en un solo elemento, esto falla).
  expect(focosVistos.size).toBeGreaterThan(1);
});


const { test, expect } = require('@playwright/test');
const { sembrarEstado } = require('./estado-helper');

test.describe('Baseline Visual URU SPOT', () => {

  test('01-home-guia', async ({ page }) => {
    await sembrarEstado(page, { region: 'guia' });
    await page.goto('/donde-comer-cdu/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('01-home-guia.png', { fullPage: true });
  });

  test('02-region-exploracion', async ({ page }) => {
    await sembrarEstado(page, { region: 'exploracion' });
    await page.goto('/donde-comer-cdu/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('02-region-exploracion.png', { fullPage: true });
  });

  test('03-busqueda-vacia', async ({ page }) => {
    await sembrarEstado(page, { busqueda: 'xyz_sin_resultados_99' });
    await page.goto('/donde-comer-cdu/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('03-busqueda-vacia.png', { fullPage: true });
  });

  test('04-mapa-interactivo', async ({ page }) => {
    await sembrarEstado(page, { region: 'exploracion' });
    await page.goto('/donde-comer-cdu/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('04-mapa-interactivo.png', { fullPage: true });
  });

  test('05-ficha', async ({ page }) => {
    await page.goto('/donde-comer-cdu/locales/papa-luigi/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('05-ficha.png', { fullPage: true });
  });

});


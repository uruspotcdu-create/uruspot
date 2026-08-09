const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  for (const [label, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 375, height: 812 }],
  ]) {
    const page = await browser.newPage({ viewport });
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`[${label}] ${msg.text()}`);
    });
    await page.goto('http://localhost:8899/donde-comer-cdu/locales/brode-stress/', { waitUntil: 'networkidle' });

    // Hero (nombre largo)
    const hero = await page.$('.hero');
    if (hero) await hero.screenshot({ path: `/home/claude/shots/stress-${label}-hero.png` });

    // Side-box de precios (lista extrema)
    const sideBoxes = await page.$$('.side-box');
    for (let i = 0; i < sideBoxes.length; i++) {
      const box = sideBoxes[i];
      const title = await box.$eval('.side-box-title', el => el.textContent).catch(() => '');
      if (title && title.includes('Precios')) {
        await box.screenshot({ path: `/home/claude/shots/stress-${label}-precios.png` });
      }
    }

    // Chequeo de overflow horizontal
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    if (scrollWidth > clientWidth) {
      errors.push(`[${label}] OVERFLOW HORIZONTAL: scrollWidth=${scrollWidth} clientWidth=${clientWidth}`);
    }

    await page.close();
  }

  await browser.close();
  console.log('STRESS ERRORS:', JSON.stringify(errors, null, 2));
})();

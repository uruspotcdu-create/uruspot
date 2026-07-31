// URU SPOT — Configuración de Playwright para el baseline de tests
// visuales (P0 heredado de Fase 1 §19, nunca cerrado hasta ahora).
//
// Este archivo vive en la RAÍZ del repo `uruspot` cuando se integra
// (junto a `donde-comer-cdu/`). Ver README-tests-visuales.md para el
// paso a paso de instalación e integración.

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/visual',

  // El sitio no tiene build step (Fase 1 §1) — se sirve tal cual con
  // un servidor estático simple apuntando a la raíz del repo, para
  // que las rutas relativas de donde-comer-cdu/ funcionen igual que
  // en Cloudflare Pages.
  webServer: {
    command: 'npx http-server . -p 4173 -s',
    url: 'http://127.0.0.1:4173/donde-comer-cdu/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  },

  use: {
    baseURL: 'http://127.0.0.1:4173',
    // Congela la sensación ambiental (Ambient Engine, coreografías)
    // para que las capturas no varíen entre corridas por partículas/
    // animaciones en curso — el propio repo ya respeta
    // prefers-reduced-motion en todas las capas (Fase 1 §11, tests
    // verdes en ambiente-lifecycle-tests.js/coreografias-tests.js),
    // así que esto no es un truco nuevo, es aprovechar un contrato
    // que el código ya cumple.
    reducedMotion: 'reduce',
    colorScheme: 'dark' // el modo oscuro es el modo real del producto (tokens.css)
  },

  // Snapshots deterministas: mismo umbral en todas las corridas.
  expect: {
    toHaveScreenshot: {
      // 0.2% de píxeles distintos tolerados — cubre antialiasing de
      // fuente entre entornos, no cubre una regresión visual real.
      maxDiffPixelRatio: 0.002,
      animations: 'disabled'
    }
  },

  // Tres proyectos = los tres breakpoints reales que el propio CSS ya
  // define (mapa.css: 420px desktop / 360px tablet / 300px mobile de
  // altura de mapa, condicionados a @media(max-width:720px) — Fase
  // 3C §7). No se inventan breakpoints nuevos.
  projects: [
    {
      name: 'desktop-1440',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
    },
    {
      name: 'tablet-768',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } }
    },
    {
      name: 'mobile-375',
      use: { ...devices['iPhone 13'], viewport: { width: 375, height: 812 } }
    }
  ],

  snapshotPathTemplate: '{testDir}/__baseline__/{projectName}/{arg}{ext}',
  reporter: [['html', { open: 'never' }], ['list']]
});

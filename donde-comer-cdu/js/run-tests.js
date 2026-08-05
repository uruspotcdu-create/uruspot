// js/run-tests.js — URU SPOT
// ---------------------------------------------------------------------
// Punto de entrada único de la red de seguridad (Fases 0-2 y 6 del
// roadmap de mejora, 2026-07-26). Corre, en este orden, las cuatro
// suites reales del repo y agrega el resultado:
//
//   1. motor-test.js               — lógica de negocio pura (212/212 conocido)
//   2. smoke-tests.js              — integridad de assets referenciados (Fase 0)
//   3. contract-tests.js           — contrato DOM↔JS + orden de carga (Fase 2)
//   4. ambiente-lifecycle-tests.js — ciclo de vida rAF/timers/listeners del
//                                    Ambient Engine (Fase 6)
//   5. coreografias-tests.js       — gramática/ritmo/fatiga/reentrada de las
//                                    coreografías reales de interfaz, y
//                                    regresión de slugs de fichas
//                                    (Motion Direction Bible v2.0, Parte M.2)
//   6. motor-comparacion-tests.js  — módulo puro del comparador inline
//                                    (Fase 4, Journey/UX, evolutivo A→C)
//
// Uso: `node js/run-tests.js`
// Sale con código 0 solo si las seis suites pasan.

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const SUITES = ['motor-test.js', 'smoke-tests.js', 'contract-tests.js', 'ambiente-lifecycle-tests.js', 'coreografias-tests.js', 'motor-comparacion-tests.js'];

let algunoFallo = false;

SUITES.forEach((suite, i) => {
  const ruta = path.join(__dirname, suite);
  console.log('═'.repeat(70));
  console.log(`(${i + 1}/${SUITES.length}) node js/${suite}`);
  console.log('═'.repeat(70));

  const res = spawnSync(process.execPath, [ruta], { stdio: 'inherit' });

  if (res.status !== 0) {
    algunoFallo = true;
    console.error(`\n✗ ${suite} salió con código ${res.status}`);
  }
  console.log('');
});

console.log('═'.repeat(70));
if (algunoFallo) {
  console.error('RESULTADO FINAL: al menos una suite falló. Ver detalle arriba.');
  process.exit(1);
}
console.log(`RESULTADO FINAL: las ${SUITES.length} suites pasaron.`);
process.exit(0);

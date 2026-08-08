#!/usr/bin/env node
/*
 * scripts/listar-bundles-verificables.js
 * ---------------------------------------------------------------------
 * Antes de FASE 5.1 (2026-08-08), tanto .github/workflows/
 * verificar-bundles.yml como .husky/pre-commit tenían la misma lista
 * de 4 archivos generados hardcodeada por separado en bash. Al agregar
 * los 20 js/<modulo>.min.js de build-app-modules-min.js, esa lista
 * hardcodeada NO los iba a incluir en ninguno de los dos lugares —
 * o sea que podían quedar desactualizados en producción sin que CI ni
 * el pre-commit hook lo detectaran nunca, exactamente el riesgo que
 * verificar-bundles.yml existe para eliminar (ver su propio comentario,
 * PERFORMANCE_AUDIT.md §6).
 *
 * Este script es la única fuente de verdad de "qué archivos generados
 * deben estar commiteados y al día". Tanto el workflow como el hook
 * lo consumen en vez de mantener su propia copia de la lista.
 *
 * Uso:
 *   node scripts/listar-bundles-verificables.js
 *   (imprime una ruta relativa al repo por línea)
 */
'use strict';

const path = require('path');
const { MODULOS } = require('./lib/modulos-app');

const JS_DIR = 'donde-comer-cdu/js';

const ARCHIVOS = [
  `${JS_DIR}/motor.bundle.js`,
  `${JS_DIR}/ambiente.bundle.js`,
  `${JS_DIR}/app.min.js`,
  'donde-comer-cdu/css/critical.bundle.css',
  ...MODULOS.map((m) => path.posix.join(JS_DIR, m.replace(/\.js$/, '.min.js'))),
];

ARCHIVOS.forEach((f) => console.log(f));

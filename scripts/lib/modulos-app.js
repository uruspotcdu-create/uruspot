#!/usr/bin/env node
/*
 * scripts/lib/modulos-app.js
 * ---------------------------------------------------------------------
 * Fuente única de verdad de los módulos ES que importa js/app.js
 * (directo, o transitivo vía search.js -> cache.js).
 *
 * Por qué existe este archivo: antes de esto, MODULOS y la lógica de
 * reescritura de imports vivían duplicadas dentro de
 * build-app-modules-min.js. Cuando build-app-min.js necesitó la MISMA
 * lista para reescribir los imports de app.js hacia las versiones
 * .min.js, copiar y pegar la constante hubiera creado dos listas que
 * mantener sincronizadas a mano — exactamente el tipo de drift que
 * verificar-bundles.yml existe para atrapar en los .js generados, pero
 * que NO puede atrapar en una constante de código fuente. Un solo
 * archivo fuente elimina la posibilidad de que diverjan.
 *
 * Usado por:
 *   - scripts/build-app-modules-min.js (genera <modulo>.min.js)
 *   - scripts/build-app-min.js         (reescribe los imports de
 *                                        app.min.js hacia esos .min.js)
 *   - scripts/listar-bundles-verificables.js (lista qué archivos
 *                                        generados debe vigilar CI/
 *                                        pre-commit)
 */
'use strict';

// Los 19 módulos que importa app.js directamente + cache.js, que NO
// aparece en los imports de app.js pero sí lo importa search.js
// (dependencia transitiva) — confirmado con grep antes de escribir
// esta lista, no es una suposición. Ver también: ningún módulo de
// esta lista importa nada fuera de la lista (verificado grepeando los
// imports internos de los 20 archivos), así que la cadena queda
// completa de punta a punta sin eslabones sueltos sin minificar.
const MODULOS = [
  'app-coordinator.js',
  'cache.js',
  'catalog.js',
  'climate-context.js',
  'constants.js',
  'data-loader.js',
  'dom-painter.js',
  'error-recovery.js',
  'event-bus.js',
  'favorites.js',
  'geolocation.js',
  'keyboard-nav.js',
  'listeners.js',
  'map-module.js',
  'pure-utils.js',
  'render-engine.js',
  'scroll-reveal.js',
  'search.js',
  'state-manager.js',
  'ui-state.js',
];

/**
 * Reescribe, dentro de `codigo`, cualquier import relativo
 * './<modulo>.js' hacia './<modulo>.min.js', para cada módulo en la
 * lista. Usa límites exactos (nombre completo entre comillas) para
 * evitar falsos positivos tipo 'render-engine.js' matcheando
 * 'render-engine-tests.js'.
 */
function reescribirImportsAMin(codigo, modulos = MODULOS) {
  let salida = codigo;
  for (const modulo of modulos) {
    const nombreSinExt = modulo.replace(/\.js$/, '');
    const patron = new RegExp(`(['"\`]\\./${nombreSinExt})\\.js(['"\`])`, 'g');
    salida = salida.replace(patron, `$1.min.js$2`);
  }
  return salida;
}

module.exports = { MODULOS, reescribirImportsAMin };

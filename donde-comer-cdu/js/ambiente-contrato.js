/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-contrato.js
   Etapa 2 (Roadmap A+B — Contrato común)

   Subsistema del Grupo de Infraestructura. Responsabilidad única:
   describir y validar la FORMA que todo módulo ambiente-*.js deberá
   cumplir cuando se migre al orquestador con fidelidad real +
   desacople de frecuencias (Etapas 3-5 de este roadmap), y que ya
   queda pre-adaptada, sin costo extra hoy, a un futuro scheduler por
   tareas (fase C).

   Esta etapa SOLO define el contrato. Ningún módulo visual se migra
   todavía (eso es la Etapa 3, empezando por ambiente-clima.js) — este
   archivo no tiene ningún efecto sobre el comportamiento actual del
   motor: nadie lo consume todavía.

   La forma exacta que un módulo debe exponer para ser válido:

     {
       id: 'clima',                 // string único, para logging/diagnóstico
       tier: 'visual',               // 'core' | 'visual'
       frequency: 'full',            // 'full' | 'reduced' | 'static'
       isActive: function (fidelidad) { ... },  // boolean
       step:     function (dt, sharedState) { ... },  // cómputo puro
       read:     function () { ... }            // último estado calculado
     }

   Decisiones de diseño (por qué esta forma y no otra):

   - tier existe separado de frequency a propósito: tier describe SI
     un módulo puede apagarse (nunca 'core'), frequency describe CADA
     CUÁNTO corre mientras esté activo. Son dos preguntas distintas —
     colapsarlas en un solo campo obligaría a inventar combinaciones
     como 'core-full'/'core-reduced' que en la práctica no existen hoy
     (Fondo y Luz son siempre 'core'+'full', ver Cap. 7.2 de
     ambiente-config.js), pero separar los ejes deja la puerta abierta
     sin tener que romper el contrato el día que sí exista un módulo
     'core'+'reduced'.
   - step(dt, sharedState) nunca debe escribir a DOM/CSS — solo
     calcular. read() es lo único que el futuro orquestador usa para
     obtener el resultado y escribirlo en un único batch (Etapa 5:
     writer único). Separar "calcular" de "leer" es lo que permite que
     un módulo con frequency:'reduced' calcule cada 50ms pero el
     writer igual pueda preguntarle su último resultado en cualquier
     frame, sin recalcular de más.
   - isActive(fidelidad) recibe el nivel de fidelidad como parámetro
     explícito (no lee AmbienteRendimiento por su cuenta) para que un
     módulo sea testeable de forma aislada, sin necesidad de mockear
     el Performance Manager completo — mismo criterio de "fácil de
     testear" pedido para este contrato.

   Refinamiento respecto del boceto original (documentado acá para
   que quede explícito, no aplicado en silencio): agrego valores por
   defecto (tier:'visual', frequency:'full') en crear() para que un
   módulo mínimo sin necesidades especiales no tenga que declarar los
   cinco campos completos — options si un dev migra un módulo nuevo y
   se olvida de `tier`, por ejemplo, el default más conservador
   ('visual', puede apagarse) es también el más seguro: preferible que
   se pueda apagar de más a que un olvido cree accidentalmente un
   módulo 'core' que nunca se apaga.

   No depende de ningún otro subsistema — es, a propósito, la primera
   pieza de infraestructura sin ningún estado ni lectura externa
   (más simple aún que ambiente-config.js, que si depende de sí mismo
   para congelar sus catálogos). Puede cargarse en cualquier punto del
   Grupo de Infraestructura; se ubica después de ambiente-config.js
   por afinidad temática (ambos son "forma de los datos", no
   comportamiento), no por una dependencia real.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var TIERS = ['core', 'visual'];
  var FRECUENCIAS = ['full', 'reduced', 'static'];

  var TIER_DEFECTO = 'visual';
  var FRECUENCIA_DEFECTO = 'full';

  function esFuncion(valor) { return typeof valor === 'function'; }
  function esStringNoVacio(valor) { return typeof valor === 'string' && valor.length > 0; }

  // Cap. 3.14 (mismo espíritu que ambiente-diagnostico.js): validar
  // no es lo mismo que decidir — esta función nunca lanza, nunca
  // apaga nada, solo informa. Quien construye el módulo (crear(), más
  // abajo, o un test) decide qué hacer con el resultado.
  function validar(definicion) {
    var errores = [];

    if (!definicion || typeof definicion !== 'object') {
      return { valido: false, errores: ['la definición debe ser un objeto'] };
    }
    if (!esStringNoVacio(definicion.id)) {
      errores.push('id debe ser un string no vacío');
    }
    if (definicion.tier !== undefined && TIERS.indexOf(definicion.tier) === -1) {
      errores.push('tier debe ser uno de: ' + TIERS.join(', '));
    }
    if (definicion.frequency !== undefined && FRECUENCIAS.indexOf(definicion.frequency) === -1) {
      errores.push('frequency debe ser uno de: ' + FRECUENCIAS.join(', '));
    }
    if (!esFuncion(definicion.isActive)) errores.push('isActive debe ser una función');
    if (!esFuncion(definicion.step)) errores.push('step debe ser una función');
    if (!esFuncion(definicion.read)) errores.push('read debe ser una función');

    return { valido: errores.length === 0, errores: errores };
  }

  // Aplica los valores por defecto documentados arriba sin mutar la
  // definición original — devuelve un objeto nuevo, mismo criterio de
  // inmutabilidad que el catálogo de ambiente-config.js.
  function conDefectos(definicion) {
    var copia = {};
    Object.keys(definicion || {}).forEach(function (clave) { copia[clave] = definicion[clave]; });
    if (copia.tier === undefined) copia.tier = TIER_DEFECTO;
    if (copia.frequency === undefined) copia.frequency = FRECUENCIA_DEFECTO;
    return copia;
  }

  // Punto de entrada pensado para que cada ambiente-*.js migrado (a
  // partir de la Etapa 3) lo use así:
  //
  //   global.AmbienteClima = AmbienteContrato.crear({
  //     id: 'clima', frequency: 'reduced',
  //     isActive: function (fidelidad) { ... },
  //     step: function (dt, sharedState) { ... },
  //     read: function () { ... }
  //   });
  //
  // Una definición inválida NUNCA rompe el arranque (Cap. 1.4: mejor
  // no tener el módulo que tenerlo roto compitiendo con contenido
  // real) — se loggea a consola en vez de lanzar, y se devuelve tal
  // cual (con los defaults aplicados) para que el resto del sistema
  // decida cómo degradar, igual que ya hace ambiente-config.js con
  // obtenerEscena() ante un id desconocido.
  function crear(definicion) {
    var completa = conDefectos(definicion);
    var resultado = validar(completa);
    if (!resultado.valido && typeof console !== 'undefined' && console.warn) {
      console.warn(
        '[AmbienteContrato] módulo "' + (completa.id || '(sin id)') + '" no cumple el contrato: ' +
        resultado.errores.join('; ')
      );
    }
    return completa;
  }

  global.AmbienteContrato = {
    TIERS: TIERS,
    FRECUENCIAS: FRECUENCIAS,
    validar: validar,
    crear: crear
  };

})(window);


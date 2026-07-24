/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-rendimiento.js
   Fase 2: Performance Manager (Arquitectura técnica, Cap. 3.10 / 9.6 / 9.7)

   Subsistema del Grupo de Gobierno. Responsabilidad única: monitorear
   la capacidad del dispositivo y el rendimiento real en tiempo de
   ejecución, y determinar el nivel de fidelidad activo (Cap. 9.6) —
   un valor único y discreto que el futuro Motion Controller consulta
   antes de generar cualquier parámetro visual.

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 3.10 — "no decide contenido visual, solo impone límites
     cuantitativos". Este archivo nunca importa ni menciona ninguna
     capa del Grupo de Contenido Visual; solo expone un nivel de
     fidelidad y deja que el (futuro) Motion Controller lo traduzca.
   - Cap. 3.10 — "nunca debe comunicarse directamente con ningún
     subsistema del Grupo de Contenido Visual". Su única
     comunicación de escritura hacia otro subsistema es hacia
     AmbienteAssets.establecerTamanoCache(), explícitamente prevista
     para el Performance Manager en el Cap. 8.3.
     Su única dependencia de lectura es AmbienteConfig (Cap. 9.6:
     "niveles de fidelidad... definidos de antemano en el
     Configuration System") y su única dependencia de escritura de
     registro es AmbienteDiagnostico (Cap. 3.10: "Dependencias:
     Diagnostics & Telemetry").
   - Cap. 9.2 — el muestreo de FPS se detiene por completo cuando la
     pestaña no está visible; no debe existir ciclo de animación
     ejecutándose en segundo plano.
   - Cap. 9.6 / 9.7 — los cambios de nivel son siempre saltos a un
     nivel discreto completo (nunca un ajuste continuo de un solo
     parámetro), y con histéresis: degradar exige menos ciclos
     consecutivos que recuperar (Cap. 9.6 Arquitectura vía
     AmbienteConfig.RENDIMIENTO), para no oscilar en el límite.

   Debe cargarse después del Grupo de Infraestructura completo
   (ambiente-config.js, ambiente-assets.js, ambiente-diagnostico.js).
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // Orden ascendente de expresividad — se usa para mover el índice
  // ±1 al degradar o recuperar, nunca para saltar más de un nivel a
  // la vez (Cap. 9.7: "configuración completa y deliberada", nunca
  // un salto brusco de dos niveles de una sola vez).
  var ORDEN_NIVELES = ['minima', 'reducida', 'completa'];

  function config() { return global.AmbienteConfig || null; }
  function diagnostico() { return global.AmbienteDiagnostico || null; }
  function assets() { return global.AmbienteAssets || null; }

  // ── Heurística de capacidad de dispositivo ──────────────────────
  // Umbrales leídos de AmbienteConfig.DISPOSITIVO (Cap. 9.6: nunca
  // literales sueltos en el propio subsistema). Es deliberadamente
  // una señal de partida barata, no una medición real — el muestreo
  // de FPS real es lo que gobierna después de los primeros segundos.
  function estimarCapacidadDispositivo() {
    var c = config();
    var umbral = c ? c.DISPOSITIVO : { nucleosBajo: 2, nucleosMedio: 4, memoriaBajoGb: 2, memoriaMedioGb: 4 };
    var nucleos = (global.navigator && global.navigator.hardwareConcurrency) || 4;
    var memoria = (global.navigator && global.navigator.deviceMemory) || 4;
    if (nucleos <= umbral.nucleosBajo || memoria <= umbral.memoriaBajoGb) return 'bajo';
    if (nucleos <= umbral.nucleosMedio || memoria <= umbral.memoriaMedioGb) return 'medio';
    return 'alto';
  }

  // Punto de partida conservador antes de tener muestras reales de
  // FPS: un dispositivo de gama baja arranca ya en 'reducida' en
  // lugar de esperar a que el sistema tropiece varios frames para
  // recién entonces degradar.
  function nivelInicialSegunDispositivo() {
    return estimarCapacidadDispositivo() === 'bajo' ? 'reducida' : 'completa';
  }

  var capacidadDispositivo = estimarCapacidadDispositivo();
  var nivelActual = nivelInicialSegunDispositivo();
  var listeners = [];

  function pestanaVisible() {
    return (typeof document !== 'undefined') ? !document.hidden : true;
  }

  function indiceNivel(nombre) { return ORDEN_NIVELES.indexOf(nombre); }

  function emitirCambioNivel(anterior, actual) {
    listeners.forEach(function (cb) {
      try { cb({ anterior: anterior, actual: actual }); }
      catch (e) { /* un listener roto no debe tumbar al resto */ }
    });
  }

  function aplicarTamanoCache(nivel) {
    var a = assets();
    if (!a) return;
    // Proporcional al tamaño por defecto de la caché caliente
    // (Cap. 8.3: "un parámetro gestionado por el Performance
    // Manager, que puede reducirlo bajo restricciones de memoria").
    var proporcion = { completa: 1, reducida: 0.65, minima: 0.35 }[nivel] || 1;
    a.establecerTamanoCache(Math.max(4, Math.round(24 * proporcion)));
  }

  function cambiarNivel(nuevoNivel) {
    if (nuevoNivel === nivelActual) return;
    var anterior = nivelActual;
    nivelActual = nuevoNivel;
    aplicarTamanoCache(nivelActual);
    var d = diagnostico();
    if (d) d.registrarCambioFidelidad(nivelActual);
    emitirCambioNivel(anterior, nivelActual);
  }

  // ── Muestreo real de FPS (Cap. 9.6: "un valor único... consultado
  // antes de generar cualquier parámetro") ────────────────────────
  var rafId = null;
  var ultimoFrame = null;
  var inicioVentana = null;
  var framesEnVentana = 0;
  var contadorDegradar = 0;
  var contadorRecuperar = 0;

  function umbralesRendimiento() {
    var c = config();
    return c ? c.RENDIMIENTO : {
      fpsUmbralReducida: 45, fpsUmbralMinima: 30, ventanaMuestreoMs: 4000,
      ciclosConsecutivosParaDegradar: 3, ciclosConsecutivosParaRecuperar: 6
    };
  }

  function evaluarVentana(fpsPromedio) {
    var u = umbralesRendimiento();
    var d = diagnostico();
    if (d) d.registrarFPS(fpsPromedio);

    var bajo = false;
    var alto = false;

    if (nivelActual === 'completa') {
      bajo = fpsPromedio < u.fpsUmbralReducida;
    } else if (nivelActual === 'reducida') {
      bajo = fpsPromedio < u.fpsUmbralMinima;
      alto = fpsPromedio >= u.fpsUmbralReducida;
    } else { // minima
      alto = fpsPromedio >= u.fpsUmbralMinima;
    }

    contadorDegradar = bajo ? contadorDegradar + 1 : 0;
    contadorRecuperar = alto ? contadorRecuperar + 1 : 0;

    if (contadorDegradar >= u.ciclosConsecutivosParaDegradar) {
      var idxAbajo = indiceNivel(nivelActual) - 1;
      if (idxAbajo >= 0) cambiarNivel(ORDEN_NIVELES[idxAbajo]);
      contadorDegradar = 0;
      contadorRecuperar = 0;
    } else if (contadorRecuperar >= u.ciclosConsecutivosParaRecuperar) {
      var idxArriba = indiceNivel(nivelActual) + 1;
      if (idxArriba < ORDEN_NIVELES.length) cambiarNivel(ORDEN_NIVELES[idxArriba]);
      contadorDegradar = 0;
      contadorRecuperar = 0;
    }
  }

  function pasoFrame(marcaTiempo) {
    // Cap. 9.2: ningún ciclo de animación debe seguir corriendo en
    // segundo plano. Si la pestaña deja de ser visible a mitad de
    // ventana, se descarta la ventana en curso en lugar de
    // computarla con un hueco de tiempo real oculto.
    if (!pestanaVisible()) {
      ultimoFrame = null;
      inicioVentana = null;
      framesEnVentana = 0;
      rafId = global.requestAnimationFrame(pasoFrame);
      return;
    }

    if (ultimoFrame === null) {
      ultimoFrame = marcaTiempo;
      inicioVentana = marcaTiempo;
      framesEnVentana = 0;
      rafId = global.requestAnimationFrame(pasoFrame);
      return;
    }

    framesEnVentana += 1;
    ultimoFrame = marcaTiempo;

    var u = umbralesRendimiento();
    var transcurrido = marcaTiempo - inicioVentana;
    if (transcurrido >= u.ventanaMuestreoMs) {
      var fpsPromedio = (framesEnVentana / transcurrido) * 1000;
      evaluarVentana(fpsPromedio);
      inicioVentana = marcaTiempo;
      framesEnVentana = 0;
    }

    rafId = global.requestAnimationFrame(pasoFrame);
  }

  var api = {
    get nivelFidelidad() { return nivelActual; },
    get capacidadDispositivo() { return capacidadDispositivo; },
    get pestanaVisible() { return pestanaVisible(); },

    // Cap. 9.6: el conjunto completo de multiplicadores del nivel
    // activo, resuelto contra AmbienteConfig — lo que el futuro
    // Motion Controller efectivamente consulta.
    restricciones: function () {
      var c = config();
      return c ? c.obtenerNivelFidelidad(nivelActual) : null;
    },

    // Suscripción a cambios de nivel. cb({anterior, actual}).
    suscribir: function (cb) {
      if (typeof cb !== 'function') return function () {};
      listeners.push(cb);
      return function desuscribir() {
        var idx = listeners.indexOf(cb);
        if (idx > -1) listeners.splice(idx, 1);
      };
    },

    iniciar: function () {
      if (rafId !== null) return; // idempotente
      if (typeof global.requestAnimationFrame !== 'function') return;
      var a = assets();
      if (a) aplicarTamanoCache(nivelActual); // aplica el punto de partida ya al arrancar
      rafId = global.requestAnimationFrame(pasoFrame);
    },

    // Solo para pruebas / apagado explícito (por ejemplo, la app
    // pasa a segundo plano de forma prolongada y decide liberar el
    // ciclo de muestreo por completo, no solo pausarlo un frame).
    detener: function () {
      if (rafId !== null && typeof global.cancelAnimationFrame === 'function') {
        global.cancelAnimationFrame(rafId);
      }
      rafId = null;
      ultimoFrame = null;
      inicioVentana = null;
      framesEnVentana = 0;
    }
  };

  global.AmbienteRendimiento = api;

  api.iniciar();

})(window);

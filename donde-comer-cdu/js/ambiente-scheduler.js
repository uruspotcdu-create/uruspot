/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-scheduler.js
   Etapa 5 (Roadmap A+B — Writer único / Frame Scheduler)

   Subsistema del Grupo de Infraestructura. Responsabilidad única:
   ser el ÚNICO lugar del motor con un `requestAnimationFrame`
   permanente (mientras la pestaña esté visible) — antes de este
   archivo, ambiente-rendimiento.js y ambiente-respiracion.js corrían
   CADA UNO su propio rAF para siempre, cada uno con su propia copia
   casi idéntica de la lógica de pausa/reanudación por
   `visibilitychange` (Cap. 9.2: "no debe existir ciclo de animación
   ejecutándose en segundo plano"). Este archivo colapsa ambos loops
   en uno solo y esa lógica de pausa duplicada en una sola
   implementación.

   No decide QUÉ hace cada tarea registrada — es agnóstico de
   contenido (Cap. 3.10 / 3.4: la separación por responsabilidad única
   ya vigente en el resto del motor). Cada módulo que se registra le
   entrega una función `paso(timestamp)` ya "pura" en el sentido de
   que nunca vuelve a pedir su propio frame — el scheduler es quien
   decide cuándo se vuelve a llamar, no la propia tarea.

   Por qué gap-detection en vez de que cada tarea siga gestionando su
   propia pausa: con un solo rAF compartido, cuando la pestaña se
   oculta este archivo dejar de pedir frames por completo — ninguna
   tarea registrada vuelve a ejecutarse hasta que la pestaña reaparece.
   Eso significa que la PRÓXIMA vez que una tarea reciba un timestamp,
   el salto respecto de su última marca puede ser de minutos, no de
   16ms. Cada tarea es responsable de detectar ese salto anómalo
   (comparar contra un umbral, p.ej. 500ms — muy por encima de un
   frame real, muy por debajo de cualquier segundo plano real) y
   tratarlo como "primer frame tras reanudar" en vez de computar un
   delta falso — mismo criterio que antes vivía en cada rAF propio
   (`ultimoFrame = null` al pausar), solo que ahora la tarea lo decide
   sola, sin necesitar su propio listener de visibilidad.

   Debe cargarse después de ambiente-contrato.js (afinidad temática:
   ambos son infraestructura de forma, sin estado propio de negocio)
   y antes de cualquier módulo que vaya a registrarse — hoy
   ambiente-rendimiento.js (que se autoinicia al cargarse) es el
   primer consumidor, así que este archivo debe cargar antes que ese.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var tareas = Object.create(null);
  var orden = [];
  var rafId = null;
  var pausadoPorVisibilidad = false;
  var listenerRegistrado = false;

  function pestanaVisible() {
    return (typeof document !== 'undefined') ? !document.hidden : true;
  }

  // Un solo rAF, un solo bucle: recorre las tareas registradas en
  // orden de registro (nunca por prioridad implícita — quien necesite
  // orden estricto lo declara explícitamente en su propio nombre de
  // registro). Cap. 3.4 en ambiente-movimiento.js ya documenta este
  // mismo criterio de aislamiento: "un listener roto no debe tumbar
  // al resto" — acá aplica igual, una tarea que tira excepción no
  // debe frenar el frame de las demás.
  function tick(timestamp) {
    if (!pestanaVisible()) {
      pausadoPorVisibilidad = true;
      rafId = null; // detenido, no reprogramado (Cap. 9.2)
      return;
    }
    rafId = global.requestAnimationFrame(tick);
    for (var i = 0; i < orden.length; i++) {
      var fn = tareas[orden[i]];
      if (fn) {
        try { fn(timestamp); }
        catch (e) { /* una tarea rota no debe tumbar al resto del frame */ }
      }
    }
  }

  function alCambiarVisibilidad() {
    if (pestanaVisible() && pausadoPorVisibilidad && rafId === null) {
      pausadoPorVisibilidad = false;
      rafId = global.requestAnimationFrame(tick);
    }
  }

  function asegurarLoopActivo() {
    if (rafId !== null) return;
    if (typeof global.requestAnimationFrame !== 'function') return;
    if (orden.length === 0) return; // nada que correr todavía
    rafId = global.requestAnimationFrame(tick);
    if (!listenerRegistrado && typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      listenerRegistrado = true;
      document.addEventListener('visibilitychange', alCambiarVisibilidad);
    }
  }

  var api = {
    // registrar(id, paso): paso(timestamp) se llama en TODOS los
    // frames visibles hasta que se llame al desregistrador devuelto.
    // Arranca el loop compartido si es la primera tarea (idempotente
    // si el loop ya estaba corriendo). id solo para diagnóstico/orden
    // estable — dos registros con el mismo id se pisan a propósito
    // (mismo criterio que listeners.indexOf en el resto del motor: la
    // última suscripción gana).
    registrar: function (id, paso) {
      if (typeof id !== 'string' || !id || typeof paso !== 'function') return function () {};
      if (!tareas[id]) orden.push(id);
      tareas[id] = paso;
      asegurarLoopActivo();
      return function desregistrar() {
        if (tareas[id] !== paso) return; // ya reemplazada por otro registro, no tocar
        delete tareas[id];
        var idx = orden.indexOf(id);
        if (idx > -1) orden.splice(idx, 1);
      };
    },

    // Diagnóstico de solo lectura — ningún módulo debería necesitar
    // esto en operación normal.
    get tareasActivas() { return orden.slice(); },
    get corriendo() { return rafId !== null; }
  };

  global.AmbienteScheduler = api;

})(window);

/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-capa-fondo.js
   Fase 1: Capa de Fondo (Documento de diseño, Cap. 4.1)

   Responsabilidad única: definir el color y la luz general de la
   escena según la hora real del día. Es, conceptualmente, "el cielo"
   de todo el sistema (Cap. 4.1) — no contiene formas ni detalle, y
   no conoce escenas, estados ni ninguna otra capa (Cap. 4.9 / 11.3).

   Reglas de este documento que este módulo respeta explícitamente:
   - Banda ambiental, 20-90s por ciclo, imperceptible en el instante
     (Cap. 3.1) — acá el "ciclo" es el día completo, y el muestreo
     (cada 60s) es deliberadamente más lento que cualquier banda de
     movimiento para no producir un cambio que el ojo pueda seguir.
   - Curva de aceleración no lineal, nunca lineal (Cap. 3.2) — la
     interpolación de color usa un easing coseno, no una mezcla
     lineal de RGB.
   - Continuidad (Cap. 3.3) — al abrir la app, el fondo se posiciona
     de inmediato en el punto correcto del ciclo horario real, nunca
     arranca desde un valor por defecto y "salta" al correcto.
   - Cap. 9.2 — no se anima nada mientras la pestaña no es visible.
   - Cap. 9.5 — bajo prefers-reduced-motion, el cambio de color del
     ciclo horario se mantiene (es color, no movimiento) pero se
     aplica de forma instantánea en lugar de gradual.

   Fase 2 (Cap. 2.3 Arquitectura): "el Grupo de Contenido Visual...
   nunca [se comunica] lateralmente" con el Grupo de Gobierno — por eso
   este módulo ya no lee la visibilidad de pestaña de una señal cruda
   propia ni de un subsistema de Gobierno directamente, sino del Motion
   Controller (ambiente-movimiento.js), su única dependencia hacia
   arriba (Cap. 3.5: "Entradas:... provenientes del Motion
   Controller").
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // Paletas clave del ciclo diario (hora, color superior, color
  // inferior del degradé). Los tonos parten de --color-fondo /
  // --color-fondo-2 ya existentes en css/tokens.css y se abren hacia
  // cálidos en el atardecer, coherente con --color-granate-clara —
  // nunca se sale de la identidad de marca ya establecida (Cap. 2.1:
  // "físico, no digital-abstracto"; Cap. 5.9: atardecer como el
  // momento de mayor calidez cromática del ciclo).
  var KEYFRAMES = [
    { h: 0,  c1: '#05070B', c2: '#0A0D13' }, // noche profunda
    { h: 6,  c1: '#141A24', c2: '#2A2018' }, // amanecer
    { h: 13, c1: '#10141C', c2: '#1B2230' }, // día
    { h: 19, c1: '#2A1620', c2: '#4A2530' }, // atardecer (Cap. 5.9)
    { h: 22, c1: '#06080D', c2: '#0A0D13' }, // entrando en noche
    { h: 24, c1: '#05070B', c2: '#0A0D13' }  // cierre del loop (== hora 0)
  ];

  // Cap. 3.1: prohibida la mezcla lineal en cualquier movimiento
  // visible — un ease-in-out senoidal es el recurso explícito para
  // "fenómenos naturales como la deriva de una nube o el vaivén del
  // agua", y el paso del día se rige por el mismo principio.
  function easeCoseno(t) { return (1 - Math.cos(t * Math.PI)) / 2; }

  function hexARgb(hex) {
    var v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function componenteAHex(n) {
    var v = Math.max(0, Math.min(255, Math.round(n)));
    var s = v.toString(16);
    return s.length < 2 ? '0' + s : s;
  }
  function rgbAHex(rgb) {
    return '#' + componenteAHex(rgb[0]) + componenteAHex(rgb[1]) + componenteAHex(rgb[2]);
  }
  function mezclarColor(hexA, hexB, t) {
    var a = hexARgb(hexA), b = hexARgb(hexB), tt = easeCoseno(t);
    return rgbAHex([
      a[0] + (b[0] - a[0]) * tt,
      a[1] + (b[1] - a[1]) * tt,
      a[2] + (b[2] - a[2]) * tt
    ]);
  }

  function colorEnHora(horaDecimal) {
    var h = ((horaDecimal % 24) + 24) % 24;
    for (var i = 0; i < KEYFRAMES.length - 1; i++) {
      var a = KEYFRAMES[i], b = KEYFRAMES[i + 1];
      if (h >= a.h && h <= b.h) {
        var t = (h - a.h) / (b.h - a.h);
        return { c1: mezclarColor(a.c1, b.c1, t), c2: mezclarColor(a.c2, b.c2, t) };
      }
    }
    return { c1: KEYFRAMES[0].c1, c2: KEYFRAMES[0].c2 };
  }

  function horaDecimalActual() {
    var ahora = new Date();
    return ahora.getHours() + ahora.getMinutes() / 60 + ahora.getSeconds() / 3600;
  }

  var elFondo = null;

  function crearElemento() {
    var el = document.createElement('div');
    el.id = 'ambiente-fondo';
    // Puramente decorativo: nunca debe estar en el árbol de
    // accesibilidad ni recibir foco o interacción (Cap. 4.1).
    el.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(el, document.body.firstChild);
    return el;
  }

  function aplicar(horaDecimal, instantaneo) {
    var color = colorEnHora(horaDecimal);
    if (instantaneo) elFondo.classList.add('ambiente-fondo--sin-transicion');
    elFondo.style.setProperty('--ambiente-color-1', color.c1);
    elFondo.style.setProperty('--ambiente-color-2', color.c2);
    if (instantaneo) {
      void elFondo.offsetHeight; // forzar reflow antes de reactivar la transición
      elFondo.classList.remove('ambiente-fondo--sin-transicion');
    }
  }

  // Cap. 3.1: el ciclo se muestrea cada minuto — muy por debajo del
  // umbral de percepción consciente de cualquier cambio individual,
  // y muy por encima del techo de la banda ambiental (90s), que está
  // pensada para elementos que sí tienen movimiento propio visible.
  var PERIODO_MUESTREO_MS = 60000;
  var intervalo = null;

  function tick() {
    var m = global.AmbienteMovimiento;
    if (m && !m.pestanaVisible) return; // Cap. 9.2: nada se anima en 2º plano
    aplicar(horaDecimalActual(), false);
  }

  function iniciar() {
    if (elFondo) return; // ya inicializada
    elFondo = crearElemento();

    // Continuidad (Cap. 3.3): el primer aplicado es instantáneo para
    // que la app abra ya en el punto correcto del ciclo horario real,
    // sin arrancar de un valor por defecto y saltar visiblemente.
    aplicar(horaDecimalActual(), true);

    intervalo = global.setInterval(tick, PERIODO_MUESTREO_MS);

    if (global.AmbienteMovimiento) {
      global.AmbienteMovimiento.suscribir(function (evento) {
        if (evento.motivo === 'visibilidad' && global.AmbienteMovimiento.pestanaVisible) {
          // Al volver a primer plano, re-sincronizar sin animar el
          // salto de tiempo transcurrido mientras estuvo oculta
          // (evita una transición larga y visible de "recuperación").
          aplicar(horaDecimalActual(), true);
        }
      });
    }
  }

  global.AmbienteCapaFondo = { iniciar: iniciar };

})(window);


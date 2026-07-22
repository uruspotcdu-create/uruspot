/* URU SPOT — metadatos de rubros. Sin lógica de arquitectura: es
   contenido (nombres, descripciones, color e ícono de identificación
   en el mapa), igual que antes vivía dentro de fase4-motor.js. Se
   separa para que app.js, el motor de mapa y las páginas de índice de
   rubros lo compartan sin duplicar el objeto.

   Formato de cada entrada: [nombre, descripción, colorMapa, icono]

   `icono` es un único string de datos de trazo SVG (atributo `d`),
   dibujado sobre una grilla de 24×24 con viewBox 0 0 24 24, pensado
   para renderizarse SIN relleno (`fill:none`) y con trazo de grosor
   uniforme (ver ICONO_GROSOR más abajo) — la misma convención en
   todo el set: mismo peso de línea, mismos remates redondeados, mismo
   nivel de detalle. Es intencional que sea UN string por rubro (no un
   set de primitivas por separado): un solo `d` es consumible tal cual
   tanto por un <path> SVG en el DOM como por `new Path2D(d)` en un
   <canvas>, sin parseo propio ni librería de íconos — misma fuente,
   dos motores de render (ver URU_RUBROS_ICONO_SVG más abajo para el
   lado DOM, y motor-render.js/dibujarPictogramaRubro para el lado
   canvas).

   No se copiaron paths de ninguna librería de íconos existente: cada
   uno se dibujó desde cero para esta grilla y este peso de línea,
   como lenguaje visual propio de URU SPOT (ver nota de estilo al
   pie del archivo). */
(function (global) {
  'use strict';

  // Grilla y grosor de trazo compartidos por los 14 pictogramas — si
  // el peso visual del set necesita ajustarse, se toca UNA vez acá,
  // no rubro por rubro.
  var ICONO_VIEWBOX = 24;
  var ICONO_GROSOR = 1.75;

  global.URU_RUBROS_META = {
    alojamiento:        ['Alojamiento', 'hospedaje verificado puerta a puerta', '#E0C46C',
      'M4 19V6 M4 10h15a2 2 0 0 1 2 2v7 M4 17h17 M8 10V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v3'],
    belleza:            ['Belleza', 'peluquerías, barberías y centros de estética', '#C58FCE',
      'M7.5 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z M16.5 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z M9 14.5 19 5 M15 14.5 5 5'],
    compras:            ['Compras', 'comercios, desde kioscos hasta grandes superficies', '#D9A05B',
      'M6 8h12l-1 12.5a1.5 1.5 0 0 1-1.5 1.5h-7a1.5 1.5 0 0 1-1.5-1.5L6 8Z M9 8V6.5a3 3 0 0 1 6 0V8'],
    deporte:            ['Deporte', 'clubes, gimnasios y espacios para moverse', '#E8A33D',
      'M3.5 12h17 M3.5 9v6 M20.5 9v6 M7 6.5v11 M17 6.5v11'],
    educacion:          ['Educación', 'escuelas, institutos y academias', '#7EA6E0',
      'M3 9.5 12 5l9 4.5-9 4.5-9-4.5Z M7 11.7v3.8c0 1.4 2.5 2.5 5 2.5s5-1.1 5-2.5v-3.8 M21 9.5v6'],
    finanzas:           ['Finanzas', 'bancos, financieras y casas de cambio', '#6FA8DC',
      'M3 10 12 4l9 6 M4 10v9.5 M8 10v9.5 M12 10v9.5 M16 10v9.5 M20 10v9.5 M3.5 20.5h17'],
    gastronomia:        ['Gastronomía', 'restaurantes, bares y rotiserías', '#C97A83',
      'M6 3v6 M7.5 3v6 M9 3v6 M6 9a1.5 1.5 0 0 0 1.5 1.5A1.5 1.5 0 0 0 9 9 M7.5 10.5V21 M17 3c-2 0-3.5 2-3.5 4.5S15 12 17 12 M17 3v18'],
    mascotas:           ['Mascotas', 'veterinarias y pet shops', '#8FBF7F',
      'M12 15.3c-2.6 0-4.6 1.8-4.6 4.1 0 1 .9 1.8 1.9 1.5.8-.2 1.7-.4 2.7-.4s1.9.2 2.7.4c1 .3 1.9-.5 1.9-1.5 0-2.3-2-4.1-4.6-4.1Z M7.3 12.2a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8Z M16.7 12.2a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8Z M9.6 8.1a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4Z M14.4 8.1a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4Z'],
    naturaleza:         ['Naturaleza', 'plazas, costaneras y espacios verdes', '#6FBF8B',
      'M12 3 8 9.5h2.3L6.8 15h2.6L6 20.5h12l-3.4-5.5h2.6L13.7 9.5H16Z M12 20.5v1.5'],
    oficios_tecnicos:   ['Oficios técnicos', 'electricistas, plomeros, gasistas y afines', '#ABAFB8',
      'M14.7 6.3a3.8 3.8 0 1 0-5.1 5.4L4 17.3l2.7 2.7 5.6-5.6a3.8 3.8 0 0 0 5.1-5.4l-2.6 2.6-2.7-2.7Z'],
    patrimonio:         ['Patrimonio', 'sitios históricos y culturales', '#C9A15A',
      'M5.5 20.5V11a6.5 6.5 0 0 1 13 0v9.5 M4 20.5h16 M9.5 20.5v-6h5v6'],
    salud:              ['Salud', 'consultorios, farmacias y centros médicos', '#7FC8A9',
      'M9 3.5h6v5.5h5.5v6H15v5.5H9V15H3.5V9H9Z'],
    servicios_publicos: ['Servicios públicos', 'trámites, correo y organismos', '#8296B0',
      'M4 6.5h16v11H4Z M4 6.5 12 13l8-6.5'],
    transporte:         ['Transporte', 'remises, terminales y estaciones', '#D98B5F',
      'M4.5 16 5.7 10.5a1.5 1.5 0 0 1 1.5-1.2h9.6a1.5 1.5 0 0 1 1.5 1.2L19.5 16 M3.5 16h17v3.5H3.5Z M7.5 19.5a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4Z M16.5 19.5a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4Z']
  };

  // Se exponen viewBox/grosor porque cualquier consumidor (canvas o
  // DOM) necesita conocerlos para escalar el ícono correctamente —
  // hardcodearlos de nuevo en motor-render.js sería la misma fuente
  // de verdad duplicada en dos archivos.
  global.URU_RUBROS_ICONO_VIEWBOX = ICONO_VIEWBOX;
  global.URU_RUBROS_ICONO_GROSOR = ICONO_GROSOR;

  // Renderer DOM compartido: cualquier superficie HTML (chips, leyenda
  // del mapa, y a futuro tarjetas/fichas/filtros) pide el mismo
  // <svg> acá en vez de rearmar el markup por su cuenta. `stroke`
  // usa currentColor por defecto para poder gobernar el color 100%
  // desde CSS (mismo patrón que ya usa el sitio con --chip-color),
  // sin tener que regenerar el string si cambia el estado (hover,
  // activo, foco).
  global.URU_RUBROS_ICONO_SVG = function (rubroKey, opts) {
    var meta = global.URU_RUBROS_META && global.URU_RUBROS_META[rubroKey];
    if (!meta || !meta[3]) return '';
    opts = opts || {};
    var tam = opts.tam || 14;
    var color = opts.color || 'currentColor';
    var claseExtra = opts.clase ? ' ' + opts.clase : '';
    return '<svg class="rubro-icono' + claseExtra + '" width="' + tam + '" height="' + tam +
      '" viewBox="0 0 ' + ICONO_VIEWBOX + ' ' + ICONO_VIEWBOX + '" fill="none" stroke="' + color +
      '" stroke-width="' + ICONO_GROSOR + '" stroke-linecap="round" stroke-linejoin="round"' +
      ' aria-hidden="true" focusable="false"><path d="' + meta[3] + '"/></svg>';
  };

  /* ── Nota de estilo (para quien agregue un rubro nuevo) ──────────
     - Grilla 24×24, contenido dentro de aprox. x:[3,21] y:[3,21]
       (el mismo margen óptico en los 14 existentes).
     - Solo trazo (stroke), nunca relleno de área — así el color de
       fondo (ventana del pin, chip, tarjeta) siempre se ve "a través"
       del ícono, igual que hoy se ve a través de la inicial de letra
       que este sistema reemplaza.
     - stroke-width 1.75 y stroke-linecap/linejoin "round" en TODOS,
       sin excepción — es lo que hace que el set se lea como una
       familia y no como 14 íconos sueltos.
     - Un símbolo simple y reconocible por rubro, sin sombreado ni
       detalle fino: tiene que leerse nítido incluso escalado a los
       ~13-15px que ocupa dentro de un pin de mapa. */
})(typeof window !== 'undefined' ? window : global);

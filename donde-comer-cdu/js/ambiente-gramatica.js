/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-gramatica.js
   Fase 4: Movement Grammar Registry (Motion Direction Bible, Cap. 4)

   Segundo módulo del Ambient Engine que aplica la Biblia del
   Movimiento. Responsabilidad única: ser la fuente canónica de los
   nueve verbos de movimiento (Cap. 4) y de las dos reglas que
   gobiernan su uso — no ejecuta ningún movimiento, no toca el DOM, no
   decide qué elemento usa qué verbo. Es un diccionario con reglas de
   validación, igual en espíritu a ambiente-profundidad.js: un cálculo
   puro que otros módulos consultan.

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 4 "Regla de no sinonimia" — ningún verbo puede reasignarse
     como sinónimo de otro. Esta regla no se "valida" en tiempo de
     ejecución (es una decisión de quien escribe cada módulo), pero
     este archivo la sostiene siendo el ÚNICO lugar donde existen los
     nueve significados — si un módulo necesita describir un
     movimiento, debe pedirle el significado a este registro en vez de
     inventar su propia descripción, para que no puedan divergir dos
     definiciones del mismo verbo en el código.
   - Cap. 4 "Regla de combinación" — como máximo dos verbos
     simultáneos sobre un mismo elemento, y solo si uno de los dos es
     "desvanecerse", o "acercarse"/"alejarse" combinado con un cambio
     de opacidad. validarCombinacion() aplica esta regla exactamente
     así, sin excepciones no documentadas.
   - Cap. 4, tabla — "Rotar": "uso extremadamente restringido". No es
     algo que el código pueda inferir por sí solo, así que en vez de
     dejarlo pasar como cualquier otro verbo, validarRotar() exige que
     quien lo pida declare explícitamente cuál de los dos usos
     legítimos de la tabla del Cap. 4 está aplicando.
   - Cap. 7, tabla de planos — "Oscilar" es, textualmente, el único
     verbo que ejecuta el plano de Fondo ambiental ("el único que
     ejecuta el verbo 'oscilar'"), nunca un componente de interfaz
     funcional. planoPermite() hace cumplir esa restricción.

   No depende de ningún otro módulo del Ambient Engine y ninguno
   depende de la existencia previa de este — puede cargarse en
   cualquier punto anterior a quien lo consulte por primera vez, igual
   que ambiente-profundidad.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // Cap. 4: los nueve verbos. Vocabulario cerrado — este objeto es a
  // propósito la única lista que debería existir en todo el código.
  var VERBOS = {
    acercarse: {
      significado: 'Un elemento gana relevancia, foco o urgencia informativa creciente. Reduce la distancia percibida entre el usuario y el contenido.',
      uso: 'Foco de búsqueda, apertura de ficha, confirmación de una acción deseada.'
    },
    alejarse: {
      significado: 'Un elemento cede relevancia o se retira del centro de atención sin desaparecer del todo; sigue existiendo en un plano secundario.',
      uso: 'Cierre de una ficha hacia la vista general, retorno a un listado.'
    },
    expandirse: {
      significado: 'Se revela información adicional que ya pertenecía al elemento, no información nueva ajena a él.',
      uso: 'Apertura de un detalle, un filtro que despliega sus opciones.'
    },
    comprimirse: {
      significado: 'Se oculta información secundaria conservando la identidad y la posición del elemento.',
      uso: 'Colapsar un filtro, resumir una tarjeta ya leída.'
    },
    desvanecerse: {
      significado: 'Un elemento deja de ser relevante para la tarea actual sin que su desaparición implique una pérdida de datos o un error.',
      uso: 'Elementos ambientales al cambiar de escena, overlays que ya cumplieron su función.'
    },
    rotar: {
      significado: 'Cambio de estado binario o cíclico de un control (no decorativo). Uso extremadamente restringido.',
      uso: 'Indicadores de expansión/colapso, íconos de estado de carga puntuales.',
      restringido: true
    },
    respirar: {
      significado: 'Ciclo suave y de baja amplitud que comunica que un elemento está "en espera" o "vivo" sin requerir acción.',
      uso: 'Estados ambientales de fondo, indicadores de disponibilidad.'
    },
    oscilar: {
      significado: 'Variación leve y acotada alrededor de un punto de reposo, usada para elementos climáticos o naturales del Ambient Engine.',
      uso: 'Elementos atmosféricos (luz, nubosidad sutil, reflejos), nunca componentes de interfaz funcional.',
      planoExclusivo: 'fondo' // Cap. 7: único verbo reservado al plano de Fondo ambiental.
    },
    'permanecer-quieto': {
      significado: 'Ausencia deliberada de movimiento en un elemento mientras todo lo demás se mueve, para dirigir la atención por contraste.',
      uso: 'Un precio, un botón principal o un dato crítico durante una secuencia de carga ambiental.'
    }
  };

  var IDS = Object.keys(VERBOS);

  function esValido(id) {
    return Object.prototype.hasOwnProperty.call(VERBOS, id);
  }

  // Devuelve una copia congelada con el id incluido, o null si no
  // existe — nunca un objeto vacío que pueda confundirse con un
  // verbo real (Cap. 1.4: degradarse en silencio, no a medias).
  function verbo(id) {
    if (!esValido(id)) return null;
    var v = VERBOS[id];
    return Object.freeze({
      id: id,
      significado: v.significado,
      uso: v.uso,
      restringido: !!v.restringido,
      planoExclusivo: v.planoExclusivo || null
    });
  }

  // Cap. 7: si el verbo declara un plano exclusivo (hoy, solo
  // 'oscilar' → 'fondo'), solo puede ejecutarse en ese plano. Un
  // verbo sin plano exclusivo declarado no tiene esta restricción.
  function planoPermite(id, plano) {
    if (!esValido(id)) return false;
    var exclusivo = VERBOS[id].planoExclusivo;
    return !exclusivo || exclusivo === plano;
  }

  // Cap. 4 "Regla de combinación": máximo dos verbos simultáneos
  // sobre el mismo elemento, y solo si uno de los dos es
  // 'desvanecerse', o 'acercarse'/'alejarse' combinado con un cambio
  // de opacidad. incluyeOpacidad: true si la combinación ya incluye
  // un cambio de opacidad como parte del movimiento.
  function validarCombinacion(verbos, incluyeOpacidad) {
    var lista = (verbos || []).filter(esValido);

    if (lista.length === 0) {
      return Object.freeze({ valido: false, motivo: 'ningún verbo válido en la lista' });
    }
    if (lista.length === 1) {
      return Object.freeze({ valido: true, motivo: null });
    }
    if (lista.length > 2) {
      // Cap. 14: combinar tres o más verbos sobre el mismo elemento
      // es, por definición, un anti-patrón.
      return Object.freeze({ valido: false, motivo: 'más de dos verbos simultáneos — anti-patrón del Cap. 14' });
    }

    var tieneDesvanecerse = lista.indexOf('desvanecerse') > -1;
    var tieneAcercarseOAlejarse = lista.indexOf('acercarse') > -1 || lista.indexOf('alejarse') > -1;

    if (tieneDesvanecerse) {
      return Object.freeze({ valido: true, motivo: null });
    }
    if (tieneAcercarseOAlejarse && incluyeOpacidad) {
      return Object.freeze({ valido: true, motivo: null });
    }
    return Object.freeze({
      valido: false,
      motivo: 'dos verbos simultáneos solo se permiten con desvanecerse, o acercarse/alejarse combinado con un cambio de opacidad'
    });
  }

  // Cap. 4: 'rotar' es de "uso extremadamente restringido" — a
  // diferencia de los otros ocho verbos, no basta con que el id sea
  // válido; quien lo pida debe declarar cuál de los dos usos
  // legítimos de la tabla del Cap. 4 está aplicando.
  var USOS_ROTAR_PERMITIDOS = ['indicador-expansion-colapso', 'icono-carga-puntual'];

  function validarRotar(usoDeclarado) {
    return USOS_ROTAR_PERMITIDOS.indexOf(usoDeclarado) > -1;
  }

  var api = {
    VERBOS: IDS.slice(),
    verbo: verbo,
    esValido: esValido,
    planoPermite: planoPermite,
    validarCombinacion: validarCombinacion,
    validarRotar: validarRotar,
    USOS_ROTAR_PERMITIDOS: USOS_ROTAR_PERMITIDOS.slice()
  };

  global.AmbienteGramatica = api;

})(window);

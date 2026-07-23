/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — motor-mapa.js
   El mapa-herramienta ya no es exclusivo de Acción Directa: participa
   de las cuatro regiones (Guía, Exploración, Acción Directa,
   Curaduría), mostrando siempre el mismo recorte que ya está en
   pantalla como tarjetas — nunca un conjunto aparte. La única
   condición real es que haya algo georreferenciado para mostrar.
   El mapa-textura (capa ambiental de motor-render/app.js) sigue
   siendo la única pieza no interactiva, de baja densidad.

   ───────────────────────────────────────────────────────────────────
   AUDITORÍA (motivo de cada cambio no trivial):

   BUGS REALES corregidos
   • Ninguna de las tres funciones públicas validaba coordenadas de
     verdad: `app.js` (único llamador real) filtra con
     `typeof l.lat === 'number'`, pero `typeof NaN === 'number'` es
     `true` — un lugar con lat/lng corrupto (dato mal cargado, parseo
     numérico fallido en otra capa) pasaba ese filtro y llegaba hasta
     `motor-render.js`/`proyeccion.js`, con riesgo de encuadrar o
     dibujar sobre `NaN`. Ahora las tres funciones definen y aplican
     su propia noción real de "coordenada válida" (finita y dentro de
     rango), en vez de confiar en que el llamador ya lo garantizó.
   • `puntosTextura` muestreaba el registro completo ANTES de
     descartar lugares sin coordenadas numéricas válidas — `app.js`
     recién filtra eso al pintar cada punto (`actualizarMapaTextura`).
     Con `texturaDensidadMax` en 18, un muestreo que cayera
     mayormente sobre lugares sin lat/lng (posible: el paso de
     muestreo es fijo, no aleatorio) podía dejar la textura ambiental
     con muchos menos puntos visibles que los 18 previstos, sin que
     nada lo señalara. Ahora se filtra primero, se muestrea después:
     el presupuesto de densidad siempre se gasta en puntos que
     realmente se van a poder dibujar.
   • Ninguna de las tres funciones toleraba entradas que no fueran
     arrays (`undefined`, `null`, un objeto suelto) — hoy no ocurre
     porque `app.js` siempre pasa arrays, pero un cambio futuro en el
     llamador rompería con un error críptico en vez de degradar. Se
     agregó una guarda explícita.
   • Sin chequeo de dependencia dura: si `motor-config.js` no cargaba
     antes que este archivo (típicamente un error de orden en los
     `<script>`, ver index.html sección 5 — el mismo tipo de falla que
     ya motivó agregar la guarda equivalente en motor-plano.js), el
     primer acceso a `CFG.mapa.texturaDensidadMax` rompía con un
     `TypeError` genérico ("Cannot read properties of undefined")
     lejos de la causa real. Ahora falla temprano y explícito, mismo
     criterio que ya usan motor-plano.js y motor-render.js para sus
     propias dependencias duras.

   CAPACIDADES NUEVAS (aditivas — el contrato de las tres funciones
   públicas originales no cambia para entradas ya válidas: mismo
   orden de entrada preservado, mismo tipo de retorno, mismos límites
   de motor-config.js respetados)
   • `esCoordenadaValida(lat, lng)`: la misma definición de
     "coordenada geográfica válida" que ahora también expone
     proyeccion.js — DUPLICADA a propósito, no por descuido: este
     archivo se carga ANTES que proyeccion.js (ver index.html, sección
     5, punto 6 vs punto 7), así que no puede depender de
     `URU_PROYECCION` sin invertir ese orden — un cambio de alcance
     mayor al autorizado en esta pasada, y el mismo tipo de frontera
     que ya justifica, con el mismo argumento, la duplicación puntual
     de `distanciaMetros` documentada en motor-exposicion.js. El costo
     real es una función de 4 líneas duplicada una vez; el costo de
     evitarla sería reordenar una cadena de `<script>` documentada
     como dependencia dura.
   • `tieneIdentidad(l)` / `deduplicarPorId(lista)`: elimina lugares
     con el mismo `id` repetido (dato de origen duplicado, no un
     "cluster" — eso es responsabilidad exclusiva de
     motor-render.js), preservando el orden y quedándose con la
     PRIMERA aparición. Deliberadamente NO deduplica por coordenada:
     dos lugares distintos en el mismo edificio son datos válidos, no
     un duplicado — solo la igualdad de `id` es una señal confiable
     de que es el mismo registro repetido.
   • `filtrarConCoordenadasValidas(lista)`: extraída como función
     propia (antes era lógica inline repetida con matices distintos
     en cada función) y reutilizada por las tres funciones públicas.
   • `diagnostico(lista)`: herramienta de solo lectura para QA/debug —
     cuenta total, válidos, inválidos (con hasta 5 ids de muestra para
     no volcar el registro completo a consola) y duplicados por id.
     No se conecta a ninguna UI: es información para quien depure el
     mapa, no una decisión de producto.

   Todo lo demás —el criterio de negocio de qué se muestra en cada
   región, los límites de motor-config.js, el hecho de que este
   archivo decide QUÉ pero nunca CÓMO— se mantiene exactamente igual.
   No se agregó ordenamiento por proximidad acá: la Sección 5 de la
   auditoría solicitada pregunta explícitamente dónde debe vivir esa
   lógica, y la respuesta, después de revisar motor-exposicion.js y
   app.js, es "en ninguna de las dos": app.js ya ordena por cercanía
   ANTES de llamar a `actualizarMapaHerramienta` (ver
   `ordenarPorCercania`), y la Sección 6 de la misma auditoría exige
   que el mapa "respete exactamente la selección recibida" y "nunca
   altere silenciosamente el orden cuando no corresponde". Reordenar
   acá por distancia duplicaría esa lógica Y rompería esa regla al
   mismo tiempo — se descarta con esta justificación, no por omisión.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  var CFG = global.URU_CONFIG;

  if (!CFG || !CFG.mapa) {
    // Dependencia dura declarada explícitamente, mismo criterio que ya
    // usan motor-plano.js y motor-render.js para las suyas: fallar
    // temprano y con un mensaje que señale la causa real (orden de
    // <script>) en vez de un TypeError genérico más adelante, la
    // primera vez que una función de acá intente leer CFG.mapa.*.
    if (global.console) {
      console.error('URU_MAPA: falta URU_CONFIG (motor-config.js) o su sección "mapa". ' +
        'Revisá el orden de carga de los <script> — este módulo no puede calcular ' +
        'límites de densidad sin esa dependencia.');
    }
  }

  function esNumeroFinito(v) {
    return typeof v === 'number' && isFinite(v);
  }

  // Definición real de "coordenada geográfica válida": finita y
  // dentro de rango. `typeof NaN === 'number'` es `true`, así que un
  // chequeo de tipo ingenuo (el que ya hace app.js antes de llamar
  // a puntosHerramienta) deja pasar NaN — por eso este módulo no
  // confía en que el llamador ya lo filtró y aplica su propio
  // criterio, completo, en cada función pública.
  function esCoordenadaValida(lat, lng) {
    return esNumeroFinito(lat) && esNumeroFinito(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  function comoArray(lista) {
    return Array.isArray(lista) ? lista : [];
  }

  function filtrarConCoordenadasValidas(lista) {
    return comoArray(lista).filter(function (l) {
      return l && esCoordenadaValida(l.lat, l.lng);
    });
  }

  function tieneIdentidad(l) {
    return l && (typeof l.id === 'string' || typeof l.id === 'number') && l.id !== '';
  }

  // Elimina lugares con `id` repetido, preservando el orden de
  // entrada y quedándose con la primera aparición. Los lugares sin
  // `id` utilizable pasan sin tocar: sin una identidad confiable no
  // hay forma segura de decidir que dos entradas son "la misma".
  function deduplicarPorId(lista) {
    var arr = comoArray(lista);
    var vistos = Object.create(null);
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var l = arr[i];
      if (!tieneIdentidad(l)) { out.push(l); continue; }
      var clave = typeof l.id + ':' + l.id;
      if (vistos[clave]) continue;
      vistos[clave] = true;
      out.push(l);
    }
    return out;
  }

  // Puntos ambientales: muestreo estable y acotado del registro
  // completo, nunca 1.468 puntos — ver motor-config.js: mapa.texturaDensidadMax.
  // Filtra coordenadas válidas ANTES de muestrear (ver auditoría más
  // arriba): así el presupuesto de densidad nunca se gasta en un
  // lugar que después no se va a poder dibujar.
  function puntosTextura(registro) {
    var max = (CFG && CFG.mapa && CFG.mapa.texturaDensidadMax) || 0;
    var validos = filtrarConCoordenadasValidas(registro);
    if (max <= 0 || !validos.length) return [];
    if (validos.length <= max) return validos.slice();
    var paso = Math.floor(validos.length / max);
    var out = [];
    for (var i = 0; i < validos.length && out.length < max; i += paso) out.push(validos[i]);
    return out;
  }

  // Puntos herramienta: los del recorte activo de la región actual,
  // acotados por el mismo tipo de límite (mapa.herramientaRecorte) —
  // el mapa nunca muestra más lugares que los que ya están como
  // tarjetas en pantalla. Defensa en profundidad: vuelve a validar
  // coordenadas y descarta ids repetidos incluso si el llamador ya
  // filtró con un criterio más débil (ver auditoría), pero NUNCA
  // reordena — el orden de entrada (ya decidido por app.js, incluida
  // una eventual ordenación por cercanía) se preserva intacto.
  function puntosHerramienta(recorteActivo) {
    var limite = (CFG && CFG.mapa && CFG.mapa.herramientaRecorte);
    if (!esNumeroFinito(limite) || limite < 0) limite = 0;
    var validos = deduplicarPorId(filtrarConCoordenadasValidas(recorteActivo));
    return validos.slice(0, limite);
  }

  // Criterio único: que haya al menos un resultado con coordenadas
  // realmente utilizables (finitas y en rango — no solo "de tipo
  // number", ver auditoría). El presupuesto de exposición
  // (motor-exposicion.js) ya se encarga de que "resultados" nunca sea
  // el padrón entero, en ninguna región — así que este criterio no
  // necesita distinguir por región.
  function debeMostrarHerramienta(nombreRegion, resultados) {
    var arr = comoArray(resultados);
    if (!arr.length) return false;
    return arr.some(function (r) { return r && esCoordenadaValida(r.lat, r.lng); });
  }

  // Herramienta de diagnóstico de solo lectura, pensada para QA y
  // depuración manual (consola), no para ninguna decisión de negocio
  // ni ninguna UI. Da visibilidad de qué fracción de una lista
  // realmente puede llegar al mapa y por qué no llegaría el resto.
  function diagnostico(lista) {
    var arr = comoArray(lista);
    var validos = 0, invalidos = 0, muestraInvalidos = [];
    var vistos = Object.create(null), duplicados = 0;

    for (var i = 0; i < arr.length; i++) {
      var l = arr[i];
      if (l && esCoordenadaValida(l.lat, l.lng)) {
        validos++;
      } else {
        invalidos++;
        if (muestraInvalidos.length < 5) {
          muestraInvalidos.push({
            id: (l && l.id !== undefined) ? l.id : null,
            lat: l ? l.lat : undefined,
            lng: l ? l.lng : undefined
          });
        }
      }
      if (l && tieneIdentidad(l)) {
        var clave = typeof l.id + ':' + l.id;
        if (vistos[clave]) duplicados++;
        else vistos[clave] = true;
      }
    }

    return {
      total: arr.length,
      validos: validos,
      invalidos: invalidos,
      duplicadosPorId: duplicados,
      muestraInvalidos: muestraInvalidos
    };
  }

  global.URU_MAPA = {
    puntosTextura: puntosTextura,
    puntosHerramienta: puntosHerramienta,
    debeMostrarHerramienta: debeMostrarHerramienta,
    esCoordenadaValida: esCoordenadaValida,
    deduplicarPorId: deduplicarPorId,
    diagnostico: diagnostico
  };
})(typeof window !== 'undefined' ? window : global);
if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window.URU_MAPA : global.URU_MAPA);
}

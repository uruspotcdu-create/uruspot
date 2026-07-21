/* URU SPOT — mapeo id -> carpeta real de ficha
   ---------------------------------------------------------------------
   Bug real encontrado: slug(lugar) generaba "locales/uru-00187/"
   usando el ID, pero las carpetas en locales/ estan nombradas por el
   negocio ("locales/bartolo-bar/"), no por ID. Resultado: CADA boton
   "ver ficha" del sitio apuntaba a una URL que no existe (404) - no
   solo los lugares sin ficha, todos.

   Solo 45 de los 1.468 lugares del padron tienen hoy una ficha propia
   en locales/ (los 51 negocios de gastronomia/alojamiento/gimnasios
   curados a mano, menos 6 casos ambiguos: sucursales o coincidencias
   de nombre que no se pudieron resolver con certeza - mejor no
   mostrar el boton que enlazar a la sucursal equivocada: Cremolatti,
   BRODE, El Conventillo de Baco, Gimnasio 538 y Justo Jose Resto Bar).

   Generado comparando el nombre embebido en cada
   locales/<carpeta>/index.html contra lugares-core.json. Si se agregan
   mas fichas a futuro, hay que sumar su entrada aca (o automatizar
   esta generacion como parte del build). */
(function (global) {
  'use strict';
  global.URU_LOCALES_SLUGS = {
    "URU-00120": "muscle-gimnasio",
    "URU-00121": "lucianos-gimnasio",
    "URU-00122": "cross-gimnasio",
    "URU-00123": "power-gimnasio",
    "URU-00124": "casa-del-arbol",
    "URU-00125": "los-aguaribay",
    "URU-00126": "bungalows-mexico",
    "URU-00127": "antigua-fonda",
    "URU-00128": "hoteleria-mitre",
    "URU-00129": "posta-torreon",
    "URU-00157": "danys",
    "URU-00159": "italia",
    "URU-00160": "yelatti-artesanal",
    "URU-00162": "el-arca-resto-bar",
    "URU-00163": "papa-luigi",
    "URU-00164": "bella-vista",
    "URU-00165": "panza-verde",
    "URU-00166": "bonhomia",
    "URU-00167": "la-ris",
    "URU-00168": "parrilla-la-gruta",
    "URU-00169": "sanduba",
    "URU-00170": "pimienta-negra",
    "URU-00171": "parada-33",
    "URU-00172": "faro-3260",
    "URU-00173": "el-calderon",
    "URU-00174": "la-segunda",
    "URU-00175": "dolores-costa",
    "URU-00176": "la-delfina",
    "URU-00177": "mamma-mia",
    "URU-00178": "garifo",
    "URU-00180": "el-danubio-azul",
    "URU-00181": "nero-cafe",
    "URU-00182": "cultura-cafe",
    "URU-00183": "helena-cafe",
    "URU-00184": "london-cafe",
    "URU-00185": "drakkar",
    "URU-00186": "klug-gebrau",
    "URU-00187": "bartolo-bar",
    "URU-00188": "house-garage",
    "URU-00189": "7-colinas",
    "URU-00190": "panettone",
    "URU-00191": "lo-de-juan",
    "URU-00193": "san-carlos",
    "URU-00227": "la-cuadra",
    "URU-00237": "mi-viejo"
  };
})(typeof window !== 'undefined' ? window : global);

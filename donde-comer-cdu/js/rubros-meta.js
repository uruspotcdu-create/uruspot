/* URU SPOT — metadatos de rubros. Sin lógica de arquitectura: es
   contenido (nombres, descripciones y color de identificación en el
   mapa), igual que antes vivía dentro de fase4-motor.js. Se separa
   para que app.js, el motor de mapa y las páginas de índice de rubros
   lo compartan sin duplicar el objeto.
   Formato de cada entrada: [nombre, descripción, colorMapa]          */
(function (global) {
  'use strict';
  global.URU_RUBROS_META = {
    alojamiento:        ['Alojamiento', 'hospedaje verificado puerta a puerta', '#E0C46C'],
    belleza:            ['Belleza', 'peluquerías, barberías y centros de estética', '#C58FCE'],
    compras:            ['Compras', 'comercios, desde kioscos hasta grandes superficies', '#D9A05B'],
    deporte:            ['Deporte', 'clubes, gimnasios y espacios para moverse', '#E8A33D'],
    educacion:          ['Educación', 'escuelas, institutos y academias', '#7EA6E0'],
    finanzas:           ['Finanzas', 'bancos, financieras y casas de cambio', '#6FA8DC'],
    gastronomia:        ['Gastronomía', 'restaurantes, bares y rotiserías', '#C97A83'],
    mascotas:           ['Mascotas', 'veterinarias y pet shops', '#8FBF7F'],
    naturaleza:         ['Naturaleza', 'plazas, costaneras y espacios verdes', '#6FBF8B'],
    oficios_tecnicos:   ['Oficios técnicos', 'electricistas, plomeros, gasistas y afines', '#ABAFB8'],
    patrimonio:         ['Patrimonio', 'sitios históricos y culturales', '#C9A15A'],
    salud:              ['Salud', 'consultorios, farmacias y centros médicos', '#7FC8A9'],
    servicios_publicos: ['Servicios públicos', 'trámites, correo y organismos', '#8296B0'],
    transporte:         ['Transporte', 'remises, terminales y estaciones', '#D98B5F']
  };
})(typeof window !== 'undefined' ? window : global);

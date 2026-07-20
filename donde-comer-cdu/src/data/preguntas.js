/* ═══════════════════════════════════════════════════════════════════
   Contenido editorial del FAQ. Extraído sin cambios desde
   fase4-motor.js (Etapa 2: mismo contenido, nueva ubicación).
   ═══════════════════════════════════════════════════════════════════ */

export const PREGUNTAS = [
  ['¿Por qué el orden no es por relevancia?',
   'Porque "relevancia" es una opinión disfrazada de dato. El único orden que no miente es el orden en que se caminó cada dirección — por eso cada lugar tiene una posición en el padrón, no un puntaje.'],
  ['¿Qué significa que un lugar esté "pendiente de confirmación"?',
   'Que esa ficha entró al padrón pero la última auditoría no pudo cerrarla del todo (dirección sin confirmar, coincidencia dudosa, o directamente no se encontró). No la ocultamos ni la completamos a ojo: se muestra marcada, igual que el resto de la información real.'],
  ['¿Cómo se verifica cada lugar?',
   'Alguien del equipo confirma que el lugar existe y que los datos son correctos — auditoría en fuentes oficiales, Google Places o en el lugar mismo — y recién ahí se carga la ficha al padrón.'],
  ['¿Con qué frecuencia se revisa lo ya verificado?',
   'Un lugar queda activo hasta que una nueva auditoría confirme un cambio (mudanza, cierre, cambio de horario). No hay una fecha de vencimiento automática.'],
  ['¿Puedo sugerir una corrección o un lugar nuevo?',
   'Sí — escribiendo a padron@uruspot.com.ar. La sugerencia entra a una cola de verificación antes de publicarse, igual que el resto del padrón.'],
  ['¿Cuándo va a estar completo el padrón?',
   'Con 1.468 lugares ya caminados, esta es la versión más completa hasta ahora. Sigue creciendo solo cuando aparece una dirección nueva confirmada — nunca por apuro de publicar algo sin confirmar primero.'],
  ['¿Puedo buscar o filtrar por rubro?',
   'Sí. El buscador de acá abajo filtra por nombre, rubro o dirección, los chips filtran por rubro, y el mapa esquemático se mueve en conjunto con la lista — los tres recortan la misma secuencia, ninguno la reordena.']
];

#!/usr/bin/env node
/*
 * scripts/generar-jsonld-fichas.js
 * ---------------------------------------------------------------------
 * Genera JSON-LD (schema.org) para cada ficha de donde-comer-cdu/locales/*.
 *
 * Por qué existe: index.html ya tiene JSON-LD, pero las ~51 fichas
 * individuales no — y son justamente las páginas que Google podría
 * mostrar como resultado enriquecido (rating, horario, teléfono) o que
 * un asistente/Maps podría leer para entender el lugar.
 *
 * Cada ficha ya trae todo lo necesario embebido en el propio HTML
 * (no hace falta cruzar con lugares-core.json, que evita el problema
 * de matchear por nombre entre archivos que no comparten un id):
 *   - <script id="ficha-data" type="application/json"> → rubro y horario
 *     ya estructurado (schedule_rows).
 *   - og:title / og:image → nombre e imagen principal.
 *   - "Dirección:</strong> ..." dentro de la sección de mapa.
 *   - href="tel:+..." → teléfono en formato E.164, listo para usar.
 *   - .score-big-num → rating sobre 10 (se re-escala a sobre 5 para
 *     AggregateRating, que es la escala que Google espera).
 *   - el link "Cómo llegar" a Google Maps → lat/lng (@lat,lng).
 *   - .schedule-note-val → rango de precio.
 *
 * MODO DRY-RUN POR DEFECTO: sin --write, solo imprime un reporte de
 * qué extrajo de cada ficha y NO toca ningún archivo. Son negocios
 * reales — un dato mal parseado (dirección, teléfono) publicado como
 * structured data es peor que no tener structured data. Revisá el
 * reporte antes de correr con --write.
 *
 * Uso:
 *   node scripts/generar-jsonld-fichas.js            → reporte, no escribe
 *   node scripts/generar-jsonld-fichas.js --write     → inyecta el <script>
 *                                                        JSON-LD antes de
 *                                                        </head> en cada ficha
 */

'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', 'donde-comer-cdu', 'locales');
const SITIO = 'https://uruspot.pages.dev';
const ESCRIBIR = process.argv.includes('--write');

// rubro (grupo amplio, ver js/rubros-meta.js) → @type de schema.org más
// específico disponible. FoodEstablishment es el fallback razonable
// para gastronomia si no matchea ninguna palabra clave de la categoría.
const RUBRO_A_TIPO = {
  gastronomia: 'FoodEstablishment',
  alojamiento: 'LodgingBusiness',
  deporte: 'SportsActivityLocation',
  belleza: 'HealthAndBeautyBusiness',
  compras: 'Store'
};

// Afina FoodEstablishment/SportsActivityLocation genérico a un @type
// más preciso cuando el texto de la ficha lo deja claro.
const AFINADOS = [
  [/panader/i, 'Bakery'],
  [/pizzer/i, 'Restaurant'],
  [/parrill/i, 'Restaurant'],
  [/resto.?bar|restaurante|fonda|cocina/i, 'Restaurant'],
  [/caf[eé]/i, 'CafeOrCoffeeShop'],
  [/bar\b/i, 'BarOrPub'],
  [/gimnasio|fitness/i, 'ExerciseGym'],
  [/hotel|bungalow|hoteler/i, 'LodgingBusiness']
];

function leer(archivo) {
  return fs.readFileSync(archivo, 'utf8');
}

function extraerUno(html, slug) {
  const problemas = [];

  const titulo = (html.match(/<title>([^<]+)<\/title>/) || [])[1];
  const nombre = titulo ? titulo.replace(/\s*·\s*URU SPOT\s*$/, '').trim() : null;
  if (!nombre) problemas.push('sin <title>');

  const imagen = (html.match(/property="og:image" content="([^"]+)"/) || [])[1];
  if (!imagen) problemas.push('sin og:image');

  const descripcion = (html.match(/property="og:description" content="([^"]+)"/) || [])[1] || '';

  let direccion = (html.match(/Direcci[oó]n:<\/strong>\s*([^<]+?)(?:<strong>|$)/) || [])[1];
  if (!direccion) {
    // Fallback: algunas fichas no tienen calle y altura, solo una zona
    // ("Centro Histórico, Concepción del Uruguay") en el título del
    // mapa. Sirve para addressLocality pero NO es una dirección postal
    // real — se marca como aviso para revisar a mano si conviene
    // conseguir la dirección exacta en vez de publicar la zona.
    const zona = (html.match(/map-info-title"[^>]*>([^<]+)</) || [])[1];
    if (zona) {
      direccion = zona.trim();
      problemas.push('sin dirección exacta, se usó la zona del mapa como aproximación: "' + zona.trim() + '"');
    } else {
      problemas.push('sin dirección (ni "Dirección:</strong>" ni .map-info-title)');
    }
  }

  const telHref = (html.match(/href="tel:(\+?[\d]+)"/) || [])[1];
  if (!telHref) problemas.push('sin teléfono (href="tel:...")');

  const ratingSobre10 = (html.match(/score-big-num">([\d.]+)</) || [])[1];
  const rating = ratingSobre10 ? (parseFloat(ratingSobre10) / 2).toFixed(2) : null;

  const geo = html.match(/@(-?[\d.]+),(-?[\d.]+),\d/);
  const lat = geo ? geo[1] : null;
  const lng = geo ? geo[2] : null;
  if (!geo) problemas.push('sin lat/lng (patrón "@lat,lng,zoom" en link de Maps)');

  const precio = (html.match(/schedule-note-val">([^<]+)</) || [])[1];

  const fichaDataMatch = html.match(/id="ficha-data" type="application\/json">\s*([\s\S]*?)\s*<\/script>/);
  let rubro = null;
  let scheduleRows = [];
  if (fichaDataMatch) {
    try {
      const datos = JSON.parse(fichaDataMatch[1]);
      rubro = datos.rubro || null;
      scheduleRows = Array.isArray(datos.schedule_rows) ? datos.schedule_rows : [];
    } catch (e) {
      problemas.push('ficha-data presente pero no parsea como JSON: ' + e.message);
    }
  } else {
    problemas.push('sin bloque #ficha-data');
  }

  let tipo = RUBRO_A_TIPO[rubro] || 'LocalBusiness';
  for (const [patron, tipoAfinado] of AFINADOS) {
    if (patron.test(nombre || '') || patron.test(html.slice(0, 2000))) {
      tipo = tipoAfinado;
      break;
    }
  }

  return {
    slug, nombre, imagen, descripcion, direccion, telHref,
    rating, lat, lng, precio, rubro, scheduleRows, tipo, problemas
  };
}

// Convierte "Martes a Domingo (mañana)" + "07:00 – 13:00" a
// openingHoursSpecification. Días en español → códigos schema.org.
const DIAS = {
  'lunes': 'Monday', 'martes': 'Tuesday', 'miércoles': 'Wednesday', 'miercoles': 'Wednesday',
  'jueves': 'Thursday', 'viernes': 'Friday', 'sábado': 'Saturday', 'sabado': 'Saturday', 'domingo': 'Sunday'
};
const ORDEN_DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

function expandirRangoDias(texto) {
  // "Martes a Domingo" → [martes..domingo]; si no matchea el patrón
  // "X a Y", se asume que texto es un solo día.
  const m = texto.toLowerCase().match(/([a-záéíóú]+)\s+a\s+([a-záéíóú]+)/);
  if (!m) {
    const dia = texto.toLowerCase().trim();
    return DIAS[dia] ? [DIAS[dia]] : [];
  }
  const desde = ORDEN_DIAS.indexOf(m[1]);
  const hasta = ORDEN_DIAS.indexOf(m[2]);
  if (desde === -1 || hasta === -1) return [];
  const dias = [];
  let i = desde;
  while (true) {
    dias.push(DIAS[ORDEN_DIAS[i]]);
    if (i === hasta) break;
    i = (i + 1) % 7;
  }
  return dias;
}

function horarioASchema(scheduleRows) {
  const specs = [];
  for (const fila of scheduleRows) {
    if (fila.closed) continue;
    const dias = expandirRangoDias(fila.day || '');
    const horas = (fila.time || '').match(/(\d{1,2}:\d{2})\s*[–\-]\s*(\d{1,2}:\d{2})/);
    if (!dias.length || !horas) continue;
    specs.push({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: dias,
      opens: horas[1],
      closes: horas[2]
    });
  }
  return specs;
}

function armarJsonLd(datos, slugCarpeta) {
  const url = `${SITIO}/donde-comer-cdu/locales/${slugCarpeta}/`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': datos.tipo,
    name: datos.nombre,
    description: datos.descripcion || undefined,
    image: datos.imagen || undefined,
    url,
    telephone: datos.telHref || undefined,
    address: datos.direccion ? {
      '@type': 'PostalAddress',
      streetAddress: datos.direccion.trim(),
      addressLocality: 'Concepción del Uruguay',
      addressRegion: 'Entre Ríos',
      addressCountry: 'AR'
    } : undefined,
    geo: (datos.lat && datos.lng) ? {
      '@type': 'GeoCoordinates',
      latitude: datos.lat,
      longitude: datos.lng
    } : undefined,
    priceRange: datos.precio || undefined,
    aggregateRating: datos.rating ? {
      '@type': 'AggregateRating',
      ratingValue: datos.rating,
      bestRating: '5',
      worstRating: '1'
      // Sin reviewCount/ratingCount: no está en la ficha y Google
      // exige que aggregateRating declare de dónde sale el número si
      // lo lleva — mejor omitirlo que inventarlo. Se puede sumar
      // después si se decide exponer lugares-core.json:rating_count
      // por ficha.
    } : undefined
  };
  const horario = horarioASchema(datos.scheduleRows);
  if (horario.length) jsonLd.openingHoursSpecification = horario;

  // limpia claves undefined para no ensuciar el JSON-LD
  Object.keys(jsonLd).forEach((k) => jsonLd[k] === undefined && delete jsonLd[k]);
  if (jsonLd.address) {
    Object.keys(jsonLd.address).forEach((k) => jsonLd.address[k] === undefined && delete jsonLd.address[k]);
  }
  return jsonLd;
}

function main() {
  const carpetas = fs.readdirSync(RAIZ, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  let ok = 0, conAvisos = 0;
  const resumenProblemas = [];

  for (const slug of carpetas) {
    const archivo = path.join(RAIZ, slug, 'index.html');
    if (!fs.existsSync(archivo)) continue;
    const html = leer(archivo);
    const datos = extraerUno(html, slug);
    const jsonLd = armarJsonLd(datos, slug);

    if (datos.problemas.length) {
      conAvisos++;
      resumenProblemas.push(`  - ${slug}: ${datos.problemas.join('; ')}`);
    } else {
      ok++;
    }

    if (ESCRIBIR) {
      if (/application\/ld\+json/.test(html)) {
        console.log(`[saltado, ya tiene JSON-LD] ${slug}`);
        continue;
      }
      const bloque = `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>\n`;
      const nuevoHtml = html.replace('</head>', bloque + '</head>');
      fs.writeFileSync(archivo, nuevoHtml, 'utf8');
      console.log(`[escrito] ${slug} → @type=${datos.tipo}`);
    } else {
      console.log(`\n=== ${slug} (@type propuesto: ${datos.tipo}) ===`);
      console.log(JSON.stringify(jsonLd, null, 2));
    }
  }

  console.log('\n--------------------------------------------------');
  console.log(`Fichas totales: ${carpetas.length} · sin avisos: ${ok} · con avisos: ${conAvisos}`);
  if (resumenProblemas.length) {
    console.log('\nFichas con datos faltantes o dudosos (revisar antes de --write):');
    console.log(resumenProblemas.join('\n'));
  }
  if (!ESCRIBIR) {
    console.log('\nDRY-RUN: no se escribió ningún archivo. Revisá el reporte de arriba y');
    console.log('corré con --write cuando estés conforme con lo que se extrajo.');
  }
}

main();


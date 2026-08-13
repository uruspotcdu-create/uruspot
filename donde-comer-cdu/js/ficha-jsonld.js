/* ficha-jsonld.js — genera jsonLdRaw / breadcrumbBlockRaw / faqBlockRaw /
 * webPageBlockRaw a partir de datos ESTRUCTURADOS de ficha.json, en vez
 * de que cada ficha traiga esos 4 bloques como HTML/JSON ya renderizado
 * a mano. Resuelve el gap señalado en _comentario_breadcrumb de
 * ficha.json: "El generador de plantilla debería producir este bloque
 * automáticamente... para las 1500 fichas, en vez de escribirlo a mano
 * por ficha".
 *
 * CONTRATO (campos nuevos que ficha.json puede traer):
 *   shell.negocio = {
 *     tipo, nombre, descripcion, imagenes:[...], telefono, priceRange,
 *     servesCuisine, hasMenu, sameAs:[...], address:{...}, hasMap,
 *     geo:{latitude,longitude}, amenityFeature:[{name,value}],
 *     makesOffer:[{name,price,priceCurrency,availability?}],
 *     openingHoursSpecification:[{dayOfWeek:[...],opens,closes}]
 *   }
 *   shell.rubro       = { label, path }         (para el 2do nivel del breadcrumb)
 *   shell.faqItems    = [{ question, answer }, …]
 *   shell.nombreCorto = "Brødë"                  (3er nivel del breadcrumb;
 *     NO se deriva recortando shell.title/ogTitle por un separador tipo
 *     " · " o " — " -- ese separador es multibyte en UTF-8 y el pipeline
 *     de este repo lee/escribe todo como latin1 (ver leerLatin1/
 *     escribirLatin1 en build-fichas.js): partir un string por un
 *     carácter multibyte leído como latin1 corta a mitad de los bytes
 *     y corrompe el nombre. Costaba 1 campo explícito evitarlo del
 *     todo -- se prefiere eso a un parseo "inteligente" que se rompe
 *     silenciosamente con cualquier nombre que use ese separador.
 *
 * COMPATIBILIDAD (51 fichas existentes, esquema viejo): si una ficha ya
 * trae jsonLdRaw/breadcrumbBlockRaw/faqBlockRaw/webPageBlockRaw escritos
 * a mano y NO tiene los campos estructurados de arriba, esos *BlockRaw
 * siguen ganando tal cual — mismo patrón de fallback que ya usa
 * ficha-template.js para armarBloqueOg/armarBloqueTwitter (esquema
 * viejo vs. consolidado). Nada se rompe en las fichas que no migren.
 *
 * "URU SPOT" / "es-AR" quedan fijos acá (no en cada ficha.json), mismo
 * criterio que favicon/robots en ficha-template.js: son idénticos en
 * las 1500 fichas, así que centralizarlos es lo correcto — no hace
 * falta (ni conviene) que cada ficha.json los repita.
 */
"use strict";

const SITE_NAME = "URU SPOT";
const IN_LANGUAGE = "es-AR";

function idBase(shell) {
  // shell.canonical siempre trae "/" final (ver ejemplo Brode); no
  // asumirlo igual evita un "//#negocio" si algún día no lo trae.
  return shell.canonical.endsWith("/") ? shell.canonical : shell.canonical + "/";
}

/* ---- jsonLdRaw (negocio) ------------------------------------------- */
function generarNegocioJsonLd(shell) {
  const n = shell.negocio;
  if (!n) return null;
  const id = idBase(shell);
  // Falla fuerte, no en silencio: mismo criterio que el guard de
  // nombreCorto en generarBreadcrumb() más abajo. Sin este check,
  // n.address.streetAddress explota con un TypeError genérico
  // ("Cannot read properties of undefined") que no dice qué ficha ni
  // qué campo falta -- inútil para diagnosticar entre 1500 fichas.
  // Se detectó auditando Brode: hoy todas las fichas tienen address,
  // pero nada en el contrato (ver cabecera de este archivo) marca el
  // campo como opcional, así que el resto de negocio.* (amenityFeature,
  // makesOffer, geo, hasMap) sí tiene fallback -- address quedaba como
  // la única excepción sin guardar.
  if (!n.address) {
    throw new Error(
      "shell.negocio está presente pero falta shell.negocio.address (slug: " + (shell.slug || "?") + ")"
    );
  }
  const obj = {
    "@context": "https://schema.org",
    "@type": n.tipo,
    "@id": id + "#negocio",
    inLanguage: IN_LANGUAGE,
    name: shell.nombreCorto || shell.title,
    description: n.descripcion,
    image: n.imagenes,
    url: shell.canonical,
    telephone: n.telefono,
    priceRange: n.priceRange,
    servesCuisine: n.servesCuisine,
    hasMenu: n.hasMenu,
    sameAs: n.sameAs,
    address: {
      "@type": "PostalAddress",
      streetAddress: n.address.streetAddress,
      addressLocality: n.address.addressLocality,
      addressRegion: n.address.addressRegion,
      addressCountry: n.address.addressCountry,
    },
    hasMap: n.hasMap,
    geo: n.geo
      ? { "@type": "GeoCoordinates", latitude: n.geo.latitude, longitude: n.geo.longitude }
      : undefined,
    amenityFeature: (n.amenityFeature || []).map((a) => ({
      "@type": "LocationFeatureSpecification",
      name: a.name,
      value: a.value,
    })),
    makesOffer: (n.makesOffer || []).map((o) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Product", name: o.name },
      price: String(o.price),
      priceCurrency: o.priceCurrency || "ARS",
      availability: o.availability || "https://schema.org/InStock",
    })),
    openingHoursSpecification: (n.openingHoursSpecification || []).map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: h.dayOfWeek,
      opens: h.opens,
      closes: h.closes,
    })),
  };
  // Campos opcionales ausentes (ej. una ficha sin hasMap todavía) no
  // deben emitirse como "null"/"undefined" literal en el JSON-LD final
  // -- Google Rich Results Test marca eso como propiedad inválida, no
  // como propiedad ausente. Se podan acá, en un solo lugar, en vez de
  // exigir que cada ficha.json omita a mano la clave entera.
  Object.keys(obj).forEach((k) => {
    if (obj[k] === undefined || obj[k] === null) delete obj[k];
  });
  if (obj.amenityFeature && obj.amenityFeature.length === 0) delete obj.amenityFeature;
  if (obj.makesOffer && obj.makesOffer.length === 0) delete obj.makesOffer;
  if (obj.openingHoursSpecification && obj.openingHoursSpecification.length === 0) {
    delete obj.openingHoursSpecification;
  }
  return JSON.stringify(obj, null, 2);
}

/* ---- breadcrumbBlockRaw ---------------------------------------------
 * Mismo criterio documentado en _comentario_breadcrumb de ficha.json:
 * 3 niveles fijos -- Inicio -> rubro -> esta ficha. */
function generarBreadcrumb(shell) {
  const r = shell.rubro;
  if (!r) return null;
  // Falla fuerte, no en silencio: sin nombreCorto, JSON.stringify omite
  // la clave "name" del item 3 y el breadcrumb queda incompleto sin que
  // nada lo marque -- mismo criterio que el guard de escribirLatin1() en
  // build-fichas.js (preferir un build roto y visible a un output roto
  // e invisible en las 1500 fichas).
  if (!shell.nombreCorto) {
    throw new Error(
      "shell.rubro está presente pero falta shell.nombreCorto (slug: " + (shell.slug || "?") + ")"
    );
  }
  const id = idBase(shell);
  const obj = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": id + "#breadcrumb",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: shell.siteOrigin + "/" },
      { "@type": "ListItem", position: 2, name: r.label, item: shell.siteOrigin + r.path },
      { "@type": "ListItem", position: 3, name: shell.nombreCorto, item: shell.canonical },
    ],
  };
  return `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n</script>\n`;
}

/* ---- faqBlockRaw ------------------------------------------------------
 * mainEntity a partir de shell.faqItems: misma fuente que debería
 * mostrarse en texto plano en la sección "Preguntas frecuentes" del
 * cuerpo -- este módulo no valida esa paridad (ver validar-precios-
 * cuerpo.js para el patrón de validador que haría falta si se quisiera
 * chequear también acá). */
function generarFaq(shell) {
  const items = shell.faqItems;
  if (!items || !items.length) return null;
  const id = idBase(shell);
  const obj = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": id + "#faq",
    inLanguage: IN_LANGUAGE,
    about: { "@id": id + "#negocio" },
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.question,
      acceptedAnswer: { "@type": "Answer", text: it.answer },
    })),
  };
  const comentario =
    "<!-- FAQPage (SEO): mismas preguntas y respuestas visibles en la\n" +
    "     seccion \"Preguntas frecuentes\" del <body>, en texto plano.\n" +
    "     Habilita que Google pueda mostrar estas preguntas como rich\n" +
    "     snippet en el resultado de busqueda. -->\n";
  return `${comentario}<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n</script>\n`;
}

/* ---- webPageBlockRaw ---------------------------------------------------
 * dateModified se deja como placeholder __DATE_MODIFIED__: build-fichas.js
 * ya sabe reemplazarlo por la fecha real de último commit (mismo criterio
 * que footerLine3) -- no se toca esa parte del pipeline. */
function generarWebPage(shell) {
  const id = idBase(shell);
  const obj = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": id + "#webpage",
    url: shell.canonical,
    name: shell.title,
    inLanguage: IN_LANGUAGE,
    isPartOf: {
      "@type": "WebSite",
      "@id": shell.siteOrigin + "/#website",
      url: shell.siteOrigin + "/",
      name: SITE_NAME,
    },
    about: { "@id": id + "#negocio" },
    breadcrumb: { "@id": id + "#breadcrumb" },
    dateModified: "__DATE_MODIFIED__",
  };
  return `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n</script>\n`;
}

module.exports = { generarNegocioJsonLd, generarBreadcrumb, generarFaq, generarWebPage };

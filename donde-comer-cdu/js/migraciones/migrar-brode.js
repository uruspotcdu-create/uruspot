"use strict";
const fs = require("fs");
const shell = JSON.parse(fs.readFileSync("ficha.json", "utf8"));

const orig = JSON.parse(shell.jsonLdRaw);

shell.negocio = {
  tipo: orig["@type"],
  descripcion: orig.description,
  imagenes: orig.image,
  telefono: orig.telephone,
  priceRange: orig.priceRange,
  servesCuisine: orig.servesCuisine,
  hasMenu: orig.hasMenu,
  sameAs: orig.sameAs,
  address: {
    streetAddress: orig.address.streetAddress,
    addressLocality: orig.address.addressLocality,
    addressRegion: orig.address.addressRegion,
    addressCountry: orig.address.addressCountry,
  },
  hasMap: orig.hasMap,
  geo: { latitude: orig.geo.latitude, longitude: orig.geo.longitude },
  amenityFeature: orig.amenityFeature.map((a) => ({ name: a.name, value: a.value })),
  makesOffer: orig.makesOffer.map((o) => ({
    name: o.itemOffered.name,
    price: o.price,
    priceCurrency: o.priceCurrency,
    availability: o.availability,
  })),
  openingHoursSpecification: orig.openingHoursSpecification.map((h) => ({
    dayOfWeek: h.dayOfWeek,
    opens: h.opens,
    closes: h.closes,
  })),
};

// nombreCorto: nombre de marca sin sufijo " · URU SPOT" (ver comentario
// en ficha-jsonld.js sobre por qué esto es un campo explícito y no un
// recorte de ogTitle/title por un separador multibyte).
shell.nombreCorto = "Brødë";

// rubro: "Gastronomía" -> siteOrigin + "/donde-comer-cdu/" (mismo dato
// que ya estaba a mano en breadcrumbBlockRaw, ver _comentario_breadcrumb).
shell.rubro = { label: "Gastronomía", path: "/donde-comer-cdu/" };

// faqItems: extraidos de faqBlockRaw (mainEntity), mismas 8 preguntas.
const faqMatch = shell.faqBlockRaw.match(
  /<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/
);
const faqOrig = JSON.parse(faqMatch[1]);
shell.faqItems = faqOrig.mainEntity.map((q) => ({
  question: q.name,
  answer: q.acceptedAnswer.text,
}));

// Campos ahora generados -- se borran (dead code si quedan, y el propio
// comentario de ficha-template.js dice que se borran recien cuando la
// ficha ya migro). faviconBlockRaw/robotsBlockRaw tambien se borran:
// el template los hardcodea (identicos en las 1500 fichas), nunca leyo
// estos 2 campos -- confirmado en la auditoria anterior.
delete shell.jsonLdRaw;
delete shell.breadcrumbBlockRaw;
delete shell.faqBlockRaw;
delete shell.webPageBlockRaw;
delete shell.faviconBlockRaw;
delete shell.robotsBlockRaw;
delete shell._comentario_jsonld;
delete shell._comentario_breadcrumb;
delete shell._comentario_faq;
delete shell._comentario_webpage;
delete shell._comentario_bloques;

shell._comentario_negocio =
  "[MIGRADO, generador ficha-jsonld.js] negocio/rubro/faqItems reemplazan " +
  "a jsonLdRaw/breadcrumbBlockRaw/faqBlockRaw/webPageBlockRaw escritos a " +
  "mano: ficha-template.js arma esos 4 bloques a partir de estos campos " +
  "en cada build. faviconBlockRaw/robotsBlockRaw se eliminaron: nunca " +
  "los leia el template (hardcodeados ahi, identicos en las 1500 fichas), " +
  "eran campos muertos que invitaban a editarlos sin efecto real.";

fs.writeFileSync("ficha.json", JSON.stringify(shell, null, 2), "utf8");
console.log("Migrado OK.");

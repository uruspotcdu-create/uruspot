# Auditoría "Brode 2026-08" — reconstrucción desde comentarios del código

**Contexto:** varios archivos del repo (51 `locales/<slug>/index.html`,
`donde-comer-cdu/js/ficha-template.js`, `locales/brode/cuerpo.html`)
referencian una auditoría de agosto de 2026 hecha sobre la ficha de Brode,
incluyendo una lista numerada de hallazgos ("ver Critico 1"). Esa lista no
existe como documento commiteado en ningún lugar del repo — solo quedan
las referencias sueltas en comentarios. Este archivo junta lo que SÍ es
verificable citando el propio código, para no perder el rastro. No inventa
ítems: si hubo un "Crítico 2", "Crítico 3", etc., no hay evidencia de ellos
en el repo actual.

## Hallazgos confirmados por comentarios existentes

### "Crítico 1" — Favicon/manifest faltante en las fichas
Citado literalmente en 51 archivos `locales/<slug>/index.html`:

> "Favicon/manifest (paridad con donde-comer-cdu/index.html, auditoria
> Brode 2026-08: faltaban por completo en las fichas - ver Critico 1)."

**Estado (verificado 2026-08, auditoría "ficha madre"):** resuelto. Las 51
fichas, incluida Brode, tienen hoy los 4 `<link rel="icon"/manifest/
apple-touch-icon">` en el `<head>`.

### Ritmo editorial de la sección de catálogo
Citado en `locales/brode/cuerpo.html` (sección "CATÁLOGO"):

> "RITMO EDITORIAL (auditoría Brode, 2026-08): esta es la sección que
> contiene 'Menú oficial en vivo' y 'Confirmar precios vigentes' — el
> mismo bloque flagueado como poco legible. Se envuelve en una franja de
> ancho completo con .section-warm [...] en vez de dejarla como una
> .page blanca más [...]."

**Estado:** resuelto — la sección ya usa `.section-warm` en el HTML actual.

### Preload de imagen del hero condicional
Citado en `locales/brode/index.html` y en `ficha-template.js`: el preload
de `shell.imagePath` pasó a ser condicional (antes se emitía siempre, con
`href="undefined"` en fichas sin imagen de hero, rompiendo el preload en
las 50 fichas viejas de esa época).

**Estado:** resuelto — confirmado en el generador actual
(`ficha-template.js`), el preload solo se emite si `shell.imagePath` existe.

## Lo que no se pudo reconstruir

No hay en el repo ningún archivo, commit message extendido, ni comentario
adicional que enumere más ítems de esta auditoría más allá de los tres de
arriba. Si existieron más hallazgos "Crítico 2", "Crítico 3", etc., vivían
fuera del repo (conversación externa, documento no versionado) y se
perdieron. **Recomendación para futuras auditorías de este tipo:** cuando
se complete una auditoría con una lista numerada de hallazgos, commitear
esa lista completa en `docs/historial/` en el mismo cambio que corrige el
primer ítem — no solo referenciarla desde comentarios sueltos en el
código, que quedan huérfanos apenas la lista original se pierde.

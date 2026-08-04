# ROADMAP.md — URU SPOT

> Prioridades basadas en hallazgos verificados de esta auditoría más los
> ítems ya documentados como pendientes por el propio repo
> (`URUSPOT-PENDIENTES-VERIFICADO-287.md`, fechado 2026-07-29 — ⚠ ese
> documento ya está parcialmente desactualizado: afirma que no existe
> Service Worker y que el manifest no tiene ícono `maskable`, pero en
> esta auditoría **sí** encontré `sw.js` (8.940 B) y `manifest.json` **sí**
> tiene íconos con `"purpose": "maskable"` — es decir, esos dos puntos ya
> se resolvieron entre el 29-jul y el 03-ago. Se listan abajo solo los
> ítems de ese documento que reconfirmé como aún vigentes por evidencia
> propia en esta pasada, más los hallazgos nuevos de esta auditoría).

---

## Prioridad P0 — antes de cualquier otra cosa

### P0-1. Regenerar y sincronizar los bundles de producción
**Motivo:** el fuente actual de `motor-exposicion.js`, `locales-slug.js`
y `app.js` tiene lógica que el bundle commiteado (`motor.bundle.js`,
`app.min.js`) no tiene — confirmado reconstruyendo los bundles y
diffeando en esta sesión (ver ARCHITECTURE.md §9).
**Impacto:** alto — el usuario real hoy no recibe el comportamiento que
el fuente auditado y testeado dice tener (6 locales nuevos con slug no
resueltos en producción, priorización de fichas propias ausente).
**Dificultad estimada:** trivial (correr `npm run build:bundles` y
commitear) — el trabajo real es evitar que vuelva a pasar (ver P0-3).
**Archivos afectados:** `donde-comer-cdu/js/motor.bundle.js`,
`donde-comer-cdu/js/app.min.js`, y confirmar
`donde-comer-cdu/js/ambiente.bundle.js` línea por línea (diferencia
mínima detectada, no reconciliada en esta pasada).

### P0-2. Confirmar y arreglar el endpoint de reseñas (`/reviews`)
**Motivo:** `functions/reviews.js`/`reviews-admin.js` están en
`donde-comer-cdu/js/functions/`, fuera de la carpeta `/functions` que
Cloudflare Pages indexa por convención — inferencia de alta confianza de
que `/reviews` da 404 en producción (no confirmado contra el sitio real
por falta de red desde este entorno).
**Impacto:** alto y visible al usuario — cada una de las 51 fichas
probablemente muestra un error de carga de reseñas hoy.
**Dificultad estimada:** baja — mover los 2 archivos a `/functions/` en
la raíz (verificando que las rutas internas que referencian sigan
siendo correctas) y confirmar el binding `REVIEWS_KV` en el dashboard de
Cloudflare.
**Archivos afectados:** `donde-comer-cdu/js/functions/reviews.js`,
`donde-comer-cdu/js/functions/reviews-admin.js` (mover a `/functions/`),
`donde-comer-cdu/js/ficha.js` (verificar que las URLs relativas de fetch
sigan siendo correctas tras el move).

### P0-3. Safeguard automático contra drift bundle-vs-fuente
**Motivo:** este es el segundo bug real de este tipo (el primero causó
el problema de pinch-zoom histórico; el de P0-1 es el segundo,
descubierto en esta misma auditoría). El CI actual
(`.github/workflows/tests-visuales.yml`) solo corre Playwright — no
corre `run-tests.js` ni verifica bundles.
**Impacto:** previene que esta clase de bug se repita una tercera vez.
**Dificultad estimada:** media — agregar un paso a CI que (a) corra
`node donde-comer-cdu/js/run-tests.js`, y (b) regenere los bundles en un
directorio temporal y compare (`diff`) contra los commiteados, fallando
el build si hay diferencia no explicada por el timestamp del comentario
de cabecera.
**Archivos afectados:** `.github/workflows/tests-visuales.yml` (o un
workflow nuevo dedicado).

---

## Prioridad P1 — mejoras importantes

Reconfirmado vigente contra `URUSPOT-PENDIENTES-VERIFICADO-287.md` +
evidencia propia de esta pasada (⚠ no re-verifiqué cada uno línea por
línea en el código, solo los que cito con archivo concreto):

- **`recortePorIniciativaPropiaExplicado()` sin conectar a `app.js`.**
  La versión "con razones" del motor de exposición existe y está
  testeada, pero `app.js` seguía (a la fecha de ese documento) usando la
  versión muda. Alto impacto de UX (transparencia de por qué se muestra
  cada lugar) por bajo riesgo arquitectónico. ⚠ No reconfirmé en esta
  pasada si esto sigue así — recomendado como primer chequeo antes de
  planificar el trabajo.
- **Rating ausente en las tarjetas del flujo principal** (solo aparece en
  "Destacados"). El dato ya está disponible en el registro — falta
  plantilla.
- **6 canonical rotos hacia GitHub Pages** en las landing pages SEO
  temáticas (`los-mejores-bares-cdu`, `las-mejores-hosterias-cdu`,
  `las-mejores-heladerias-cdu`, `los-mejores-gimnasios-cdu`,
  `las-mejores-panaderias-cdu`, `los-mejores-restaurantes-cdu`) + el
  typo de canonical en `locales/parrilla-la-gruta/index.html` (apunta a
  `/locales/la-gruta/`, carpeta inexistente) + las 61 subpáginas de
  `los-mejores-restaurantes-cdu/*/` con canonical hacia una ruta
  `donde-comer-cdu/locales/<nombre>/` que no existe.
- **`rubros-meta.js` sigue portando el color en hex directo** en vez del
  nombre del token semántico — el token ya existe en `tokens.css`
  (`--color-rubro-*`), falta solo la migración de esa referencia.
- **Ampliar cobertura de fichas propias** más allá de las 51 actuales
  (decisión de producto explícitamente pendiente en auditorías previas,
  ver MVP.md).
- **Confirmar exposición real de `lugares-mapa.json` en el deploy vivo**
  — el `_redirects` que lo bloquea está commiteado y correcto, pero su
  efectividad en producción no fue reconfirmada con una petición real
  en esta pasada (sí en una sesión anterior, según contexto — recomendado
  reconfirmar tras cualquier cambio de configuración de Cloudflare).

## Prioridad P2 — optimización avanzada y funcionalidades futuras

- **Separación cualitativa de Guía vs. Exploración en el mapa** (hoy
  solo difieren en cantidad de resultados, no en tratamiento visual del
  mapa) — cambio de mayor alcance, requiere diseño antes de tocar CSS/
  `motor-render.js`.
- **Vista de comparación/evaluación** entre lugares guardados (etapa de
  journey identificada en trabajo de UX previo, sin implementar).
- **Brújula funcional interactiva** (bearing en tiempo real) más allá de
  la familia decorativa ya existente del Ambient Engine.
- **Mapa embebido en cada ficha individual** (hoy las fichas no tienen
  ningún mapa ni coordenadas visibles, solo texto de dirección/contacto).
- **Unificación del scheduler del Ambient Engine** con el resto del
  motor de renderizado (`motor-render.js`) en un motor único, tal como
  se venía evaluando en sesiones previas — explícitamente diferido hasta
  medir si el desacople actual (Fase 6, ya commiteado) es suficiente.
- **Cobertura completa de tiles de mapa** — solo 10 archivos de tile
  existen hoy; confirmar si cubre el área real del catálogo o falta
  generar más.
- **Conversión de las últimas fotos `.jpg`/`.png` legacy a `.webp`**
  donde aún no se haya hecho.
- **Medición fresca de performance mobile** (FPS/CPU/memoria) post
  Fase 6 del Ambient Engine — la única cifra disponible (~25 fps) es
  anterior a esa optimización y ya no es representativa del estado
  actual del código (aunque sí lo era del bundle desactualizado que
  probablemente sigue en producción — ver P0-1, lo cual hace la
  remedición doblemente prioritaria una vez resuelto P0-1).

---

## Nota final sobre este roadmap

Este roadmap prioriza por lo que pude **verificar directamente contra el
código real** en esta sesión. El repo ya tiene un documento propio,
mucho más largo y detallado en el plano de producto/UX
(`URUSPOT-PENDIENTES-VERIFICADO-287.md`, 287 líneas, del cual leí
aproximadamente el primer tercio en esta pasada), que probablemente
contiene más ítems P1/P2 no listados acá — especialmente en las
secciones que no llegué a revisar (Componentes/Design System más allá de
`rubros-meta.js`, y cualquier sección posterior a "SEO/Infraestructura").
Recomendado como el primer insumo a incorporar en la próxima iteración
de este ROADMAP.

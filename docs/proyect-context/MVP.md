# MVP.md — URU SPOT

> Análisis de producto sobre el estado real verificado del código (ver
> PROJECT_CONTEXT.md y ARCHITECTURE.md). No incluye supuestos de negocio
> que no estén respaldados por el código o por contenido del propio
> repositorio (ej. `URUSPOT-PENDIENTES-VERIFICADO-287.md`, ⚠ no leído
> línea por línea en esta pasada — recomendado como siguiente insumo).

---

## MVP actual

**Ya forma un producto mínimo viable, verificado en funcionamiento:**
- Catálogo verificado con descubrimiento inteligente (no solo lista
  estática) — motor de scoring con diversidad y exploración.
- Búsqueda tolerante a errores + filtro por rubro + geolocalización.
- Persistencia de preferencias del usuario (favoritos, estado de sesión)
  sin necesidad de cuenta/login.
- Mapa interactivo propio, con clustering y virtualización por tiles.
- 51 fichas de lugares con contenido propio (no solo enlace a Maps).
- PWA instalable.
- SEO: sitemap, JSON-LD (schema de restaurantes vía script dedicado),
  8 landing pages temáticas adicionales para captar tráfico de búsqueda
  long-tail ("mejores heladerías CdU", etc.).
- Tests automatizados de lógica (5/5 suites) + regresión visual
  (Playwright + CI en GitHub Actions).

**Qué falta para considerarlo listo para usuarios reales a escala
completa** (no para "funciona", sino para "no tiene fricciones ni
riesgos visibles para un usuario nuevo o para el negocio):
1. **Confirmar y arreglar las reseñas propias** (ARCHITECTURE.md §8) —
   si están rotas, cualquier ficha muestra un error visible al usuario
   real hoy mismo. Esto es lo más urgente porque es *visible* para el
   usuario final, no solo interno.
2. **Regenerar y verificar los bundles de producción** (ARCHITECTURE.md
   §9) — el fuente ya tiene mejoras (priorización de fichas propias) que
   el usuario real todavía no recibe.
3. Cobertura de fichas propias vs. tamaño del catálogo: solo 51 lugares
   de un catálogo bastante más grande (⚠ no confirmé el total exacto de
   `lugares-core.json` en esta pasada — sesiones previas documentadas en
   memoria mencionan un padrón de +1.500 lugares en la fuente cruda,
   pero eso incluye pendientes de verificación) tienen ficha propia con
   reseñas. El resto depende de enlace directo a Google Maps. Esto ya
   fue marcado como decisión de producto pendiente en auditorías previas
   (ampliar fichas vs. ajustar el copy que da a entender más cobertura).
4. Cobertura de tiles de mapa: solo 10 archivos de tile existen — ⚠ no
   confirmé si esto es suficiente para el área geográfica real del
   catálogo o es trabajo en progreso.

## Funciones esenciales

### Obligatorias antes de cualquier lanzamiento/promoción amplia
- Reseñas propias funcionando en producción (o, si la decisión de
  producto es no arreglarlas todavía, ocultar la sección en vez de
  mostrar un error).
- Bundles sincronizados con el fuente (proceso, no solo el fix puntual —
  ver ROADMAP P0 para la propuesta de safeguard).
- Verificar que `/donde-comer-cdu/lugares-mapa.json` efectivamente
  devuelve 404 en producción (el `_redirects` está commiteado, pero su
  efectividad real en el deploy vivo no fue reconfirmada en esta
  auditoría).

### Importantes después del lanzamiento inicial
- Ampliar cobertura de fichas propias (o ajustar expectativas de copy
  mientras tanto).
- Confirmar cobertura completa de tiles de mapa.
- Baseline de regresión visual confirmado y mantenido activamente (ya
  existe infraestructura — Playwright + CI — falta solo disciplina de
  uso continuo, no una feature nueva).
- Medición de performance real en dispositivos de gama media/baja
  (ver PERFORMANCE_AUDIT.md — hay una captura histórica de una sesión
  anterior, pero no una medición fresca de esta auditoría).

### Futuras
- Expansión de rubros/categorías más allá de los 14 grupos actuales del
  padrón (mencionado en contexto de sesiones previas como trabajo en
  curso — "cobertura total de profesionales y servicios" — pero fuera
  del alcance de lo verificable en el código de la app en sí, es trabajo
  de datos).
- Posible unificación del "Ambient Engine" en un motor de scheduler más
  general (ya explorado conceptualmente en sesiones previas, no
  implementado — desacoplamiento de frecuencias de update/render/física).

## Riesgos de producto

**Qué podría impedir adopción:**
- Una ficha con reseñas rotas visiblemente (mensaje de error) transmite
  "sitio abandonado/con errores" a un usuario nuevo que llega justo por
  SEO a esa página — es el peor lugar posible para tener un bug visible,
  porque las landing pages SEO temáticas (`los-mejores-restaurantes-cdu`,
  etc.) probablemente dirigen tráfico frío exactamente ahí.
- Discrepancia entre lo que el catálogo promete ("padrón completo") y la
  cobertura real de fichas propias (51 de un catálogo mayor) — riesgo de
  percepción de incompletitud si el usuario nota que la mayoría de los
  lugares solo tiene un botón a Maps.

**Qué genera fricción:**
- Sin login/cuenta, los favoritos y el estado de sesión viven solo en
  `localStorage` de ese navegador/dispositivo — un usuario que cambia de
  dispositivo pierde su lista guardada. (Decisión de producto válida
  para un MVP, pero es una fricción real si el uso esperado es
  multi-dispositivo.)
- El "cargar más" (paginación de a 8) descrito en sesiones previas como
  parcialmente decorativo en ciertas ramas (nunca aparece en "Guía" por
  el tamaño del recorte) podría generar la sensación de una lista más
  chica de lo que realmente es el catálogo, en las ramas donde no
  pagina.

**Qué debería validarse primero (antes de invertir en features nuevas):**
1. Confirmar en producción real si `/reviews` responde (P0 técnico, alto
   impacto de producto).
2. Confirmar que el deploy actual ya tiene los bundles regenerados (o
   regenerarlos ya) — de lo contrario cualquier trabajo nuevo sobre el
   fuente sigue sin llegar a producción hasta que alguien note el drift.
3. Levantar y priorizar el contenido completo de
   `URUSPOT-PENDIENTES-VERIFICADO-287.md` — el repo ya tiene un
   documento de 287 líneas de pendientes verificados que no fue leído en
   detalle en esta pasada y es, probablemente, la fuente más directa de
   verdad sobre qué falta desde la perspectiva de quien lo escribió.

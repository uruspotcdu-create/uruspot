# DEVELOPMENT_GUIDELINES.md — URU SPOT

> Reglas derivadas de patrones reales y consistentes observados en el
> código (no inventadas). Para reglas más extensas de diseño/UX/design
> system, el propio `AGENTS.md` del repo sigue siendo una referencia
> válida y más detallada en esos capítulos específicos — este documento
> se enfoca en el *proceso* de trabajo sobre el repo, verificado contra
> el estado actual.

## 1. Antes de tocar cualquier cosa

1. **Corré la suite de tests**: `node donde-comer-cdu/js/run-tests.js`.
   Debe dar 5/5 suites en verde antes de empezar y después de cualquier
   cambio. Es rápida (corre en segundos, sin red, sin browser).
2. **Leé la cabecera del archivo que vas a tocar.** La convención de
   este repo es documentar el "por qué" en prosa al inicio de cada
   módulo — no es boilerplate, contiene contrato público, decisiones no
   obvias, y (en `motor-plano.js`) una política explícita de no narrar
   historial de cambios en el comentario (eso vive en git).
3. **Si vas a tocar `js/` o CSS que entra en un bundle, revisá primero
   si el bundle commiteado está sincronizado con el fuente**
   (`npm run build:bundles` y `git diff` después — si hay diff en algo
   que no tocaste vos, el bundle ya estaba desactualizado antes de tu
   cambio; investigá por qué antes de mezclar tu cambio con ese drift).
4. **Si el cambio toca `donde-comer-cdu/index.html`**, tené en cuenta
   que el orden de `<script>` es una dependencia implícita real, no
   solo estilo.

## 2. Convenciones a seguir

- **Español en todo**: identificadores de código, comentarios, mensajes
  de usuario, nombres de test. No mezclar inglés salvo en palabras ya
  establecidas del ecosistema web (`fetch`, `localStorage`, nombres de
  eventos DOM).
- **Namespace global con prefijo claro** (`URU_*`, `Ambiente*`) para
  cualquier cosa nueva que se cuelgue de `window` — no usar nombres
  genéricos que puedan colisionar (ya hubo una colisión real detectada
  y corregida en una sesión previa: dos funciones `Se()` en el mismo
  scope).
- **Separar funciones puras de las impuras**, con un comentario de
  sección marcando el límite, siguiendo el patrón de `motor-plano.js`.
  Las puras van primero y deben ser testeables sin DOM/red.
- **No usar frameworks de testing externos.** Los tests de este repo son
  Node puro a mano (`run-tests.js` como orquestador de las 5 suites).
  Si se agrega un test nuevo, seguir el mismo patrón (función que
  imprime `✓ descripción en español` o falla con mensaje claro).
- **No editar los archivos `*.bundle.js`/`*.min.js`/`critical.bundle.css`
  a mano.** Son generados. Cualquier fix va al fuente correspondiente y
  se regenera con `npm run build:bundles`.
- **No mover `donde-comer-cdu/.fuente/lugares-mapa.json`** sin actualizar
  también la ruta relativa fija en `split_dataset.py` y sin revisar el
  `_redirects` que bloquea su acceso HTTP directo.
- **Cloudflare Pages Functions van en `/functions` (raíz del repo), no
  en subcarpetas.** Esto es una regla de la plataforma, no de estilo —
  verificá que cualquier función nueva quede en esa ubicación exacta
  para que Cloudflare la rutee (ver el hallazgo de `reviews.js` en
  ARCHITECTURE.md §8 como ejemplo de qué pasa si no se respeta).

## 3. Qué evitar romper

- La firma pública de `motor-plano.js` (ver ARCHITECTURE.md §12).
- El `view-transition-name` compartido entre tarjeta y ficha.
- La lista `REQUIRED_DOM_IDS` en `app.js` vs. los IDs reales del HTML —
  deben mantenerse sincronizados o la app falla al iniciar.
- El scheduler único del Ambient Engine — no registrar un
  `requestAnimationFrame` ni un listener de `visibilitychange` nuevo por
  fuera de `ambiente-scheduler.js` si el módulo nuevo es una tarea
  animada; usar el scheduler compartido, tal como hacen
  `ambiente-rendimiento.js` y `ambiente-respiracion.js` (verificado por
  test que exige exactamente esto).
- Los 5 tests suites deben seguir en 5/5 después de cualquier cambio.

## 4. Cómo hacer cambios seguros

1. Cambio pequeño y acotado, en el fuente (nunca en el bundle).
2. Correr `node donde-comer-cdu/js/run-tests.js` — debe seguir en 5/5.
3. Si el cambio afecta algo visual, correr la suite de Playwright
   (`npx playwright test`) contra el baseline existente en
   `tests/visual/__baseline__/` — o al menos revisar manualmente contra
   los screenshots de referencia si no hay browser disponible en el
   entorno de quien hace el cambio.
4. Regenerar bundles si el cambio tocó algo que se bundlea:
   `npm run build:bundles`.
5. Confirmar `git diff` de los bundles regenerados — si hay cambios que
   no esperabas ahí, significa que había drift previo sin relación a tu
   cambio; documentarlo aparte, no mezclarlo silenciosamente.
6. Commit con mensaje claro; este repo no tiene convención estricta de
   Conventional Commits observada, pero sí mensajes descriptivos en
   español que explican el motivo, no solo el qué.

## 5. Cómo probar cambios

- **Lógica de negocio / motor**: `node donde-comer-cdu/js/run-tests.js`
  (unit tests puros, sin browser, rápidos).
- **Visual/regresión de UI**: `npx playwright test` (requiere
  `npx playwright install --with-deps chromium` la primera vez) — 5
  estados × 3 viewports contra baseline ya capturado en
  `tests/visual/__baseline__/`.
- **Performance**: `npm run perf:mobile` (Lighthouse vía
  `lighthouse-mobile-uruspot.js`) — requiere Chrome/Chromium disponible
  localmente.
- **CI automático**: cualquier push/PR a `main` corre Playwright vía
  GitHub Actions (`.github/workflows/tests-visuales.yml`). **Este CI no
  corre `run-tests.js` (las 5 suites de lógica) ni verifica que los
  bundles estén sincronizados** — ambas cosas quedan hoy 100% en manos
  de quien hace el cambio. Ver ROADMAP.md P0 para la propuesta de cerrar
  ese hueco.

## 6. Cómo mantener calidad

- Preferir cambios incrementales, verificados paso a paso, sobre
  refactors grandes de una sola vez — es el patrón de trabajo que el
  propio historial de decisiones de este proyecto (documentado en
  contexto de sesiones previas) confirma como preferido explícitamente
  por DSA.
- Cuando algo no se pueda verificar en el entorno de desarrollo (sin
  red al dominio real, sin browser headless disponible), **decirlo
  explícitamente** en vez de asumir que funciona — es el mismo estándar
  que este propio documento intenta seguir, marcando cada afirmación no
  verificable con ⚠.
- Preferir extender el patrón existente (scheduler compartido, estado
  puro con acciones, namespace `window.URU_*`) sobre introducir un
  patrón nuevo para resolver el mismo tipo de problema.

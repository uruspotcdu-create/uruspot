# Generación automática de sitemap.xml

**Fecha de esta intervención:** 2026-07-27.
**Reemplaza:** el `sitemap.xml` estático de 10 URLs mantenido a mano, y una
primera versión de este generador (`donde-comer-cdu/js/generar-sitemap.js`)
que nunca llegó a ejecutarse con éxito por un bug de rutas.

## Cómo correrlo

```bash
npm run sitemap
# equivalente:
node scripts/generar-sitemap.js
```

Funciona sin importar desde qué directorio se invoque: resuelve la raíz del
repositorio buscando hacia arriba desde la ubicación del propio archivo
(primero vía `git rev-parse --show-toplevel`, con fallback a buscar
`robots.txt` + `donde-comer-cdu/` si no hay `.git` disponible). No depende
de `cwd`.

## Qué hace

Recorre todos los `index.html` del repositorio y decide si cada uno entra
al sitemap según su propio `<link rel="canonical">`:

1. Debe tener un canonical.
2. El canonical debe apuntar a `https://uruspot.pages.dev` (el dominio real
   de producción, no el `.github.io` viejo).
3. El canonical debe **autoreferenciarse**: su ruta debe coincidir
   exactamente con la ruta real del archivo en el filesystem. Si el HTML
   dice "la versión canónica está en otro lado", esa página no entra —
   aunque exista y tenga contenido.
4. Para fichas de `donde-comer-cdu/locales/*`, el slug debe estar
   registrado en `donde-comer-cdu/js/locales-slug.js` (la fuente de verdad
   de qué fichas están realmente enlazadas desde la app).

Después de generar el XML, valida automáticamente: buena formación XML
(via `xmllint` si está disponible, si no con un chequeo estructural
manual), ausencia de URLs duplicadas, formato de URL correcto, y que cada
URL incluida corresponda a un archivo real del repo (excepto la home, ver
abajo). Si algo falla, el script termina con código de salida distinto de
cero e imprime qué falló — no escribe un sitemap silenciosamente inválido.

## Caso especial: la home ("/")

No existe `index.html` en la raíz del repo. El repo no contiene
`_redirects`, `wrangler.toml` ni ningún workflow que copie
`inicio/index.html` a la raíz — esa configuración (si existe) vive en el
panel de Cloudflare Pages, fuera del repositorio, y no se puede verificar
desde acá. La home se incluye igual en el sitemap (estaba en el anterior,
y `inicio/index.html` se autodeclara canónico como `/`), pero queda
marcada como "sin verificar" en la salida del script. **Antes de confiar
en que `/` sirve contenido real, confirmar manualmente en el dashboard de
Cloudflare Pages cuál es la carpeta de salida configurada.**

## Por qué el sitemap quedó en 48 URLs y no en ~106

La estimación original de "45 fichas + ~61 subpáginas de rubro ≈ 106
URLs" asumía que los canonicals de esas páginas ya estaban correctos. Al
generarlo de verdad se encontró que no es así — ver el hallazgo detallado
en el informe de esta intervención. En resumen:

- Las **61 subpáginas** de `los-mejores-restaurantes-cdu/*/` tienen un
  canonical que apunta a `donde-comer-cdu/locales/<slug>/`, pero **ninguna**
  de esas 61 rutas de destino existe realmente en `donde-comer-cdu/locales/`
  (0 coincidencias). El propio HTML de esas páginas dice "no soy yo la
  versión canónica", apuntando a una URL que no existe en ningún lado. Por
  diseño (regla 3), el generador las excluye — correctamente, dado el
  estado actual del canonical, pero el resultado neto es que ese contenido
  no tiene hoy ninguna URL indexable.
- **5 de las 6 landings de rubro** (`las-mejores-heladerias-cdu`,
  `las-mejores-hosterias-cdu`, `las-mejores-panaderias-cdu`,
  `los-mejores-bares-cdu`, `los-mejores-gimnasios-cdu`) tienen canonical
  apuntando todavía al dominio viejo `uruspotcdu-create.github.io`, no a
  `uruspot.pages.dev`. El sitemap estático anterior las incluía igual, con
  URLs de `pages.dev` que contradicen lo que la propia página declara como
  canónica — una inconsistencia real que el sitemap viejo escondía.
- **1 de las 45 fichas registradas** (`parrilla-la-gruta`) tiene un
  canonical que declara `/donde-comer-cdu/locales/la-gruta/`, una ruta que
  no coincide con el nombre real de su carpeta (`parrilla-la-gruta`).

Ninguno de estos tres puntos se corrigió en esta intervención (no era el
alcance pedido: solo se corrigió el generador). Quedan documentados como
la siguiente prioridad de contenido antes de que el sitemap pueda llegar a
las ~106 URLs esperadas.

## Mantenimiento

Correr `npm run sitemap` después de agregar o quitar fichas, o cambiar
cualquier canonical. No requiere memorizar reglas: si una página nueva
tiene un canonical correcto y autoreferenciado, entra sola la próxima vez
que se corra el script.

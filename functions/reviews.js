// functions/reviews.js
// Cloudflare Pages Function — reseñas propias de URU SPOT (primera parte,
// no reempaquetadas de Google).
//
// ESQUEMA DE STORAGE (cambiado en esta revisión — ver nota PERF/RACE 2026-08-05
// más abajo): una key de KV POR RESEÑA, `reviews:<id>:<reviewId>`, en vez de
// una sola key `reviews:<id>` con un array de todas las reseñas del lugar.
// docs/project-context/ARCHITECTURE.md todavía describe el esquema viejo
// (array bajo `reviews:<id>`) — hay que actualizarlo, este comentario es la
// única fuente de verdad hasta que se corrija.
//
// Requiere un binding de KV llamado REVIEWS_KV en la configuración del
// proyecto de Cloudflare Pages (Settings → Functions → KV namespace bindings).
// No requiere nada más para funcionar: sin base de datos externa, sin build step.
//
// Diseño deliberado:
//   - Toda reseña nueva entra con estado "pendiente" y NO se cuenta en el
//     promedio ni se muestra hasta que se aprueba (ver functions/reviews-admin.js).
//     Esto es lo que la separa de un "self-serving review": las que se publican
//     pasan por una revisión antes de ser públicas, pero siguen siendo reseñas
//     reales de usuarios del sitio, no datos importados de otra plataforma.
//   - GET  /reviews?id=URU-00189      -> reseñas aprobadas + promedio + total
//   - POST /reviews  {id, autor, puntuacion, comentario, website}
//         "website" es un honeypot: si viene con contenido, se descarta en
//         silencio (200 falso) para no darle señal al bot de que fue detectado.
//
// RACE CONDITION (auditoría 2026-08-05, hallazgo #1/#2): la versión anterior
// guardaba TODAS las reseñas de un lugar bajo una sola key (`reviews:<id>`)
// y hacía get() + modificar en memoria + put(). Cloudflare KV no tiene
// compare-and-swap: dos POST casi simultáneos para el mismo lugar leen el
// mismo array, cada uno agrega su reseña en memoria, y el segundo put()
// pisaba al primero — una reseña se perdía en silencio. Fix: una key por
// reseña. Un POST nuevo ya no necesita leer nada — solo escribe su propia
// key, que ningún otro request puede pisar. Se elimina así, por completo,
// el escenario de pérdida de datos al escribir.
//
// La única race que SIGUE existiendo, y quedó así a propósito (arreglarla
// de verdad requeriría Durable Objects, fuera de alcance de esta función):
// el rate limit por IP (`ratelimit:<ip>`) sigue siendo get()+put() no
// atómico. Dos requests que lleguen dentro de la misma ventana de lectura
// pueden ambos pasar el chequeo. Consecuencia acotada a propósito: en el
// peor caso alguien manda 2 reseñas en vez de 1 en la ventana de 5 minutos
// — no hay pérdida de datos de por medio, así que se documenta como
// limitación conocida en vez de resolverse acá.
const MAX_AUTOR = 60;
const MAX_COMENTARIO = 600;
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS, ...extra },
  });
}

// Hallazgo #6: cualquier excepción no capturada (KV caído, binding
// ausente, JSON corrupto en un valor guardado) saltaba fuera de
// onRequestGet/onRequestPost sin pasar por json() — la respuesta de error
// por default de Cloudflare no lleva CORS_HEADERS, así que en el browser
// eso se ve como un error de CORS genérico en vez del 500 real, lo que
// hace perder tiempo debuggeando el síntoma equivocado. Toda esta función
// ahora se ejecuta dentro de un try/catch que sí devuelve JSON con CORS.
function errorInterno(err) {
  return json({ error: "error_interno", message: String(err && err.message || err) }, 500);
}

function sanitizeText(str, maxLen) {
  if (typeof str !== "string") return "";
  return str.trim().replace(/[<>]/g, "").slice(0, maxLen);
}

function isValidUruId(id) {
  return typeof id === "string" && /^URU-\d{5}$/.test(id);
}

// Hallazgo #3: antes se guardaba `ip_hash: ip` — la IP CRUDA bajo un
// nombre que sugería que ya estaba hasheada. Ahora hashea de verdad
// (SHA-256, hex) antes de guardar. No es reversible, sigue sirviendo para
// detectar "misma IP mandó 5 reseñas distintas" en reviews-admin.js sin
// retener la IP real en texto plano.
async function hashIp(ip) {
  const bytes = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Todas las reseñas de un lugar viven bajo el prefijo `reviews:<id>:`,
// una key por reseña. list() da los nombres; hace falta un get() por
// cada una (KV no tiene "get muchas keys de una" en el binding estándar).
async function listarResenas(env, id) {
  const prefijo = `reviews:${id}:`;
  const { keys } = await env.REVIEWS_KV.list({ prefix: prefijo });
  const valores = await Promise.all(keys.map((k) => env.REVIEWS_KV.get(k.name)));
  return valores
    .filter(Boolean)
    .map((raw) => {
      try {
        return JSON.parse(raw);
      } catch {
        return null; // un valor corrupto no debe tirar abajo toda la lista
      }
    })
    .filter(Boolean);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!isValidUruId(id)) {
      return json({ error: "id_invalido" }, 400);
    }

    const todas = await listarResenas(env, id);
    // Precalculado una sola vez por reseña en vez de en cada comparación
    // del sort (hallazgo #9 — micro-optimización, no un bug real, pero
    // gratis de resolver ya que se toca este bloque igual).
    const aprobadas = todas
      .filter((r) => r.estado === "aprobada")
      .map((r) => ({ r, ts: new Date(r.fecha).getTime() }))
      .sort((a, b) => b.ts - a.ts)
      .map((x) => x.r);

    const total = aprobadas.length;
    const promedio = total
      ? Math.round((aprobadas.reduce((s, r) => s + r.puntuacion, 0) / total) * 10) / 10
      : null;

    return json({
      id,
      promedio,
      total,
      resenas: aprobadas.map((r) => ({
        autor: r.autor,
        puntuacion: r.puntuacion,
        comentario: r.comentario,
        fecha: r.fecha,
      })),
    }, 200, { "cache-control": "public, max-age=60" });
  } catch (err) {
    return errorInterno(err);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "body_invalido" }, 400);
    }

    // Honeypot: los bots suelen completar todos los campos de un form.
    // Si "website" viene con algo, fingimos éxito y no guardamos nada.
    if (body.website) {
      return json({ ok: true }, 201);
    }

    const id = body.id;
    const autor = sanitizeText(body.autor, MAX_AUTOR);
    const comentario = sanitizeText(body.comentario, MAX_COMENTARIO);

    // Hallazgo #7: Number(true) === 1, Number([3]) === 3 — antes un
    // puntuacion: true o puntuacion: [5] pasaba como puntuación válida
    // por la coerción implícita de Number(). Ahora se exige el tipo
    // correcto de entrada antes de convertir.
    const puntuacionCruda = body.puntuacion;
    const puntuacion = typeof puntuacionCruda === "number" ? puntuacionCruda : NaN;

    if (!isValidUruId(id)) return json({ error: "id_invalido" }, 400);
    if (!autor) return json({ error: "autor_requerido" }, 400);
    if (!Number.isInteger(puntuacion) || puntuacion < 1 || puntuacion > 5) {
      return json({ error: "puntuacion_invalida" }, 400);
    }

    // Rate limit simple por IP: una reseña cada 5 minutos, para frenar
    // envíos automatizados sin necesitar infraestructura extra.
    // Limitación conocida documentada arriba: este get+put no es atómico.
    const ip = request.headers.get("cf-connecting-ip") || "desconocida";
    const rateKey = `ratelimit:${ip}`;
    const yaEnvio = await env.REVIEWS_KV.get(rateKey);
    if (yaEnvio) {
      return json({ error: "demasiadas_solicitudes" }, 429);
    }

    const reviewId = crypto.randomUUID();
    const key = `reviews:${id}:${reviewId}`;
    const resena = {
      id: reviewId,
      autor,
      puntuacion,
      comentario,
      fecha: new Date().toISOString(),
      estado: "pendiente", // se aprueba a mano vía functions/reviews-admin.js
      ip_hash: await hashIp(ip), // hash real ahora (hallazgo #3), no la IP cruda
    };

    // Sin get() previo: cada reseña es su propia key, así que no hay
    // nada que leer-modificar-escribir y no hay forma de pisar una
    // reseña ajena (hallazgo #1, resuelto por diseño de storage).
    await env.REVIEWS_KV.put(key, JSON.stringify(resena));
    await env.REVIEWS_KV.put(rateKey, "1", { expirationTtl: 300 });

    return json({ ok: true, estado: "pendiente" }, 201);
  } catch (err) {
    return errorInterno(err);
  }
}


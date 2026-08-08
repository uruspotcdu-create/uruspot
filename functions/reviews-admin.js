// functions/reviews-admin.js
// Endpoint de moderación, protegido por token. Pensado para usarse con
// curl/Postman (o un panel simple más adelante) — no tiene UI propia.
//
// Requiere, además del binding REVIEWS_KV (ver functions/reviews.js), una
// variable de entorno secreta ADMIN_TOKEN configurada en Cloudflare Pages
// (Settings → Environment variables → Encrypt). Sin ese secreto, el
// endpoint rechaza todo.
//
// GET  /reviews-admin?id=URU-00189
//      -> devuelve TODAS las reseñas de ese lugar (pendientes, aprobadas,
//         rechazadas), incluido el ip_hash, para poder moderar con criterio.
//      Header requerido: Authorization: Bearer <ADMIN_TOKEN>
//
// POST /reviews-admin  { id, review_id, accion: "aprobar" | "rechazar" }
//      Header requerido: Authorization: Bearer <ADMIN_TOKEN>
//
// ESQUEMA DE STORAGE: igual que functions/reviews.js ahora — una key de KV
// por reseña (`reviews:<id>:<reviewId>`), no un array bajo `reviews:<id>`.
// Ver el comentario largo en reviews.js (2026-08-05) para el porqué.

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorInterno(err) {
  // Hallazgo #6: mismo problema que en reviews.js — sin try/catch
  // alrededor de las llamadas a KV, un fallo tiraba una excepción sin
  // pasar por json(), perdiendo el formato de respuesta consistente que
  // usa el resto de este archivo.
  return json({ error: "error_interno", message: String(err && err.message || err) }, 500);
}

function isValidUruId(id) {
  // Hallazgo #8: antes este archivo no validaba el formato de `id` como
  // sí lo hace reviews.js — aceptaba cualquier string como sufijo de key
  // de KV. Sin impacto de seguridad real (ya está detrás de auth), pero
  // sin esto un typo en el id devuelve silenciosamente "sin reseñas" en
  // vez de avisar que el id está mal formado.
  return typeof id === "string" && /^URU-\d{5}$/.test(id);
}

// Hallazgo #4: la comparación anterior (`header === \`Bearer ${token}\``)
// corta en el primer byte que no coincide — en teoría filtra, por tiempo
// de respuesta, cuántos caracteres iniciales del token adivinó un
// atacante. Acá se compara siempre el largo COMPLETO de ambos strings sin
// cortar antes (constant-time real, no depende de crypto.subtle ni de
// APIs de Node que no existen en el runtime de Cloudflare Workers).
function compararConstante(a, b) {
  const bytesA = new TextEncoder().encode(a);
  const bytesB = new TextEncoder().encode(b);
  // Si difieren en longitud ya sabemos que no matchean, pero igual se
  // recorre el máximo de los dos largos para no filtrar la longitud del
  // secreto por la cantidad de iteraciones que tarda en volver.
  const largoMax = Math.max(bytesA.length, bytesB.length);
  let diferencia = bytesA.length === bytesB.length ? 0 : 1;
  for (let i = 0; i < largoMax; i++) {
    const byteA = i < bytesA.length ? bytesA[i] : 0;
    const byteB = i < bytesB.length ? bytesB[i] : 0;
    diferencia |= byteA ^ byteB;
  }
  return diferencia === 0;
}

function autorizado(request, env) {
  if (!env.ADMIN_TOKEN) return false;
  const header = request.headers.get("authorization") || "";
  return compararConstante(header, `Bearer ${env.ADMIN_TOKEN}`);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    if (!autorizado(request, env)) return json({ error: "no_autorizado" }, 401);
    if (!env.REVIEWS_KV) return json({ error: "kv_no_configurado" }, 500);

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id_requerido" }, 400);
    if (!isValidUruId(id)) return json({ error: "id_invalido" }, 400);

    const prefijo = `reviews:${id}:`;
    const { keys } = await env.REVIEWS_KV.list({ prefix: prefijo });
    const valores = await Promise.all(keys.map((k) => env.REVIEWS_KV.get(k.name)));
    const lista = valores
      .filter(Boolean)
      .map((raw) => {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    return json({ id, resenas: lista });
  } catch (err) {
    return errorInterno(err);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    if (!autorizado(request, env)) return json({ error: "no_autorizado" }, 401);
    if (!env.REVIEWS_KV) return json({ error: "kv_no_configurado" }, 500);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "body_invalido" }, 400);
    }

    const { id, review_id, accion } = body;
    if (!id || !review_id || !["aprobar", "rechazar"].includes(accion)) {
      return json({ error: "parametros_invalidos" }, 400);
    }
    if (!isValidUruId(id)) return json({ error: "id_invalido" }, 400);

    // Hallazgo #5, ahora reducido en vez de eliminado: con una key por
    // reseña, este get+put ya solo puede pisar una aprobación/rechazo
    // concurrente de ESA MISMA reseña puntual (antes podía pisar
    // cualquier cambio de estado de CUALQUIER reseña del lugar). Cerrar
    // ese último margen del todo requeriría Durable Objects; dado que
    // este endpoint lo opera un solo admin con un solo token, el riesgo
    // remanente es aceptable y se documenta acá en vez de resolverse.
    const key = `reviews:${id}:${review_id}`;
    const raw = await env.REVIEWS_KV.get(key);
    if (!raw) return json({ error: "resena_no_encontrada" }, 404);

    let resena;
    try {
      resena = JSON.parse(raw);
    } catch {
      return json({ error: "resena_corrupta" }, 500);
    }

    resena.estado = accion === "aprobar" ? "aprobada" : "rechazada";
    await env.REVIEWS_KV.put(key, JSON.stringify(resena));

    return json({ ok: true, id, review_id, estado: resena.estado });
  } catch (err) {
    return errorInterno(err);
  }
}


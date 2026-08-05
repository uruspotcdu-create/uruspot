// functions/reviews.js
// Cloudflare Pages Function — reseñas propias de URU SPOT (primera parte,
// no reempaquetadas de Google). Guardadas en KV bajo la key `reviews:<id>`.
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

function sanitizeText(str, maxLen) {
  if (typeof str !== "string") return "";
  return str.trim().replace(/[<>]/g, "").slice(0, maxLen);
}

function isValidUruId(id) {
  return typeof id === "string" && /^URU-\d{5}$/.test(id);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!isValidUruId(id)) {
    return json({ error: "id_invalido" }, 400);
  }
return json({
  bindings: Object.keys(env),
  reviews_kv: !!env.REVIEWS_KV
});

  const raw = await env.REVIEWS_KV.get(`reviews:${id}`);
  const todas = raw ? JSON.parse(raw) : [];
  const aprobadas = todas
    .filter((r) => r.estado === "aprobada")
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

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
}

export async function onRequestPost(context) {
  const { request, env } = context;

return json({
  bindings: Object.keys(env),
  reviews_kv: !!env.REVIEWS_KV
});

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
  const puntuacion = Number(body.puntuacion);

  if (!isValidUruId(id)) return json({ error: "id_invalido" }, 400);
  if (!autor) return json({ error: "autor_requerido" }, 400);
  if (!Number.isInteger(puntuacion) || puntuacion < 1 || puntuacion > 5) {
    return json({ error: "puntuacion_invalida" }, 400);
  }

  // Rate limit simple por IP: una reseña cada 5 minutos, para frenar
  // envíos automatizados sin necesitar infraestructura extra.
  const ip = request.headers.get("cf-connecting-ip") || "desconocida";
  const rateKey = `ratelimit:${ip}`;
  const yaEnvio = await env.REVIEWS_KV.get(rateKey);
  if (yaEnvio) {
    return json({ error: "demasiadas_solicitudes" }, 429);
  }

  const key = `reviews:${id}`;
  const raw = await env.REVIEWS_KV.get(key);
  const lista = raw ? JSON.parse(raw) : [];

  lista.push({
    id: crypto.randomUUID(),
    autor,
    puntuacion,
    comentario,
    fecha: new Date().toISOString(),
    estado: "pendiente", // se aprueba a mano vía functions/reviews-admin.js
    ip_hash: ip, // guardado para moderación/anti-abuso; no se expone en GET
  });

  await env.REVIEWS_KV.put(key, JSON.stringify(lista));
  await env.REVIEWS_KV.put(rateKey, "1", { expirationTtl: 300 });

  return json({ ok: true, estado: "pendiente" }, 201);
}

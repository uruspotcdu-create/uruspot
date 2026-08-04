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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function autorizado(request, env) {
  if (!env.ADMIN_TOKEN) return false;
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${env.ADMIN_TOKEN}`;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!autorizado(request, env)) return json({ error: "no_autorizado" }, 401);
  if (!env.REVIEWS_KV) return json({ error: "kv_no_configurado" }, 500);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "id_requerido" }, 400);

  const raw = await env.REVIEWS_KV.get(`reviews:${id}`);
  const lista = raw ? JSON.parse(raw) : [];
  return json({ id, resenas: lista });
}

export async function onRequestPost(context) {
  const { request, env } = context;
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

  const key = `reviews:${id}`;
  const raw = await env.REVIEWS_KV.get(key);
  const lista = raw ? JSON.parse(raw) : [];
  const idx = lista.findIndex((r) => r.id === review_id);
  if (idx === -1) return json({ error: "resena_no_encontrada" }, 404);

  lista[idx].estado = accion === "aprobar" ? "aprobada" : "rechazada";
  await env.REVIEWS_KV.put(key, JSON.stringify(lista));

  return json({ ok: true, id, review_id, estado: lista[idx].estado });
}

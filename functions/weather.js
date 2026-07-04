// functions/weather.js
// Cloudflare Pages Function — intermediario hacia Open-Meteo.

const LAT = -32.4825;
const LON = -58.2372;

export async function onRequestGet(context) {
  const upstream =
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,` +
    `precipitation,weather_code,wind_speed_10m` +
    `&timezone=America%2FArgentina%2FBuenos_Aires`;

  try {
    const res = await fetch(upstream, {
      headers: {
        "User-Agent": "uruspot-weather-proxy/1.0",
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: "upstream_error", status: res.status }),
        { status: 502, headers: { "content-type": "application/json" } }
      );
    }

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=300",
        "access-control-allow-origin": "*",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "fetch_failed", message: String(err) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}

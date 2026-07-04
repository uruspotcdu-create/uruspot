// functions/weather.js
// Cloudflare Pages Function — usa la API de MET Norway (api.met.no)
// en vez de Open-Meteo, porque Open-Meteo falla (525) al ser
// llamada desde la red de Cloudflare hacia esta zona en particular.

const LAT = -32.4825;
const LON = -58.2372;

function symbolToWmo(symbol) {
  if (!symbol) return 2;
  var s = symbol.toLowerCase();
  if (s.indexOf('thunder') !== -1) return 95;
  if (s.indexOf('heavysnow') !== -1) return 75;
  if (s.indexOf('snow') !== -1) return 71;
  if (s.indexOf('sleet') !== -1) return 71;
  if (s.indexOf('heavyrain') !== -1) return 65;
  if (s.indexOf('lightrain') !== -1) return 51;
  if (s.indexOf('rain') !== -1) return 61;
  if (s.indexOf('fog') !== -1) return 45;
  if (s.indexOf('cloudy') !== -1 && s.indexOf('partly') === -1) return 3;
  if (s.indexOf('partlycloudy') !== -1) return 2;
  if (s.indexOf('fair') !== -1) return 1;
  if (s.indexOf('clearsky') !== -1) return 0;
  return 2;
}

export async function onRequestGet(context) {
  const upstream =
    `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${LAT}&lon=${LON}`;

  try {
    const res = await fetch(upstream, {
      headers: {
        // MET Norway exige un User-Agent identificable, si no bloquea.
        "User-Agent": "uruspot-cdu-weather/1.0 github.com/uruspotcdu-create/uruspot",
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: "upstream_error", status: res.status }),
        { status: 502, headers: { "content-type": "application/json" } }
      );
    }

    const raw = await res.json();
    const ts = raw && raw.properties && raw.properties.timeseries && raw.properties.timeseries[0];

    if (!ts) {
      return new Response(
        JSON.stringify({ error: "invalid_upstream_shape" }),
        { status: 502, headers: { "content-type": "application/json" } }
      );
    }

    const details = ts.data.instant.details || {};
    const next1h = ts.data.next_1_hours || {};
    const symbol = next1h.summary ? next1h.summary.symbol_code : null;
    const precip = next1h.details ? next1h.details.precipitation_amount : 0;

    const normalized = {
      current: {
        temperature_2m: details.air_temperature,
        apparent_temperature: details.air_temperature, // MET no da "feels like" directo
        relative_humidity_2m: details.relative_humidity,
        wind_speed_10m: details.wind_speed != null ? details.wind_speed * 3.6 : null, // m/s -> km/h
        precipitation: precip || 0,
        weather_code: symbolToWmo(symbol),
      },
    };

    return new Response(JSON.stringify(normalized), {
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

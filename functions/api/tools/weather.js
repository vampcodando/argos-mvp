import { fetchJson, jsonResponse, param, policyGate } from "./_toolPolicy.js";

const CODES = {
  0: "ceu limpo", 1: "principalmente limpo", 2: "parcialmente nublado",
  3: "nublado", 45: "nevoeiro", 51: "garoa fraca", 53: "garoa moderada",
  55: "garoa forte", 61: "chuva fraca", 63: "chuva moderada",
  65: "chuva forte", 80: "pancadas fracas", 81: "pancadas moderadas",
  82: "pancadas fortes", 95: "trovoadas"
};

function label(code) {
  return CODES[code] || `codigo meteorologico ${code}`;
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function scorePlace(place, city, state, country) {
  const wantedCity = normalize(city);
  const wantedState = normalize(state);
  const wantedCountry = normalize(country);

  let score = 0;

  if (normalize(place.name) === wantedCity) score += 50;
  if (normalize(place.admin1).includes(wantedState) || wantedState.includes(normalize(place.admin1))) score += 30;
  if (normalize(place.country).includes(wantedCountry) || wantedCountry.includes(normalize(place.country))) score += 20;

  return score;
}

async function findPlace(city, state, country) {
  const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geoUrl.searchParams.set("name", city);
  geoUrl.searchParams.set("count", "10");
  geoUrl.searchParams.set("language", "pt");
  geoUrl.searchParams.set("format", "json");

  const geo = await fetchJson(geoUrl.toString());
  const results = Array.isArray(geo.results) ? geo.results : [];

  if (!results.length) {
    return null;
  }

  return results
    .map((place) => ({ place, score: scorePlace(place, city, state, country) }))
    .sort((a, b) => b.score - a.score)[0].place;
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const gate = policyGate(param(url, "context", "weather"));
  if (!gate.ok) return jsonResponse({ ok: false, tool: "weather", ...gate }, 403);

  const city = param(url, "city", "Esteio");
  const state = param(url, "state", "Rio Grande do Sul");
  const country = param(url, "country", "Brasil");

  try {
    const place = await findPlace(city, state, country);

    if (!place) {
      return jsonResponse({
        ok: false,
        tool: "weather",
        reason: "Cidade nao encontrada.",
        hint: "Tente informar apenas city=Esteio e state=Rio Grande do Sul.",
        query: { city, state, country }
      }, 404);
    }

    const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
    forecastUrl.searchParams.set("latitude", String(place.latitude));
    forecastUrl.searchParams.set("longitude", String(place.longitude));
    forecastUrl.searchParams.set("current", "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m");
    forecastUrl.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
    forecastUrl.searchParams.set("timezone", "auto");
    forecastUrl.searchParams.set("forecast_days", "3");

    const forecast = await fetchJson(forecastUrl.toString());
    const current = forecast.current || {};
    const daily = forecast.daily || {};

    return jsonResponse({
      ok: true,
      tool: "weather",
      source: "Open-Meteo",
      location: {
        name: place.name,
        state: place.admin1,
        country: place.country,
        latitude: place.latitude,
        longitude: place.longitude,
        timezone: forecast.timezone
      },
      current: {
        time: current.time,
        temperatureC: current.temperature_2m,
        apparentTemperatureC: current.apparent_temperature,
        humidityPercent: current.relative_humidity_2m,
        precipitationMm: current.precipitation,
        windKmh: current.wind_speed_10m,
        weatherCode: current.weather_code,
        condition: label(current.weather_code)
      },
      daily: (daily.time || []).map((date, i) => ({
        date,
        condition: label(daily.weather_code?.[i]),
        maxC: daily.temperature_2m_max?.[i],
        minC: daily.temperature_2m_min?.[i],
        precipitationProbabilityPercent: daily.precipitation_probability_max?.[i]
      }))
    });
  } catch (error) {
    return jsonResponse({ ok: false, tool: "weather", reason: error.message || "Falha." }, 500);
  }
}

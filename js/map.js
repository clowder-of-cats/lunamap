// ── WMO weather codes → [emoji, label] ─────────────────────
const WMO = {
  0:  ['☀️', 'Clear'],         1:  ['🌤', 'Mainly clear'],
  2:  ['⛅', 'Partly cloudy'], 3:  ['☁️', 'Overcast'],
  45: ['🌫', 'Fog'],           48: ['🌫', 'Freezing fog'],
  51: ['🌦', 'Light drizzle'], 53: ['🌦', 'Drizzle'],
  55: ['🌧', 'Heavy drizzle'], 61: ['🌧', 'Light rain'],
  63: ['🌧', 'Rain'],          65: ['🌧', 'Heavy rain'],
  71: ['🌨', 'Light snow'],    73: ['🌨', 'Snow'],
  75: ['❄️', 'Heavy snow'],    80: ['🌦', 'Showers'],
  81: ['🌧', 'Heavy showers'], 82: ['⛈', 'Violent showers'],
  95: ['⛈', 'Thunderstorm'],  99: ['⛈', 'Thunderstorm + hail'],
};

function weatherLabel(code) { return WMO[code] ?? ['🌡', 'Unknown']; }

// ── Fetch live weather from Open-Meteo (free, no key needed) 
async function getWeather(lat, lng, elevation) {
  const params = new URLSearchParams({
    latitude:  lat,
    longitude: lng,
    elevation: elevation,
    current:   'temperature_2m,relative_humidity_2m,precipitation,weather_code',
    daily:     'sunrise,sunset',
    timezone:  'auto',
  });
  try {
    const res  = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    const json = await res.json();
    if (!json.current) return null;
    return {
      current:  json.current,
      timezone: json.timezone ?? null,
      sunrise:  json.daily?.sunrise?.[0] ?? null,
      sunset:   json.daily?.sunset?.[0] ?? null,
    };
  } catch {
    return null;
  }
}


// ── Build popup HTML ────────────────────────────────────────
function buildPopup(coffee, weather) {
  // Tags row
  const tags = [coffee.processing, coffee.varieties, `Harvest ${coffee.harvest}`]
    .filter(Boolean)
    .map(t => `<span class="popup-tag">${t}</span>`)
    .join('');

// Weather block
let weatherHTML;
if (!weather || !weather.current) {
  weatherHTML = `<span class="popup-weather-loading">Fetching conditions…</span>`;
} else {
  const current = weather.current;
  const [emoji, label] = weatherLabel(current.weather_code);
  const rain = current.precipitation > 0
    ? `<span class="popup-weather-item">🌧 ${current.precipitation} mm today</span>`
    : '';

  // Local time + sun/moon emoji
  let timeHTML = '';
  if (weather.timezone && weather.sunrise && weather.sunset) {

    // All three times are in the origin's local timezone — safe to compare as strings
    const currentTime = current.time;   // e.g. "2026-10-23T23:42"
    const sunriseTime = weather.sunrise; // e.g. "2026-10-23T06:12"
    const sunsetTime  = weather.sunset;  // e.g. "2026-10-23T18:34"

    function minsFromIso(iso) {
      const [h, m] = iso.split('T')[1].split(':').map(Number);
      return h * 60 + m;
    }
    const nowMins     = minsFromIso(currentTime);
    const riseMins    = minsFromIso(sunriseTime);
    const setMins     = minsFromIso(sunsetTime);
    const goldenMins  = 45;

    let timeEmoji = '☀️';
    if (nowMins < riseMins || nowMins > setMins) {
      timeEmoji = '🌙';
    } else if (nowMins - riseMins < goldenMins || setMins - nowMins < goldenMins) {
      timeEmoji = '🌅';
    }

    const localTime = new Intl.DateTimeFormat('en', {
      timeZone:  weather.timezone,
      hour:      'numeric',
      minute:    '2-digit',
      hour12:    true,
    }).format(new Date());

    timeHTML = `<span class="popup-weather-item popup-time">${timeEmoji} ${localTime}</span>`;
  }

  weatherHTML = `
    <div class="popup-weather-grid">
      ${timeHTML}
      <span class="popup-weather-item">🌡 ${Math.round(current.temperature_2m)}°C</span>
      <span class="popup-weather-item">💧 ${current.relative_humidity_2m}%</span>
      <span class="popup-weather-item">${emoji} ${label}</span>
      ${rain}
    </div>`;
}


  // Footer
  const isActive   = coffee.active;
  const footerText = isActive
    ? `<span class="sub-dot"></span><strong>Currently featured</strong> · ${coffee.subscription}`
    : `Archive · ${coffee.subscription}`;

  return `
    <div class="popup-card">
      <div class="popup-top">
        <div class="popup-name">${coffee.name}</div>
        <div class="popup-region">${coffee.region}</div>
        <span class="popup-elevation">⛰ ${coffee.elevation.toLocaleString()}m</span>
      </div>
      <div class="popup-tasting">
        <div class="popup-tasting-notes">${coffee.tasting}</div>
        <div class="popup-tags">${tags}</div>
      </div>
      <div class="popup-weather">
        <div class="popup-weather-label">At origin right now</div>
        ${weatherHTML}
      </div>
      <div class="popup-footer">
        <div class="popup-subscription${isActive ? ' is-active' : ''}">${footerText}</div>
      </div>
    </div>`;
}

// ── Initialise map ──────────────────────────────────────────
const map = L.map('map', {
  center: [5, 5],
  zoom: 2,
  scrollWheelZoom: false,
  zoomControl: true,
});

// ESRI Positron — no API key, matches Luna's pale palette
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles &copy; <a href="https://www.esri.com">Esri</a>',
  maxZoom: 16,
}).addTo(map);


// ── Load coffees.json and place markers ─────────────────────
fetch('data/coffees.json')
  .then(r => r.json())
  .then(coffees => {
    const bounds = [];

    coffees.forEach(coffee => {
      const isActive = coffee.active;
      const size     = isActive ? 18 : 13;
      const color    = isActive ? '#8B5E3C' : '#B8A99A';
      const opacity  = isActive ? 1 : 0.6;

      const icon = L.divIcon({
        className: '',
        html: `<div class="luna-marker" style="
          width:${size}px; height:${size}px;
          background:${color}; opacity:${opacity};
        "></div>`,
        iconSize:    [size, size],
        iconAnchor:  [size / 2, size / 2],
        popupAnchor: [0, -(size / 2 + 6)],
      });

      const marker = L.marker([coffee.lat, coffee.lng], { icon }).addTo(map);

      // Open popup with a "loading" weather state first
      marker.bindPopup(buildPopup(coffee, null), {
        maxWidth: 320,
        minWidth: 285,
        autoPan:  true,
      });

      // Fetch weather and update popup when it opens
      marker.on('popupopen', async () => {
        const weather = await getWeather(coffee.lat, coffee.lng, coffee.elevation);
        marker.getPopup().setContent(buildPopup(coffee, weather));
      });

      bounds.push([coffee.lat, coffee.lng]);
    });

    // Auto-zoom to fit all markers
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 6 });
    }
  })
  .catch(err => console.error('Could not load coffees.json:', err));

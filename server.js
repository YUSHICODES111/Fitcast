const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { URL } = require("url");

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const WARDROBE_FILE = path.join(DATA_DIR, "wardrobe.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

async function ensureStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(WARDROBE_FILE);
  } catch {
    await fs.writeFile(WARDROBE_FILE, "[]", "utf8");
  }
}

async function readWardrobe() {
  const raw = await fs.readFile(WARDROBE_FILE, "utf8");
  return JSON.parse(raw);
}

async function writeWardrobe(items) {
  await fs.writeFile(WARDROBE_FILE, JSON.stringify(items, null, 2), "utf8");
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": MIME_TYPES[".json"] });
  res.end(JSON.stringify(payload));
}

async function parseBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (!body) return {};
  return JSON.parse(body);
}

function createId() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "OutfitWeatherAssessment/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`External API error: ${response.status}`);
  }
  return response.json();
}

function getWeatherLabel(tempC, rainMm, windKph) {
  if (rainMm > 1.5) return "rainy";
  if (tempC >= 30) return "hot";
  if (tempC <= 12) return "cold";
  if (windKph >= 25) return "windy";
  return "mild";
}

function scoreItemForWeather(item, weatherLabel, tempC) {
  let score = 0;
  const tags = Array.isArray(item.tags) ? item.tags : [];
  if (tags.includes(weatherLabel)) score += 4;
  if (weatherLabel === "cold" && tags.includes("layer")) score += 2;
  if (weatherLabel === "hot" && tags.includes("breathable")) score += 2;
  if (weatherLabel === "rainy" && tags.includes("water-resistant")) score += 2;
  if (weatherLabel === "mild" && tags.includes("everyday")) score += 1;
  if (tempC <= 10 && item.type === "outerwear") score += 2;
  if (tempC >= 32 && item.type === "outerwear") score -= 2;
  return score;
}

function pickUnique(scored, variantIndex, usedIds) {
  if (!scored.length) return null;
  for (let step = 0; step < scored.length; step += 1) {
    const candidate = scored[(variantIndex + step) % scored.length];
    if (!usedIds.has(candidate.id)) {
      usedIds.add(candidate.id);
      return candidate;
    }
  }
  return null;
}

function makeScored(items, weather) {
  return [...items].sort((a, b) => {
    const scoreA =
      scoreItemForWeather(a, weather.label, weather.temperature) + Number(a.__ruleBonus || 0);
    const scoreB =
      scoreItemForWeather(b, weather.label, weather.temperature) + Number(b.__ruleBonus || 0);
    return scoreB - scoreA;
  });
}

function getProfileFromQuery(searchParams) {
  return {
    bodyType: (searchParams.get("bodyType") || "balanced").toLowerCase(),
    fitPreference: (searchParams.get("fitPreference") || "regular").toLowerCase(),
    colorPreference: (searchParams.get("colorPreference") || "neutral").toLowerCase(),
    heatTolerance: (searchParams.get("heatTolerance") || "medium").toLowerCase(),
  };
}

function evaluateItem(item, weather, profile) {
  const reasons = [];
  let bonus = 0;
  let reject = false;
  const fit = String(item.fit || "regular").toLowerCase();
  const warmth = String(item.warmth || "medium").toLowerCase();
  const colorTone = String(item.colorTone || "neutral").toLowerCase();
  const tags = Array.isArray(item.tags) ? item.tags : [];

  if (weather.label === "hot") {
    if (warmth === "heavy") {
      reject = true;
      reasons.push("too warm for hot weather");
    }
    if (fit === "fitted" && profile.heatTolerance !== "high") {
      bonus -= 1;
      reasons.push("fitted cut may feel too warm in heat");
    }
    if (colorTone === "dark" && weather.temperature >= 33) {
      bonus -= 1;
      reasons.push("dark tones absorb more heat");
    }
  }

  if (weather.label === "cold") {
    if (warmth === "light") {
      bonus -= 2;
      reasons.push("not warm enough for cold weather");
      if (weather.temperature <= 8) reject = true;
    }
    if (warmth === "heavy" || tags.includes("layer")) bonus += 2;
  }

  if (weather.label === "rainy") {
    if (item.category === "footwear" && !tags.includes("water-resistant")) {
      bonus -= 2;
      reasons.push("footwear is not water-resistant");
    }
    if (item.category === "outerwear" && !tags.includes("water-resistant")) {
      bonus -= 2;
      reasons.push("outerwear should be water-resistant");
    }
  }

  if (fit === profile.fitPreference) bonus += 1;
  if (fit !== profile.fitPreference) bonus -= 1;
  if (colorTone === profile.colorPreference) bonus += 1;

  if (profile.bodyType === "petite" && fit === "fitted") bonus += 1;
  if (profile.bodyType === "tall" && fit === "loose") bonus += 1;
  if (profile.bodyType === "curvy" && fit !== "regular") bonus -= 1;
  if (profile.bodyType === "athletic" && fit === "regular") bonus += 1;

  let verdict = "wear";
  if (reject) verdict = "avoid";
  else if (bonus <= -2 || reasons.length >= 2) verdict = "avoid";
  else if (bonus < 0 || reasons.length) verdict = "caution";

  return { reject, reasons, bonus, verdict };
}

function splitWardrobeByRules(items, weather, profile) {
  const allowed = [];
  const denied = [];
  for (const item of items) {
    const analysis = evaluateItem(item, weather, profile);
    if (analysis.reject) {
      denied.push({
        id: item.id,
        name: item.name,
        reasons: analysis.reasons.length ? analysis.reasons : ["not suitable right now"],
      });
    } else {
      allowed.push({
        ...item,
        __ruleBonus: analysis.bonus,
        __ruleNotes: analysis.reasons,
        __ruleVerdict: analysis.verdict,
      });
    }
  }
  return { allowed, denied };
}

function buildStylingTip(vibe, weather) {
  if (vibe === "Casual Daily") {
    return weather.label === "hot"
      ? "Keep it airy: relaxed fit, sleeves rolled, and lightweight fabrics."
      : "Keep it easy: clean layers and neutral tones for all-day comfort.";
  }
  if (vibe === "Smart Comfort") {
    return weather.label === "hot"
      ? "Go polished with breathable pieces, neat tuck, and minimal accessories."
      : "Use structured layering and balanced tones for a sharper look.";
  }
  return weather.label === "hot"
    ? "Add attitude with contrast colors and statement footwear."
    : "Create edge with bold layering and one standout accessory.";
}

function buildOutfitOptions(wardrobe, weather, profile) {
  const { allowed } = splitWardrobeByRules(wardrobe, weather, profile);
  const scoredPool = allowed.length ? allowed : wardrobe;
  const tops = makeScored(
    scoredPool.filter((i) => i.category === "top"),
    weather
  );
  const bottoms = makeScored(
    scoredPool.filter((i) => i.category === "bottom"),
    weather
  );
  const footwear = makeScored(
    scoredPool.filter((i) => i.category === "footwear"),
    weather
  );
  const outerwear = makeScored(
    scoredPool.filter((i) => i.category === "outerwear"),
    weather
  );
  const accessories = makeScored(
    scoredPool.filter((i) => i.category === "accessory"),
    weather
  );

  const vibes = ["Casual Daily", "Smart Comfort", "Bold Street"];
  const options = [];

  for (let variant = 0; variant < 3; variant += 1) {
    const usedIds = new Set();
    const optionItems = [];
    const top = pickUnique(tops, variant, usedIds);
    const bottom = pickUnique(bottoms, variant + 1, usedIds);
    const shoe = pickUnique(footwear, variant + 2, usedIds);
    if (top) optionItems.push(top);
    if (bottom) optionItems.push(bottom);
    if (shoe) optionItems.push(shoe);

    if (weather.label === "cold" || weather.label === "rainy" || weather.temperature < 16) {
      const outer = pickUnique(outerwear, variant, usedIds);
      if (outer) optionItems.push(outer);
    }

    const accessory = pickUnique(accessories, variant, usedIds);
    if (accessory) optionItems.push(accessory);

    if (optionItems.length < 3) {
      const allScored = makeScored(scoredPool, weather);
      for (let step = 0; step < allScored.length && optionItems.length < 4; step += 1) {
        const extra = allScored[(variant + step) % allScored.length];
        if (!usedIds.has(extra.id)) {
          usedIds.add(extra.id);
          optionItems.push(extra);
        }
      }
    }

    if (optionItems.length) {
      const analyzedItems = optionItems.map((item) => {
        const analysis = evaluateItem(item, weather, profile);
        return {
          ...item,
          weatherVerdict: analysis.verdict,
          weatherReasons: analysis.reasons,
        };
      });
      const avoidCount = analyzedItems.filter((item) => item.weatherVerdict === "avoid").length;
      const cautionCount = analyzedItems.filter(
        (item) => item.weatherVerdict === "caution"
      ).length;
      const overallVerdict = avoidCount
        ? "avoid"
        : cautionCount
        ? "caution"
        : "wear";
      options.push({
        id: `look-${variant + 1}`,
        vibe: vibes[variant],
        items: analyzedItems,
        overallVerdict,
        stylingTip: buildStylingTip(vibes[variant], weather),
      });
    }
  }

  return options;
}

async function handleApi(req, res, pathname, searchParams) {
  try {
    if (pathname === "/api/wardrobe" && req.method === "GET") {
      const items = await readWardrobe();
      return sendJson(res, 200, { items });
    }

    if (pathname === "/api/wardrobe" && req.method === "POST") {
      const body = await parseBody(req);
      if (!body.name || !body.category || !body.type) {
        return sendJson(res, 400, { error: "name, category and type are required." });
      }
      const items = await readWardrobe();
      const item = {
        id: createId(),
        name: String(body.name).trim(),
        category: String(body.category).trim(),
        type: String(body.type).trim(),
        color: String(body.color || "").trim(),
        colorTone: String(body.colorTone || "neutral").trim().toLowerCase(),
        fit: String(body.fit || "regular").trim().toLowerCase(),
        warmth: String(body.warmth || "medium").trim().toLowerCase(),
        fabric: String(body.fabric || "").trim().toLowerCase(),
        tags: Array.isArray(body.tags) ? body.tags.map((t) => String(t).trim()) : [],
      };
      items.push(item);
      await writeWardrobe(items);
      return sendJson(res, 201, { item });
    }

    if (pathname.startsWith("/api/wardrobe/") && req.method === "DELETE") {
      const id = pathname.split("/").pop();
      const items = await readWardrobe();
      const next = items.filter((item) => item.id !== id);
      await writeWardrobe(next);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === "/api/weather" && req.method === "GET") {
      const city = (searchParams.get("city") || "").trim();
      if (!city) return sendJson(res, 400, { error: "City is required." });

      const geoUrl = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(
        city
      )}&format=json&limit=1`;
      const geo = await fetchJson(geoUrl);
      if (!geo.length) return sendJson(res, 404, { error: "City not found." });

      const lat = geo[0].lat;
      const lon = geo[0].lon;
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,precipitation&timezone=auto`;
      const weather = await fetchJson(weatherUrl);
      const current = weather.current;
      const label = getWeatherLabel(
        Number(current.temperature_2m),
        Number(current.precipitation),
        Number(current.wind_speed_10m)
      );

      return sendJson(res, 200, {
        city,
        temperature: Number(current.temperature_2m),
        wind: Number(current.wind_speed_10m),
        rain: Number(current.precipitation),
        label,
      });
    }

    if (pathname === "/api/suggestion" && req.method === "GET") {
      const city = (searchParams.get("city") || "").trim();
      if (!city) return sendJson(res, 400, { error: "City is required." });
      const profile = getProfileFromQuery(searchParams);
      const items = await readWardrobe();
      if (!items.length) {
        return sendJson(res, 200, {
          weather: null,
          outfit: [],
          note: "No wardrobe items yet. Add clothes to get suggestions.",
        });
      }

      const geoUrl = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(
        city
      )}&format=json&limit=1`;
      const geo = await fetchJson(geoUrl);
      if (!geo.length) return sendJson(res, 404, { error: "City not found." });

      const lat = geo[0].lat;
      const lon = geo[0].lon;
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,precipitation&timezone=auto`;
      const weatherData = await fetchJson(weatherUrl);
      const current = weatherData.current;
      const weather = {
        temperature: Number(current.temperature_2m),
        wind: Number(current.wind_speed_10m),
        rain: Number(current.precipitation),
      };
      weather.label = getWeatherLabel(weather.temperature, weather.rain, weather.wind);

      const { denied } = splitWardrobeByRules(items, weather, profile);
      const outfitOptions = buildOutfitOptions(items, weather, profile);
      const uniqueComboCount = new Set(
        outfitOptions.map((option) => option.items.map((item) => item.id).join("|"))
      ).size;
      const bestVerdict =
        outfitOptions.find((o) => o.overallVerdict === "wear")?.overallVerdict ||
        outfitOptions.find((o) => o.overallVerdict === "caution")?.overallVerdict ||
        "avoid";
      return sendJson(res, 200, {
        weather: { ...weather, city },
        profile,
        outfitOptions,
        outfit: outfitOptions[0]?.items || [],
        deniedItems: denied,
        recommendationVerdict: bestVerdict,
        note:
          uniqueComboCount >= 3
            ? "Showing weather-smart looks using your fit, body-type, and color preferences."
            : "Add more tops, bottoms, and footwear for stronger look variety.",
      });
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "Server error" });
  }
}

async function serveStatic(res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const data = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  }
}

async function main() {
  await ensureStorage();
  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    if (requestUrl.pathname.startsWith("/api/")) {
      return handleApi(req, res, requestUrl.pathname, requestUrl.searchParams);
    }
    return serveStatic(res, requestUrl.pathname);
  });

  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

main();

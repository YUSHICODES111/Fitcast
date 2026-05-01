const wardrobeForm = document.getElementById("wardrobe-form");
const wardrobeList = document.getElementById("wardrobe-list");
const count = document.getElementById("count");
const weatherPanel = document.getElementById("weather-panel");
const suggestionPanel = document.getElementById("suggestion-panel");
const fetchWeatherBtn = document.getElementById("fetch-weather");
const suggestBtn = document.getElementById("suggest-btn");
const cityInput = document.getElementById("city");
const bodyTypeInput = document.getElementById("body-type");
const fitPreferenceInput = document.getElementById("fit-preference");
const colorPreferenceInput = document.getElementById("color-preference");
const heatToleranceInput = document.getElementById("heat-tolerance");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function api(path, options) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function renderWardrobe(items) {
  count.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;
  if (!items.length) {
    wardrobeList.innerHTML = `<div class="panel muted">No items yet. Add your first clothing item.</div>`;
    return;
  }
  wardrobeList.innerHTML = items
    .map(
      (item) => `
        <div class="wardrobe-item">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <div class="meta">
              ${escapeHtml(item.category)} | ${escapeHtml(item.type)} ${
        item.color ? `| ${escapeHtml(item.color)}` : ""
      } | ${escapeHtml(item.fit || "regular")} fit | ${escapeHtml(
        item.warmth || "medium"
      )} warmth | ${escapeHtml(item.colorTone || "neutral")} tone ${
        item.tags?.length ? `| tags: ${escapeHtml(item.tags.join(", "))}` : ""
      }
            </div>
          </div>
          <button class="danger" data-id="${item.id}">Delete</button>
        </div>
      `
    )
    .join("");
}

async function loadWardrobe() {
  const data = await api("/api/wardrobe");
  renderWardrobe(data.items);
}

wardrobeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    name: document.getElementById("name").value.trim(),
    category: document.getElementById("category").value,
    type: document.getElementById("type").value.trim(),
    color: document.getElementById("color").value.trim(),
    colorTone: document.getElementById("color-tone").value,
    fit: document.getElementById("fit").value,
    warmth: document.getElementById("warmth").value,
    fabric: document.getElementById("fabric").value.trim(),
    tags: document
      .getElementById("tags")
      .value.split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };
  try {
    await api("/api/wardrobe", { method: "POST", body: JSON.stringify(payload) });
    wardrobeForm.reset();
    await loadWardrobe();
  } catch (error) {
    alert(error.message);
  }
});

wardrobeList.addEventListener("click", async (e) => {
  const button = e.target.closest("button[data-id]");
  if (!button) return;
  try {
    await api(`/api/wardrobe/${button.dataset.id}`, { method: "DELETE" });
    await loadWardrobe();
  } catch (error) {
    alert(error.message);
  }
});

fetchWeatherBtn.addEventListener("click", async () => {
  const city = cityInput.value.trim();
  if (!city) return alert("Please enter a city.");
  weatherPanel.textContent = "Loading weather...";
  try {
    const data = await api(`/api/weather?city=${encodeURIComponent(city)}`);
    weatherPanel.innerHTML = `
      <strong>${escapeHtml(data.city)}</strong><br />
      ${data.temperature}°C | Wind ${data.wind} km/h | Rain ${data.rain} mm<br />
      <span class="meta">Condition: ${escapeHtml(data.label)}</span>
    `;
  } catch (error) {
    weatherPanel.textContent = error.message;
  }
});

suggestBtn.addEventListener("click", async () => {
  const city = cityInput.value.trim();
  if (!city) return alert("Please enter a city.");
  const profile = {
    bodyType: bodyTypeInput.value,
    fitPreference: fitPreferenceInput.value,
    colorPreference: colorPreferenceInput.value,
    heatTolerance: heatToleranceInput.value,
  };
  suggestionPanel.textContent = "Generating suggestion...";
  try {
    const query = new URLSearchParams({
      city,
      bodyType: profile.bodyType,
      fitPreference: profile.fitPreference,
      colorPreference: profile.colorPreference,
      heatTolerance: profile.heatTolerance,
    });
    const data = await api(`/api/suggestion?${query.toString()}`);
    const options = Array.isArray(data.outfitOptions) ? data.outfitOptions : [];
    if (!options.length) {
      suggestionPanel.innerHTML = `<span class="muted">${escapeHtml(data.note)}</span>`;
      return;
    }

    const renderLookItems = (items) =>
      items
        .map(
          (item) =>
            `<li><strong>${escapeHtml(item.name)}</strong> <span class="meta">(${escapeHtml(
              item.category
            )} - ${escapeHtml(item.type)})</span> <span class="verdict verdict-${escapeHtml(
              item.weatherVerdict || "wear"
            )}">${escapeHtml(item.weatherVerdict || "wear")}</span>${
              item.weatherReasons?.length
                ? `<div class="meta">Why: ${escapeHtml(item.weatherReasons.join("; "))}</div>`
                : ""
            }</li>`
        )
        .join("");

    const looksHtml = options
      .map(
        (option, index) => `
          <div class="look-card ${index === 0 ? "active-look" : ""}">
            <div><strong>Look ${index + 1}: ${escapeHtml(option.vibe)}</strong> <span class="verdict verdict-${escapeHtml(
              option.overallVerdict || "wear"
            )}">${escapeHtml(option.overallVerdict || "wear")}</span></div>
            <ul>${renderLookItems(option.items)}</ul>
            <p class="look-tip">${escapeHtml(option.stylingTip || "")}</p>
          </div>
        `
      )
      .join("");

    const deniedHtml = (data.deniedItems || [])
      .slice(0, 4)
      .map(
        (item) =>
          `<li><strong>${escapeHtml(item.name)}</strong> <span class="meta">- ${escapeHtml(
            item.reasons.join("; ")
          )}</span></li>`
      )
      .join("");

    suggestionPanel.innerHTML = `
      <div class="meta">Weather: ${data.weather.temperature}°C, ${escapeHtml(
      data.weather.label
    )} in ${escapeHtml(data.weather.city)}</div>
      <div class="decision-box">Final suggestion: <span class="verdict verdict-${escapeHtml(
        data.recommendationVerdict || "wear"
      )}">${escapeHtml(data.recommendationVerdict || "wear")}</span></div>
      <div class="looks-grid">${looksHtml}</div>
      ${
        deniedHtml
          ? `<div class="deny-box"><strong>Denied for this weather:</strong><ul>${deniedHtml}</ul></div>`
          : ""
      }
      <div class="meta">${escapeHtml(data.note)}</div>
    `;
  } catch (error) {
    suggestionPanel.textContent = error.message;
  }
});

loadWardrobe();

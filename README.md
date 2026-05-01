# FitCast - Outfit from Weather

A creative full-stack assessment app that suggests an outfit based on your wardrobe and live weather in your city.

## Features

- Add and manage wardrobe items (top, bottom, footwear, outerwear, accessory).
- Fetch live weather by city (OpenStreetMap geocoding + Open-Meteo weather).
- Get a weather-aware outfit recommendation from your saved clothes.
- Fully responsive and modern glassmorphism UI.

## Tech

- Backend: Node.js HTTP server (no external dependencies).
- Frontend: HTML, CSS, vanilla JavaScript.
- Storage: local JSON file (`data/wardrobe.json`).

## Run

```bash
node server.js
```

Open `http://localhost:3000`.

## Demo flow for assessment

1. Add 6-10 wardrobe items with useful tags like `cold`, `hot`, `rainy`, `breathable`, `water-resistant`, `layer`, `everyday`.
2. Enter a city and click **Check**.
3. Click **Generate Outfit** to show personalized suggestions.

## Notes

- Internet is required for live weather APIs.
- This project is intentionally dependency-free so it runs fast on any system with Node installed.

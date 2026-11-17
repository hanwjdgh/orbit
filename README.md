# ORBIT

A personal travel planner prototype: pick a city, put places on a 2D/3D map, split them into days, and keep the day's schedule, travel times and spending in one place. Plain HTML, CSS and JavaScript with no build step; data stays in your browser.

## Features

- Trips of up to 14 days, with example places for a few cities (Fukuoka, Takamatsu, Tokyo, Osaka, Paris, London, New York)
- Add any place by pasting a Google Maps link; its name and coordinates are read from the link
- Per-leg travel times you enter yourself, with Google Maps directions links for walking or transit
- Timeline with fixed-time conflicts, a "today" view in the city's local time, and a print layout
- Expense log per day with totals by currency and category, plus an estimated KRW total from your own exchange rates
- JSON backup and restore, plain-text export

Nothing is looked up automatically: travel times, opening hours and exchange rates are what you enter.

## Run

Requires Node.js (no packages to install).

```bash
node work/preview-prototype.cjs
```

Then open http://127.0.0.1:4173/. Trips are saved in that browser's local storage, so use the same browser and address each time, and download a backup before clearing browser data.

To build a single self-contained HTML file and a source folder under `outputs/`:

```bash
node work/package_prototype.cjs
```

## Tests

```bash
for t in work/test-*.cjs; do node "$t" || break; done
```

## Map data

Map tiles and style from [OpenFreeMap](https://openfreemap.org/), map rendering by [MapLibre GL JS](https://maplibre.org/), data © OpenStreetMap contributors.

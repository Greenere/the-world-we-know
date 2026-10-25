# The World We Know

A browser atlas of how much of the world a civilization knew in any year, and of the travellers who pushed that knowledge outward. Fog covers what a viewpoint did not know; it lifts when a traveller's news reaches home, and it comes back when knowledge is lost.

This is v1 of the [spec](docs/The%20World%20We%20Know%20—%20v1%20Spec.md): four cultural viewpoints (Mediterranean / Europe, China, the Islamic world, Polynesia) plus Humanity, 500 BCE to today (Humanity back to 70,000 years ago), 31 journeys (voyages, travellers, military campaigns, scientific expeditions and the last frontiers), 23 inventions that changed how people saw the world, 339 cities and 196 regions.

## Run it

```sh
npm install
npm run data     # Python build step (uses uv); downloads Natural Earth once
npm run dev      # http://localhost:5173
```

`npm run data` needs [uv](https://docs.astral.sh/uv/); it creates its own Python environment with `h3` and `shapely`. `npm run build` type-checks and writes a static site to `dist/`. Pushing to `main` builds and deploys it to GitHub Pages (`.github/workflows/pages.yml`; set Pages to "GitHub Actions" in the repo settings).

## Links

Every view is a link:

| Link | Opens |
| --- | --- |
| `?vp=china&year=1420` | China's known world in 1420 |
| `?vp=europe,china&year=1420` | Compare mode; overlap is the third tint |
| `?journey=zhenghe&stop=4` | Zheng He's voyages at the fourth stop |
| `?region=east-africa-coast&vp=islam` | The region card |
| `?city=loulan` | The city card |
| `?invention=magnetic-compass` | The invention card, at its year |
| `&globe=1` | The globe instead of the flat map |
| `?year=1519&journeys=all` | Timeline playback with every journey under way drawn on the map |

Keys: ← → key moments (or journey stops), Shift ← → one year, Space play, `/` search, Esc close.

## Data

Everything the map shows is authored as plain text in `data/` and compiled by `scripts/build_data.py`.

| File | What it holds |
| --- | --- |
| `viewpoints.json` | Names, colours, homes over time, and the key moments on the timeline |
| `regions.geojson` | ~190 named regions. Coarse polygons are fine: the grid is ~110 km per cell. `surface` is `land`, `sea` or `any` |
| `knowledge.csv` | One row per change: `viewpoint, region, year, level, confidence, source, note` |
| `journeys/<id>.json` | Stops (with optional waypoints to force a historical course) and the `informs` events: what each viewpoint learned, at what level, and when the news reached home. A stop's optional `by` (`sea`, `land`, `river`, `direct`) says how its leg was travelled, and a journey-level `by` sets the default; otherwise it is guessed from the journey's kind and the terrain. Routes are pulled taut and drawn as smooth curves that run on through waypoints and through stops the traveller passes on from |
| `cities.csv` | Founded, peak, abandoned, forgotten and rediscovered dates, tier, source, confidence, story |
| `inventions.json` | Instruments and ideas (compass, printing, chronometer, satellites…): year, place of origin, `culture` (a viewpoint id or a plain name), `category`, what it changed, source, confidence |
| `names.csv` | What each viewpoint called a region or city, with years (`*` is the default name) |
| `sources.csv` | Every source id used anywhere, with its citation |

Conventions in `knowledge.csv`:

- `year` is a year (negative is BCE) or a range `1000..1100`; the map uses the midpoint and the card shows the range.
- A cell takes the **highest** level of all regions that contain it, so broad regions set floors and small ones add detail.
- `=n` means **exactly** n: it holds a frontier back (the Greenland ice sheet, the summit of Everest) until the region's next row.
- Viewpoint `*` applies to all four cultural viewpoints; it is how the shared modern map after ~1900 is written.
- Lines starting with `#` are comments.

The build fails if any event, journey stop, city or invention lacks a source or confidence, if a source id is unknown, if a viewpoint has fewer than 8 key moments, or if a journey does not lift fog for at least one region. It routes every journey leg on a ~22 km H3 grid (sea legs keep to water, with straits carved open and the Suez and Panama canals opening in 1869 and 1914; land legs follow valleys and passes using ETOPO5 elevation; river legs follow Natural Earth rivers), gives every stop a fractional year from its date or by distance within its year, and finds where journeys crossed paths. It also rasterizes regions onto an H3 grid (resolution 3, 41,162 cells, oceans included), turns everything into per-cell change points per viewpoint, and keeps the fog data under 5 MB (it is about 0.8 MB).

Dates come from general knowledge and the cited works and are approximate until the phase-3 verification pass. Sources marked `draft` / `draft-urban` are placeholders for exactly that pass.

## How it draws

- **Basemap**: MapLibre GL with Natural Earth land, coasts, rivers and lakes (public domain), styled as an engraved parchment map.
- **Fog**: a custom deck.gl layer draws the whole H3 grid as one triangle mesh. Each cell's centre carries its own fog and each corner the average of the cells that meet there, so the GPU blends neighbours into soft frontiers. A noise field on the sphere makes the edges cloudy, wider where dates are uncertain, and a tide line marks where the fog changes. Changes cross-fade over a fraction of a second, so switching viewpoints or scrubbing animates.
- **Everything else**: deck.gl icon, text and path layers for cities, labels in the viewpoint's own names, and journey trails; plain TypeScript for the interface.

## Layout

```
data/            authored data (the only files to edit by hand)
scripts/         build_data.py and its Python project
public/data/     build output (generated, not committed)
src/fog/         the H3 mesh, the fog field and the fog layer
src/map/         basemap style and deck.gl overlay
src/ui/          top bar, timeline, cards, journey panel, search, legend, inset
src/main.ts      wiring: state, playback, camera, input, links
```

## Open questions (from the spec)

License (MIT without GPL border data, or GPL-3.0 with it), languages, whether other viewpoints should show the Humanity layer faintly, which viewpoints come next, and who reviews each viewpoint.

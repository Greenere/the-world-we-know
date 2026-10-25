# The World We Know

A browser atlas of how much of the world a civilization knew in any year, and of the travellers who pushed that knowledge outward. Fog covers what a viewpoint did not know; it lifts when a traveller's news reaches home, and it comes back when knowledge is lost.

This is v1 of the [spec](docs/The%20World%20We%20Know%20—%20v1%20Spec.md): nine cultural viewpoints (Mediterranean / Europe, China, the Islamic world, Polynesia, India, Japan, the West African Sahel, the Mexica and the Inca) plus Humanity, 500 BCE to today (Humanity back to 70,000 years ago), 90 journeys (voyages, travellers, military campaigns, scientific expeditions and the last frontiers), 23 inventions that changed how people saw the world, 386 cities and 221 regions.

## Run it

```sh
npm install
npm run data     # Python build step (uses uv); downloads Natural Earth once
npm run dev      # http://localhost:5173
```

`npm run data` needs [uv](https://docs.astral.sh/uv/); it creates its own Python environment with `h3`, `shapely` and `scipy`. `npm run build` type-checks and writes a static site to `dist/`. `npm run deploy` builds with the base path `/the-world-we-know/` and publishes `dist/` into a sibling checkout of `Greenere.github.io`, live at https://greenere.github.io/the-world-we-know/. Pushes to `main` run a build check (`.github/workflows/build.yml`).

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
| `&lang=zh` | The atlas in Chinese (also the 中/EN button in the top bar; remembered per browser) |
| `?year=1519&journeys=all` | Timeline playback with every journey under way drawn on the map |

Keys: ← → key moments (or journey stops), Shift ← → one year, Space play, `/` search, Esc close.

## Data

Everything the map shows is authored as plain text in `data/` and compiled by `scripts/build_data.py`.

| File | What it holds |
| --- | --- |
| `viewpoints.json` | Names, colours, homes over time, and the key moments on the timeline |
| `regions.geojson` | ~190 named regions. Coarse polygons are fine: the grid is ~110 km per cell. `surface` is `land`, `sea` or `any` |
| `knowledge.csv` | One row per change: `viewpoint, region, year, level, confidence, source, note` |
| `journeys/<id>.json` | Stops (with optional waypoints to force a historical course) and the `informs` events: what each viewpoint learned, at what level (or exactly what level, `"=2"`, for a sub-region held below its parent), and when the news reached home. A stop's optional `by` (`sea`, `land`, `river`, `direct`) says how its leg was travelled, and a journey-level `by` sets the default; otherwise it is guessed from the journey's kind and the terrain. Routes are pulled taut and drawn as smooth curves that run on through waypoints and through stops the traveller passes on from |
| `cities.csv` | Founded, peak, abandoned, forgotten and rediscovered dates, tier, source, confidence, story |
| `depictions/<kind>/<id>/` | Imagined sketches of a subject (a city, for now) through its eras: `subject.json` gives the fixed view and a sourced caption per era (and per viewpoint), beside the accepted pictures. Generated with an image API: see [docs/image-api-guide.md](docs/image-api-guide.md) |
| `inventions.json` | Instruments and ideas (compass, printing, chronometer, satellites…): year, place of origin, `culture` (a viewpoint id or a plain name), `category`, what it changed, source, confidence |
| `i18n/zh/` | Chinese for the data: place names, region names, journeys (with every stop), inventions, viewpoints and key moments, sketch captions, city stories and event notes. The build checks every key against what it translates, fills in Chinese dates, reports coverage, and bundles it into `public/data/i18n/zh.json`. Interface text is in `src/i18n-zh.ts`, keyed by the English it replaces |
| `names.csv` | What each viewpoint called a region or city, with years (`*` is the default name) |
| `sources.csv` | Every source id used anywhere, with its citation |

Conventions in `knowledge.csv`:

- `year` is a year (negative is BCE) or a range `1000..1100`; the map uses the midpoint and the card shows the range.
- A cell takes the **highest** level of all regions that contain it, so broad regions set floors and small ones add detail.
- `=n` means **exactly** n: it holds a frontier back (the Greenland ice sheet, the summit of Everest) until the region's next row.
- Viewpoint `*` applies to all the cultural viewpoints; it is how the shared modern map after ~1900 is written.
- Lines starting with `#` are comments.

The build fails if any event, journey stop, city or invention lacks a source or confidence, if a source id is unknown, if a viewpoint has fewer than 8 key moments, or if a journey does not lift fog for at least one region. It routes every journey leg on a ~22 km H3 grid (sea legs keep to water, with straits carved open and the Suez and Panama canals opening in 1869 and 1914; land legs follow valleys and passes using ETOPO5 elevation; river legs follow Natural Earth rivers), treats the high Arctic as pack ice, snaps inland stops to the coast facing their next stop, warns about legs that detour absurdly or cross water by land (or land by sea), gives every stop a fractional year from its date or by distance within its year, and finds where journeys crossed paths. It also rasterizes regions onto an H3 grid (resolution 3, 41,162 cells, oceans included), turns everything into per-cell change points per viewpoint, and keeps the fog data under 5 MB (it is about 0.8 MB).

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

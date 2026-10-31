# Natural wonder sketchbook

All 68 entries marked `kind=natural` in `data/landmarks.csv` have one landscape
study under `data/depictions/natural/<landmark-id>/`.

Each folder contains `subject.json` (the study, caption, source, confidence and
scene brief), `landscape.webp` (accepted artwork), and `landscape.json` (the full
prompt and built-in imagegen provenance). English captions describe the visible
landform; Chinese titles and captions live in `data/i18n/zh/depictions.json`.
The landscape retains the source/confidence of its authored landmark entry;
many entries still cite the existing editorial `draft` source. The sketches do
not upgrade that evidence or claim to be eyewitness records.

The shared `natural` style in `data/depictions/style.json` uses graphite,
sepia ink and restrained watercolour on cream paper. Viewpoints include low
shorelines, gorge rims, mountain profiles, forested ridges and close geological
studies. The landscape is the subject, without a recurring explorer portrait.
Modern tourism infrastructure and invented monuments are excluded.

Natural wonders share city cards, but use standalone studies instead of city
eras. The card labels these as Landscape study / 山水写生; opening one does not
change the timeline year. Titles and captions explicitly identify historical
landscapes for Krakatoa before 1883, Lake Chad around 1850, Tambora after 1815,
the Aral Sea before 1960, Lake Texcoco around 1500 and Lop Nur before 1972.
These are views of the named places, not reconstructions of every selected year.
Season, weather, vegetation and viewpoints are interpretive choices.

The data build checks the subject against the natural-landmark IDs and generates
thumbnail, card and enlarged WebP files. Cards fetch these only when opened, with
translated captions and the standard Imagined sketch credit.

Geographic references consulted alongside the authored landmark descriptions:

- [UNESCO: Mosi-oa-Tunya / Victoria Falls](https://whc.unesco.org/en/list/509)
- [UNESCO: Canaima National Park](https://whc.unesco.org/en/list/701)
- [NASA: World of Change, shrinking Aral Sea](https://science.nasa.gov/earth/earth-observatory/world-of-change/aral-sea/)

Full per-image constraints, including distinctive mountain forms and exclusions,
are preserved in each generation record.

## Added landscapes

- **Pantanal — Where the flood spreads:** a low wetland view with small capybaras for scale; seasonal channels and wooded islands remain the principal subject. [UNESCO reference](https://whc.unesco.org/en/list/999/).
- **Vinicunca — Bands across the ridge:** muted geological colour bands across the real Andean ridge, without neon saturation or tourism infrastructure. The caption describes the geology rather than asserting a recent first discovery. [Peruvian tourism inventory](https://consultasenlinea.mincetur.gob.pe/fichaInventario/index.aspx?cod_Ficha=13101).

Both use dedicated `landmark-study-<id>` sources, English/Chinese captions, and built-in imagegen; final prompts are in each `landscape.json`.

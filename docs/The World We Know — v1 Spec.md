# The World We Know — v1 Spec

Oct 24, 2026 · @Green

## Overview

The World We Know is a browser atlas that shows, for any year and any viewpoint, how much of the world a civilization knew, and lets you follow the travelers who pushed that knowledge outward. It borrows the time scrubber and person-journey ideas from [jiangshan-map](https://github.com/DeanChensj/jiangshan-map) and turns them from territory into knowledge.

**Goals for v1**

- Show how the known worlds of four civilizations grew, met and sometimes shrank, and how about 200 notable cities rose and fell,, from 500 BCE to today.
- Show a separate Humanity layer: when people first arrived in each part of the world.
- Let people follow 19 journeys stop by stop, with the fog lifting as each journey's news reaches home.
- Make every view a shareable link (viewpoint, year, journey, region).
- Ship as a static site with no backend.

**Not in v1**

- Political borders as the main layer (an optional reference layer at most).
- Viewpoints beyond the four, such as the Mexica, Inca or Mali.
- The map quiz, historical map overlays, user accounts and crowd editing.

## Core concepts

The map always answers one question: what did this viewpoint know about each place in this year?

**Viewpoint.** A viewpoint is a culture's shared geographic knowledge, not a single person's. It has a home that can move over time (Chang'an, then Kaifeng, then Nanjing and Beijing). Knowledge counts once it reaches home, through a returning envoy, a merchant's report, a book or a map.

**Knowledge levels.** Each place has a level from 0 to 5 for each viewpoint. The level sets how thick the fog is.

| Level | Name | Meaning | Example | Fog |
| --- | --- | --- | --- | --- |
| 0 | Unknown | No awareness | The Americas for China before 1500 | Solid |
| 1 | Rumor | Hearsay, a name, no reliable location | Rome as "Daqin" for Han China | Heavy |
| 2 | Contact | Trade goods or travelers arrive, no maps | Silk reaching Rome | Medium |
| 3 | Coast charted | Usable sailing knowledge of the shore | Zheng He's charts of East Africa | Light, coast clear |
| 4 | Interior mapped | Main routes, cities and rivers known | Ptolemy's Mediterranean | Thin |
| 5 | Surveyed | Systematic measurement | 19th-century national surveys | Clear |

**Knowledge can be lost.** Levels can go down as well as up. Vinland faded from Norse and European knowledge after about 1000. Ptolemy's geography dropped out of Western Europe for centuries. Watching fog return is a core feature, not an edge case.

**Traveler versus home.** A journey has two clocks. The traveler sees a place on the date they arrive; the viewpoint learns it when the news gets home, often years later (Marco Polo returned in 1295 and his book followed around 1300). In journey mode the trail shows what the traveler saw; the fog only lifts on the "home knows" date.

**Humanity layer.** A fifth, special viewpoint shows first human arrival everywhere, from leaving Africa to the settlement of Aotearoa New Zealand, the first footsteps in Antarctica and finally the Moon. It has its own compressed timeline reaching back about 70,000 years. Language across the app avoids "discovered" and says "first known to" a viewpoint instead.

**The modern frontier.** After about 1900 the four viewpoints converge into one shared map, so the story shifts from who knew what to the last frontiers: the poles, the highest peaks, the deep ocean and space. In this era fog means a place no one has yet reached or mapped.

## The four viewpoints

v1 ships four viewpoints chosen because their known worlds overlap, collide and differ in instructive ways. Each needs roughly 8 to 12 key moments that change its fog.

| Viewpoint | Home over time | Key moments (approximate dates) |
| --- | --- | --- |
| Mediterranean / Europe | Athens, Rome, Constantinople, Venice, Lisbon, London | Herodotus c. 430 BCE · Alexander at the Indus 326 BCE · Pytheas in the North Atlantic c. 325 BCE · Ptolemy's Geography c. 150 CE · western contraction after 500 · Vinland c. 1000, then lost · Polo's book c. 1300 · Portuguese down Africa 1400s · Columbus 1492 · da Gama 1498 · Magellan–Elcano 1522 · Cook 1768–1779 |
| China | Chang'an, Luoyang, Kaifeng, Hangzhou, Nanjing, Beijing | Zhang Qian returns 126 BCE · Gan Ying reaches the Persian Gulf 97 CE · Xuanzang returns 645 · Zhao Rugua's survey of foreign lands 1225 · Zheng He's voyages 1405–1433, then retreat · Ricci's world map 1602 |
| Islamic world | Medina, Damascus, Baghdad, Cairo, Fez | Expansion 632–750 · merchant accounts of China 851 · Ibn Fadlan on the Volga 922 · al-Idrisi's world map 1154 · Ibn Battuta 1325–1354 · trans-Saharan trade to Timbuktu |
| Polynesia | Tonga and Samoa, then the Society Islands and Marquesas | Lapita settlers reach Tonga and Samoa c. 850 BCE (before the timeline starts) · long pause · East Polynesia settled c. 1000–1100 · Hawai'i and Rapa Nui c. 1200 · Aotearoa c. 1250 · contact with South America c. 1200 · Tupaia's chart with Cook 1769 |

Polynesian knowledge was carried in navigation lore and oral tradition, not written maps. Its dates come from archaeology and genetics, so its fog edges use wider date ranges and the region card says so. The Humanity layer sits alongside these four as a fifth, special viewpoint.

## Journeys

v1 includes 19 journeys: named travelers plus a few routes and group voyages, so merchants and navigators are not crowded out by famous names. Each one lifts fog for at least one viewpoint.

| Journey | Years (approx.) | Kind | Informs | Why it's in |
| --- | --- | --- | --- | --- |
| Apollo 11 | 1969 | Spaceflight | Humanity | First people on another world |
| Gagarin, Vostok 1 | 1961 | Spaceflight | Humanity | First human orbit, drawn as a ground track |
| Trieste to the Challenger Deep | 1960 | Deep dive | Humanity | Deepest point of the ocean reached |
| Hillary and Tenzing Norgay on Everest | 1953 | Mountaineering | Humanity | Highest point on Earth reached |
| Amundsen to the South Pole | 1910–1912 | Polar | Humanity, Europe | Interior of the last continent reached |
| Cook's first voyage, with Tupaia | 1768–1771 | Sailor | Europe, Polynesia | Two knowledge systems meet on one chart |
| Magellan–Elcano | 1519–1522 | Sailor | Europe | First circumnavigation; the Pacific's true size |
| Vasco da Gama | 1497–1499 | Sailor | Europe | Sea route to India; joins Europe's map to the Indian Ocean |
| Columbus, first voyage | 1492–1493 | Sailor | Europe | The Americas enter Europe's map |
| Zheng He's seven voyages | 1405–1433 | Fleet | China | Peak of Chinese sea knowledge, then deliberate retreat |
| Ibn Battuta | 1325–1354 | Traveler | Islamic world | Widest single-person journey of the era |
| Mansa Musa's hajj | 1324–1325 | Pilgrim | Islamic world, Europe | Puts Mali on Mediterranean maps |
| Marco Polo | 1271–1295 | Merchant | Europe | Asia reaches Europe through a book |
| Settlement of East Polynesia | c. 1000–1250 | Group voyage | Polynesia, Humanity | Last great human expansion into empty land |
| Leif Erikson to Vinland | c. 1000 | Sailor | Europe | Knowledge gained, then lost |
| Xuanzang | 629–645 | Pilgrim | China | India mapped for China in detail |
| Monsoon trade (Periplus route) | 1st century CE | Merchant route | Europe | Red Sea to India by the seasonal winds |
| Zhang Qian | 138–126 BCE | Envoy | China | Opens Central Asia to Han China |
| Pytheas of Massalia | c. 325 BCE | Sailor | Europe | Britain and the far North; "Thule" |

**Next in line for v2:** Hanno, Faxian, Ibn Fadlan, the Manila galleons, Humboldt, Lewis and Clark, Livingstone, Tharp and Heezen's ocean-floor map, Voyager.

## Cities

About 200 notable cities rise, flourish, vanish and are sometimes found again, mirroring the gain and loss of knowledge the map is about.

**Dates.** Each city has up to five dates: founded, peak, abandoned, forgotten and rediscovered. "Forgotten" matters because a place can stay well known while a city in it is lost: Pompeii's region never left the map, but the town did. Cities older than 500 BCE are on the map from the start.

| State | When | How it draws |
| --- | --- | --- |
| Living | Founded until abandoned | Dot sized by tier (1–3), with a short pulse when it appears |
| Ruin | Abandoned but remembered | Ruin marker, dimmed label |
| Lost | Forgotten until rediscovered | Hidden; a faint ruin only in the Humanity layer |
| Rediscovered | After rediscovery | Ruin marker with its find date on the card |

**Seen through the viewpoint.** A city shows only once its place is at Contact (level 2) or better for the current viewpoint, and its label uses that viewpoint's name for it in that year. Rome appears to Han China as Daqin; Byzantium becomes Constantinople and then Istanbul. The Humanity layer shows every city.

**City card.** Clicking a city shows its names over time, its dates, a short story and the journeys that stopped there. Deep link: `?city=loulan`.

**Story cities for v1** (dates approximate):

| City | Story | Key dates |
| --- | --- | --- |
| Pompeii | Buried by Vesuvius, dug out 1,700 years later | Destroyed 79 · excavated from 1748 |
| Loulan | Silk Road oasis swallowed by the desert | Abandoned c. 4th century · found by Sven Hedin 1900 |
| Angkor | Khmer capital left to the forest | Declined after 1431 · widely known in Europe from the 1860s |
| Tenochtitlan | Built on a lake, destroyed, rebuilt as Mexico City | Founded 1325 · destroyed 1521 |
| Machu Picchu | Inca estate known locally, new to the outside world | Built c. 1450 · publicized 1911 |
| Great Zimbabwe | Stone capital of a gold-trading state | Peak 1300s · abandoned c. 1450 |
| Cahokia | Largest city north of Mexico, then empty | Peak c. 1100 · abandoned c. 1350 |
| Baghdad | A planned round capital built from scratch | Founded 762 |
| Carthage | Razed by Rome, later refounded | Destroyed 146 BCE |
| Persepolis | Burned by Alexander's army | Destroyed 330 BCE |

**Data.** `cities.csv` holds one row per city: id, lat, lon, tier, the five dates (ranges allowed), source and confidence. Names live in `names.csv` alongside region names. A candidate base list is Reba, Reitsma and Seto's 2016 historical urban population dataset (license to check), curated by hand for stories.

## UI and interactions

One full-screen map with a viewpoint switcher on top and a timeline along the bottom; everything else opens as a side card.

- **Map.** A world map in a parchment style. Fog is drawn per grid cell at the opacity its level sets, with softened edges. The viewpoint's current home is marked with a small seal. From 1957 on, a Beyond Earth inset shows orbits and the Moon for space journeys. Cities draw as living dots, ruins or lost sites (see Cities).
- **Viewpoint switcher.** Five chips across the top: Europe, China, Islamic world, Polynesia, Humanity. Switching keeps the year and animates the fog between the two states.
- **Timeline.** Scrub from 500 BCE to today; the 20th century gets extra room per year so its dense events stay readable. Each viewpoint's key moments show as ticks; clicking one jumps to it. Play steps through time at an adjustable speed. The Humanity layer switches to its own compressed scale.
- **Compare mode.** Pick two viewpoints to see where their known worlds overlap. Overlap shows as a third tint. Example: Venice and Nanjing in 1420.
- **Journey mode.** Search or pick a journey. Step through its stops with ‹ › or play it. The trail draws as the traveler moves; the year follows the stop; fog lifts at each "home knows" date. Each stop shows a short note and its source.
- **Region card.** Click any place to see a timeline of when each viewpoint learned of it, what they called it (Daqin, Serica, Bilad al-Sudan) and which journeys passed through.
- **Deep links.** `?vp=china&year=1420` · `?vp=europe,china&year=1420` (compare) · `?journey=zhenghe&stop=4` · `?region=east-africa-coast&vp=islam`.
- **Keyboard.** ← → step through key moments or stops, Space plays and pauses, / opens search, Esc closes cards.
- **Screens.** Desktop first; on phones the map and timeline work and cards open as bottom sheets.

## Data model

Authors write about named regions; a build step turns that into a hex grid the map can draw fast. Nobody edits individual cells.

**Grid.** The world is covered with H3 hexagons at resolution 3 (about 41,000 cells, each roughly 12,000 km²), oceans included so known seas show too. A cell's state is a short list of change points per viewpoint: `[[year, level], …]`.

**Source files** (in the repo, all plain text so changes review well):

- `viewpoints.json` — id, name, colour, and homes over time.
- `regions.geojson` — about 150 named regions ("Red Sea coast", "Japan", "Upper Nile"), each a polygon. Regions can overlap; a smaller region wins over a larger one.
- `knowledge.csv` — one row per change: viewpoint, region, year, level, confidence, source, note.
- `journeys/<id>.json` — one file per journey: its stops and the knowledge events it causes.
- `names.csv` — what each viewpoint called a region or city, with years.

```json
{
  "id": "zhenghe",
  "name": "Zheng He's seven voyages",
  "viewpoint": "china",
  "kind": "fleet",
  "stops": [
    {"year": 1405, "place": "Nanjing", "lat": 32.06, "lon": 118.78, "note": "Fleet departs", "source": "ming-shilu"},
    {"year": 1418, "place": "Malindi", "lat": -3.22, "lon": 40.12, "note": "East African coast", "source": "ming-shilu"}
  ],
  "informs": [
    {"region": "east-africa-coast", "level": 3, "homeKnows": 1419, "confidence": "medium"}
  ]
}
```

**Build output.** One compact file per viewpoint with each cell's change points, plus a search index of places, journeys and names. When the year changes the app looks up each cell's level from its change points; 41,000 lookups per frame is well within budget.

## Tech stack

A static site with a small build script: no server, hosted on GitHub Pages.

| Part | Choice | Why |
| --- | --- | --- |
| Map | MapLibre GL JS | Open source, WebGL, supports a globe view |
| Fog and trails | deck.gl (H3 hexagon and path layers) on top of MapLibre | Draws 41,000 hexes and animated trails on the GPU |
| Basemap | Natural Earth land, coasts and rivers, styled as parchment | Public domain |
| App shell | Plain TypeScript, bundled with Vite | Type safety for the data formats, no framework needed for a few screens; Vite compiles to static files |
| Build | Python with h3-py and shapely | Turns regions, events and journeys into cell files and checks them |
| Hosting | GitHub Pages | Free, static |

The flat map is the default; a globe toggle is worth having for Pacific journeys and Magellan. Political borders from historical-basemaps can come in as an optional reference layer later, but that data is GPL-3.0, which would set the project's license (see Open questions).

## Data sourcing and accuracy

Every knowledge event and journey stop carries a source and a confidence rating; the build fails if either is missing. The dates in this spec come from general knowledge and are approximate until the verification pass in phase 3.

- **Primary sources** set levels 3 to 5 where they exist: Ptolemy's Geography, the Periplus of the Erythraean Sea, Zhao Rugua's account of foreign lands, al-Idrisi's map, Ibn Battuta's Rihla, period world maps.
- **Secondary sources** fill the gaps, led by the History of Cartography series (University of Chicago, free online).
- **Confidence** is high, medium or low. Low-confidence changes draw with a soft, wide fog edge and show a date range on the region card.
- **Uncertain dates** are stored as ranges (`c. 1000–1100`); the map uses the midpoint and the card shows the range.
- **Review.** Each viewpoint gets a reviewer who knows that history before launch. Polynesia especially should be reviewed with Pacific scholarship in mind, since its record is oral and archaeological.
- **Wording.** "First known to Europe", never "discovered". The Humanity layer is always one click away to show who was already there.

## Milestones

v1 runs in five phases, and the first one is a cheap test of the core idea before the expensive data work begins.

&#91;embedded content: v1 roadmap · 5 phases, 4 gates\]

If the fog doesn't read clearly in the prototype, the knowledge levels or rendering change before any region data is authored.

**Acceptance criteria for v1**

- Scrubbing the year redraws the fog at 30 frames per second or better on a typical laptop.
- Each of the four viewpoints has at least 8 key moments, each with a source, and every city has sourced dates.
- All 19 journeys play from first to last stop, and each lifts fog for at least one region.
- Switching viewpoints keeps the year, and compare mode works for any pair.
- Any view, including a city card, can be reopened from its link.
- The site loads in under 3 seconds on broadband, with fog data under 5 MB.

## Open questions

- [ ] License: MIT and skip GPL border data, or GPL-3.0 and include historical borders?
- [ ] Languages: English only, or English and Chinese from the start like jiangshan-map?
- [ ] Should other viewpoints show the Humanity layer faintly under their fog, so lived-in places never look empty?
- [ ] Which viewpoints come next in v2: Mexica, Inca, Mali, India, Japan?
- [ ] Who are the reviewers for each viewpoint?

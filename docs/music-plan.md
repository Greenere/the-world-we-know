# Music plan

A proposal for adding music to the atlas: what kind, where it plays, where it
comes from, and how much work it is. Nothing here is built yet.

## What the music is for

The sketches show what a place looked like. Music can do the same for what a
place sounded like, which the atlas cannot show any other way. The same honesty
rules apply as for the pictures:

- **Say what it is.** Every track has a card line naming the piece, its date and
  tradition, the performers, and how close it is to what was heard there. A
  Byzantine chant recorded in 1990 is not the sound of Hagia Sophia in 537, and
  the card says so.
- **Off until asked.** Sound is muted by default and starts only after the reader
  turns it on (browsers block autoplay anyway). One toggle in the top bar,
  remembered per reader.
- **Silence is allowed.** Where no music survives and no honest stand-in exists
  (Old Kingdom Egypt, the Moche), the card stays silent rather than inventing a sound.

## Where it plays

Five places, from the most specific to the most general:

1. **Landmark cards.** Opening a landmark card plays its track, fading in, and
   closing the card fades it out. This pairs with the sketches Codex is adding
   for built landmarks, and it is the clearest case: one place, one era, one piece.
2. **City cards, by era.** The prominent cities already have sketches for
   each era of their history, and the music follows the same eras. For example,
   Constantinople has Byzantine chant before 1453 and Ottoman court music
   after; Kyoto has gagaku in the Heian era and shamisen in Edo times.
3. **Regions.** Opening a region card, or, as an option, the place the map is
   centred on, plays the music of that part of the world in that era.
4. **Journeys.** A journey that plays from start to finish has a theme, fading out
   when the journey closes. A few dozen would cover the most-followed journeys:
   Zheng He, Ibn Battuta, Xuanzang, Magellan, Cook.
5. **The viewpoint.** A quiet bed for the culture whose map is on screen. This
   is the least specific option, and regions may make it unnecessary.

### One library, not five collections

Places share music. The same Byzantine chant fits Hagia Sophia, Constantinople
before 1453 and the Byzantine east as a region, and Song-dynasty guqin fits
Hangzhou and southern China in the same centuries. So the tracks form one
library, and each place points into it. When a card opens, the player plays
the most specific track it can find and falls back to the next level:

**landmark → city in that era → region in that era → silence**

So every landmark and city gets music as soon as its region has some, and a
specific track replaces the regional one wherever a better one exists.

### Musical regions

The atlas's 221 map regions are far too fine for music. Group them into about
twenty musical regions instead: areas that shared instruments, modes and
repertoire. For example:

- East Asia: China, Korea, Japan
- Mainland Southeast Asia; island Southeast Asia
- South Asia: north India; south India
- Persia and Central Asia; the steppe
- The Arab world and the Levant; Egypt; the Maghreb and al-Andalus
- The Sahel; the Horn of Africa; the Swahili coast; southern Africa
- Latin Europe; the Byzantine and Orthodox east, then Russia
- Mesoamerica; the Andes; North America; the Arctic; the Pacific

Each region needs music for the eras the atlas uses. In practice most regions
have nothing honest before 500 CE, so the grid is sparse: about 20 regions ×
2–3 eras with surviving music is 40–60 tracks.

### Prominent cities

58 cities are drawn at the top tier. Most need no track of their own, because
the regional track for their era fits them. A dedicated track is worth it only
when a city has a sound of its own. Examples:

- Venice: Gabrieli, written for St Mark's
- Vienna: from the 1700s on (not yet a city in the atlas)
- Isfahan: Safavid court music
- Timbuktu and the griots
- Cusco: *Hanacpachap cussicuinin*
- Edo: shamisen and kabuki
- Buenos Aires: tango, for the last era

That's perhaps 20–30 city tracks on top of the regional set.

## Where the music comes from

There are two separate rights in every recording: the composition and the
performance. A public-domain piece in a modern recording is usually not free to
use. Four sources, from most to least authentic:

| Tier | What | Examples | Rights |
|---|---|---|---|
| 1. Notated in its own time | Music written down in or near the period, performed now | Pérotin's *Viderunt omnes* (Notre-Dame, 1198); Palestrina (papal chapel, 1560s); Lully (Versailles); the Westminster Quarters (Big Ben, 1859); *Hanacpachap cussicuinin* (Peru, printed 1631, in Quechua); the Seikilos epitaph and Delphic hymns (Greek world) | Composition public domain; we need a free recording, or we render our own |
| 2. Living tradition | A tradition still performed, with roots in the period | Gagaku (Tōdai-ji), Javanese gamelan (Borobudur, Prambanan), Khmer pinpeat (Angkor), Byzantine and Ethiopian chant, Andalusi nūba (the Alhambra), guqin | Recordings vary; some archives are open, many are not |
| 3. Reconstruction | Scholarly guesses from instruments and images | Mexica drums and flutes, Roman tibia, the Hurrian hymn from Ugarit | Usually modern recordings under copyright; commission or render |
| 4. Imagined | New music in the manner of the place, labelled as such | Anywhere tiers 1–3 have nothing | Ours, if we make it ourselves |

**My recommendation: render tier 1 ourselves.** For notated music, set the
public-domain score in MuseScore or LilyPond and render it with free sample
libraries (for example the CC0 *Versilian Community Sample Library*). Rights are
then clean, we can trim and loop as we like, and the card can say exactly what
it is. The sound will be good but not concert quality; for chant and early
polyphony that matters less than it would for an orchestra.

For tier 2, use recordings with a clear free licence (Wikimedia Commons, the
Internet Archive's public-domain collections, Musopen), and skip where none
exists. Do not use commercial albums or Smithsonian Folkways tracks without a licence.

Tier 4 can come from AI music models. Their training data and the terms for
their output vary by model and change often, so check the licence of whichever
tool is used at the time. If we use them, label the track "imagined", as the
sketches are. Never generate imitations of sacred or ceremonial music from
living communities, such as Hopi, Aboriginal Australian or Ethiopian liturgical
music. Where a community restricts its ceremonial songs, the card stays silent.

### A first set of ten, all tier 1 or 2

| Landmark | Piece | Tier |
|---|---|---|
| Notre-Dame de Paris | Pérotin, *Viderunt omnes* (1198), written for the cathedral | 1 |
| St Peter's Basilica | Palestrina, from the *Missa Papae Marcelli* (1560s) | 1 |
| Versailles | Lully, from a court ballet or *tragédie lyrique* | 1 |
| Big Ben | The Westminster Quarters (1793), adopted at Westminster in 1859 | 1 |
| Sacsayhuamán / Cusco | *Hanacpachap cussicuinin* (printed 1631) | 1 |
| Parthenon | The Seikilos epitaph or a Delphic hymn | 1 |
| Hagia Sophia | Byzantine chant | 2 |
| Tōdai-ji | Gagaku, such as *Etenraku* | 2 |
| Borobudur | Central Javanese gamelan | 2 |
| Eiffel Tower | Javanese gamelan or Debussy: Debussy heard gamelan at the 1889 Exposition the tower was built for | 1 or 2 |

## How it fits the code

- **Data.** A `data/music/<id>/` folder per track, like the sketches:
  - the audio file;
  - `track.json` with title, composer or tradition, date, tier, performer or
    renderer, licence, source URL, a one-line caption, and a confidence for how
    close it is to the place and time.
  - Chinese titles and captions go in `data/i18n/zh/music.json`.
- **Links.** A landmark, city era, musical region or journey names a track with a
  `music` field. One track can serve several places; the Westminster Quarters, for
  example, would serve only Big Ben, but one Byzantine chant could serve Hagia
  Sophia and Constantinople. The musical regions live in `data/music-regions.json`:
  each lists the map regions it covers and a track for each era it has music for.
- **Build.** `npm run data` checks every link, file, licence and source, and
  copies the audio to `public/`, as it does for pictures.
- **Player.** One small module on the Web Audio API or a single `<audio>`
  element:
  - fade in and out over about 1.5 seconds;
  - loop seamlessly;
  - load only the track that is about to play;
  - stop when the tab is hidden;
  - show the track's caption on the card under its sketch.
- **Format.** AAC in `.m4a` plays in every current browser. A 60–90 second loop at
  96 kbps is about 1 MB.

## Size

The atlas is served from GitHub Pages, which caps a site at about 1 GB. The
pictures already take much of that budget. At about 1 MB a track:

- 40–60 regional tracks: about 50 MB.
- Plus 20–30 city tracks and 20–30 landmark tracks: about 100 MB in all.
- Plus 30 journey themes: about 130 MB.
- At 64 kbps instead of 96, about two thirds of that. Chant and solo
  instruments lose little at the lower rate.
- A separate bed for every viewpoint in every era (30 viewpoints × 6 eras) would
  add about 180 MB, which is another reason to let regions do that job.

## Workload

Rough estimates of my time, not counting yours. The real bottleneck is
listening: someone has to hear every track before it ships.

Each track takes 20–40 minutes to research and license, plus 30–60 minutes to
render if we set it from a score.

| Phase | Work | Estimate |
|---|---|---|
| 0. Pilot | Choose and license the ten tracks above, render the tier-1 ones, write captions in both languages | 1–2 days |
| 1. Engineering | Data folders, music regions, the fallback chain, build checks, player, top-bar toggle, card caption, Chinese strings | 2–3 days |
| 2. Regions | 40–60 regional tracks across about 20 musical regions | 4–7 days |
| 3. Cities and landmarks | 20–30 city tracks and 20–30 landmark tracks, where a place has a sound of its own | 4–6 days |
| 4. Journeys | 20–30 themes for the most-followed journeys | 2–4 days |

A useful first milestone, phases 0 and 1, is about a week from start to finish,
including time for you to listen and decide whether the sound is worth keeping.

With regions in place, every landmark and city has something to play. Phases 3
and 4 only replace general tracks with specific ones. All phases come to about
three to four weeks of work, plus listening, for roughly 120–180 tracks.

## Open questions

- Should a landmark's track play automatically when its card opens (with sound
  on), or only when the reader presses play on the card?
- How quiet should the default volume be? It's an atlas you read, not a film.
- Do we want tier-4 imagined music at all, or only tiers 1–3 with silence elsewhere?
- Should regional music follow the map as you pan (more immersive, but it
  changes under you) or play only on region cards?
- Should the build order be regions first (every place gets something early)
  or landmarks first (the most authentic tracks first, alongside the sketches)?

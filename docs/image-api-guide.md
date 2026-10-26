# Generating the city sketches

Each city can have a picture for each era: an imagined traveller's sketch, with a short description of the city at that time. A viewpoint can describe the same era differently. The pictures change on the timeline the way names do. Constantinople / Istanbul is the pilot, with eight eras.

The sketches are **imagined**. They are drawn by an image model from a written description of what stood in the city at that time. They are not period artworks, and the card says so ("Imagined sketch · after Procopius, …"). The descriptions are written and sourced like every other fact in the atlas, and the picture follows them.

## 1. Choose a provider

Snapshot from October 2026. Prices change often, so check the provider's own page before a large run.

| Model | Quality | Price per image (1–2K) | Edits a reference image? | Use for |
|---|---|---|---|---|
| **OpenAI GPT Image 2 / 2.5** | Top of the public leaderboards | about $0.01–0.05 | Yes | First choice: best quality for the price |
| **Google Nano Banana Pro** (Gemini image) | Just behind OpenAI | about $0.13 (Nano Banana 2: about $0.03–0.07) | Yes, and strongest at keeping a scene consistent | Redrawing the same view across eras |
| Canva Craft | 4th on DesignArena at launch (Oct 22, 2026) | Not published; API in preview | **Not yet** | Revisit when reference images ship |
| Flux 2 Pro | Strong | about $0.03 per megapixel | Yes (Kontext) | Cheap fallback |

**Cost:**
- **Pilot:** 8 eras × about 4 tries is roughly 30 images, or $1–4.
- **Whole atlas:** a few thousand images with retries comes to roughly $60–300.

`scripts/generate_images.py` supports **OpenAI** and **Gemini**. For the pilot, run the first two eras with both, compare, and keep the better provider.

## 2. Set up a key

1. Create a key.
   - **OpenAI:** platform.openai.com → API keys. Image models may require organisation verification.
   - **Google:** aistudio.google.com → Get API key. Image models need billing turned on.
2. Put the key in your shell profile, never in the repository or a chat:

   ```sh
   # ~/.zshrc
   export OPENAI_API_KEY="sk-…"
   export GEMINI_API_KEY="…"
   ```

3. Open a new terminal (or `source ~/.zshrc`), and restart Claude Code so it sees the variable.

   Or put the same lines (without `export`) in a `.env` file at the repo root. It is git-ignored, and the script reads it when the variable isn't already set, so no restart is needed.

The script reads only `OPENAI_API_KEY` or `GEMINI_API_KEY`. It sends nothing else.

## 3. How the data fits together

Pictures are organised **by subject**: one folder for each thing that has pictures. There are two kinds:

- **A city** has **eras**: the same view redrawn as the city changes over time.
- **A journey** has **scenes**: illustrative moments at particular stops, drawn close enough to show people, tools and what was traded, measured or found. The traveller is the same person throughout; the view is not.

Regions and inventions can become kinds later with no change to the layout.

```
data/depictions/
  style.json                     the drawing style for each kind ({"styles": {"city": …, "journey": …}})
  journey/
    pytheas/
      subject.json               the traveller, and one entry per scene
      gnomon.webp, gnomon.json   …
  city/
    constantinople/
      subject.json               the fixed view, and one entry per era
      byzantion.webp             the accepted picture for an era (1536 px)
      byzantion.json             how it was made: provider, model, date, prompt
      new-rome.webp
      …
  _candidates/                   generated candidates awaiting review (git-ignored)
```

**`style.json`** holds one style per kind. Both describe an explorer's field-sketchbook page: pencil underdrawing, quick ink, uneven washes, edges fading into paper, and no writing. The city style is a landscape from one view. The journey style is a close, illustrated scene of one moment, with room for small separate studies of an object, a tool or a creature. Keep the styles fixed so the atlas looks like one set of notebooks.

**`subject.json`** has two parts:
- **`view`** says where the artist stands and what is where in the frame. Every era of the subject is drawn from this one view, so the pictures line up when you step through time.
- **`eras`** has one entry per era:

| Field | Meaning |
|---|---|
| `id` | Short era id, unique within the subject (`ottoman`). It also names the picture file |
| `from`, `to` | Years the era covers. Leave out `to` for an era that runs to today. Eras must not overlap |
| `title` | Short name of the era ("Ottoman Istanbul") |
| `caption` | 1–3 sentences on the subject in that era, for everyone |
| `captions` | Optional, per viewpoint: how `china`, `islam`, … knew it (Fulin 拂菻, al-Qustantiniyya) |
| `sources`, `confidence` | Source ids from `sources.csv`. The build checks them like every other fact |
| `prompt` | What to draw for this era: the year, what stands, what is gone, the boats on the water |
| `base` | Optional: the earlier era to redraw from. The model edits that picture, which keeps the same view |

**Pictures.** For each era, the build takes the first of `<era>.webp`, `.png` or `.jpg`. If none exists, it falls back to `<era>.placeholder.svg`, shown with a "Placeholder" tag. The optional `<era>.json` note supplies the model name the card shows.

**What the site gets.** `npm run data` writes `public/data/depictions/<kind>/<id>.json`, which the card fetches only when it opens. It also writes each picture in three sizes beside it:

| Size | Width | About | Used for |
|---|---|---|---|
| `<era>.thumb.webp` | 200 px | 3 KB | the strip of eras |
| `<era>.card.webp` | 720 px | 60 KB | the picture on the card |
| `<era>.full.webp` | 1280 px | 200 KB | the enlarged view, loaded only when opened |

**A journey's `subject.json`** has a `traveller` paragraph (face, build, clothing, what they carry), repeated in every scene's prompt so the person stays recognisable, and `scenes`:

| Field | Meaning |
|---|---|
| `id` | Short scene id (`gnomon`), unique within the journey |
| `stop`, `place` | Multiple scenes may share a stop; their authored order gives the page order within that stop. The stop the scene shows: its index among the journey's stops, counting from 0 and skipping waypoints, and its `place`, which the build checks against the journey file |
| `title`, `caption`, `captions`, `sources`, `confidence`, `prompt` | As for a city |
| `ref` | Optional: another scene whose accepted picture is attached as a reference for style and for the traveller's face, without copying its composition. Usually every scene refers to the first one |
| `traveller` | Optional, `false` for a page of what the party saw (a harbour, a fortress, a market) with none of the party in it. Without it the model tends to copy the reference page's people into the scene |

**Making a good journey sketchbook.**
- **Aim for one scene per major stop.** A long journey like Hasekura's has ten scenes, so the card changes often while it plays.
- **Mix the pages.** Some show the traveller in a moment; others show only what they saw or found.
- **Vary the traveller's pose and action** from scene to scene: on deck in a storm, head bowed at a font, kneeling, walking through a crowd. Write the action into the prompt rather than "stands beside".

While a journey with scenes is followed, the right-hand card shows the scene for the traveller's latest sketched stop, crossfading as they move on. Stops with a scene get a small picture mark in the journey panel. The card can be closed, and it reappears at the next scene.

The city and journey indexes only record how many pictures a subject has, so `cities.json` doesn't grow as pictures are added. Sizes are regenerated only when a source picture changes.

## 4. Workflow for one subject

```sh
# See exactly what will be sent
uv run --project scripts python scripts/generate_images.py --only city/constantinople/byzantion --dry-run

# Generate candidates for the first era (no base: drawn from text alone)
uv run --project scripts python scripts/generate_images.py --model gpt-image-2.5-flare --only city/constantinople/byzantion --count 2
uv run --project scripts python scripts/generate_images.py --provider gemini --only city/constantinople/byzantion --count 2
```

`--only` takes a subject (`city/constantinople`) or single eras (`city/constantinople/ottoman`), comma-separated. Candidates land in `data/depictions/_candidates/`, each `.webp` with a full-size `.png` and a `.json` note beside it. Open them, check them against the list in §5, and accept the best:

```sh
uv run --project scripts python scripts/generate_images.py --accept data/depictions/_candidates/city__constantinople__byzantion__gpt-image-2.5-flare__20261025T181134-ab12.webp
```

Then the next era. An era with a `base` is drawn as an edit of the accepted base picture, so accept the eras **in order**. Running without `--only` generates every era that has no accepted picture yet but whose base has one.

When the subject is done:

```sh
npm run data        # makes the served sizes (placeholders drop out)
npm run dev         # open ?city=constantinople and step through the eras
npm run deploy      # when happy
```

Commit `<era>.webp` and `<era>.json` in the subject's folder. Each is about 200–300 KB at 1536 px.

**The pilot.** Constantinople's eight eras were drawn with `gpt-image-2.5-flare` (OpenAI), two candidates per era, each era an edit of the one before. It took 18 calls in all, including the comparison runs. OpenAI sometimes answers "no access to model" for a request that works seconds later; the script retries that, along with rate limits and server errors.

**The journey pilot.** Pytheas of Massalia has five scenes:
1. measuring the noon shadow at Massalia;
2. the tin trade at Belerion;
3. the midnight sun and the "sea-lung" at Thule;
4. the amber island;
5. writing *On the Ocean*.

They took 14 calls in all. Two eras needed a sharper prompt: the tidal island first came with a medieval castle on it (St Michael's Mount), and the gnomon became a later sundial with a triangular blade.

### The Odyssey sketchbook

`data/depictions/journey/odyssey/subject.json` gives every one of the journey’s 18 stops a distinct page, including the storm at Malea, both returns to Aeolia and Aeaea, and the final recognition in Ithaca. Every caption cites Homer and names the relevant book; `data/i18n/zh/depictions.json` supplies Chinese titles and captions.

These are illustrations of a poem, not reconstructions of observed events. Use plausible late Bronze Age ships, clothing and buildings for the material setting, while keeping the supernatural episodes recognisably literary. The character description and the departure page provide continuity; vary the action and composition at each stop. Three observation pages omit the main character: the Laestrygonian harbour, Elpenor’s grave and the strait of Scylla and Charybdis. They set `traveller: false` and use no character reference. In particular, avoid medieval Troy, later multi-bank triremes, mermaid Sirens presented as Homer’s description, and an invented modern botanical identification for the lotus.

The accepted pages were made with the built-in image generation tool. Their adjacent JSON files record the prompts and method. The normal data build produces the thumbnail, card and enlarged WebP sizes and attaches the sketchbook automatically; open `?journey=odyssey` to follow it.

### Multiple pages at a journey stop

Journey scenes are sorted by `stop`, preserving their authored order within each stop. Several pages can share one stop and must each have a unique `id`. Playback holds at an illustrated stop and shows every page in authored order, including the first and final stops. Each decoded image receives at least eight seconds at normal speed (longer for longer captions), with a four-second floor at faster speeds. Pause preserves reading time; failed image loads have a bounded wait. Hidden cards do not hold travel. Clicking a thumbnail selects that page and pauses at its stop, even when the traveller is already there; the choice stays visible until a different illustrated stop is reached. Multi-page stops display a page counter and previous/next controls that stay within the stop, including on phones where the thumbnail strip is hidden. Existing one-page-per-stop sketchbooks keep the same behaviour.

### Ibn Battuta: 69 pages across 54 stops

`journey/ibnbattuta/subject.json` alternates fourteen scenes featuring the traveller with architectural views, landscapes, local work, transport, hospitality and close object studies. Cairo, Damascus, Tabriz, Jeddah, Mogadishu, Konya, the Golden Horde camp, Delhi, Calicut, the Maldives and Sumatra have companion pages at the same stop. `traveller: false` deliberately excludes a recognisable Ibn Battuta from the observation pages.

Captions prefer plain third-person paraphrases of the traveller’s recorded descriptions. For contextual scenes, use natural wording such as “he would have found”, supported by the place and period. Avoid second-person invitations and lyrical embellishment. Each scene records an editorial `evidence` note identifying its basis and passage; the existing Imagined sketch credit identifies the illustrations. Substantive route uncertainty belongs in the journey summary, confidence metadata and [research audit](ibn-battuta-sketchbook-research.md). Object arrangements, viewpoints and weather remain interpretive; Mali does not assert an exact capital site. The final Fez page describes dictation after the last route stop, with completion in 1355. Chinese titles and captions live in `data/i18n/zh/depictions.json`; adjacent generation records preserve the complete built-in-tool prompts.

Do not introduce later landmarks: no Ottoman monuments in Byzantine Constantinople, no Timurid Registan in Samarkand, no Mughal court in Delhi, no Portuguese forts in Mombasa or Kilwa, and no modern sanctuary expansions in Medina or Mecca. Alternate broad, middle-distance and close views rather than repeating the same traveller-centred composition.

## 5. Reviewing a picture

Reject a candidate if any of these fail:

- **History.** Only what stood in that year.
  - Constantinople: no minarets before 1453, and none on Hagia Sophia before the conquest.
  - The Blue Mosque appears only from 1616 and the Süleymaniye from 1557.
  - The Galata tower appears from 1348; the floating bridge, steamers and smoke only in the 19th century.
  - Check the boats too: triremes, dromons, galleys, caïques, steamers.
- **No writing.** No captions, false inscriptions or signatures. Models still slip letters into skies and margins.
- **Same view.** The point, the Golden Horn and Galata sit where the `views` text says, and later eras line up with earlier ones.
- **Style.** Ink and hatching with a light wash: a field sketch, not an oil painting, not a photograph.
- **Fair to the culture.** People, dress and buildings are of their place and time, without exoticising.

When an era keeps failing, fix the `prompt` (say what to leave out, name the landmark and where it stands) rather than accepting a near miss.

## 6. Adding another subject

1. Create `data/depictions/city/<city-id>/subject.json`. The id must match `cities.csv`.
2. Write the `view`: where the artist stands, what is left, centre and right, and the foreground. If the light matters, say where the sun is.
3. Add one era per turning point (a founding, a conquest, a great building, a fire, a railway). Most cities need 3–6. Write the captions first and source them; then write the prompts from the captions. Give every era after the first a `base`.
4. Optionally add `<era>.placeholder.svg` files so the card works before generation. Otherwise the build fails on a missing picture.
5. Generate, review and accept in order, as in §4.

Other kinds (journey stops, regions) need a few lines in the build (`DEPICTION_KINDS` in `scripts/build_data.py`) and a place on their card. The folder layout and the generator already work for them.

## 7. Troubleshooting

- **"model not found" or 404.** Model ids change. Pass `--model` with the current id from the provider's docs, and update `PROVIDERS` in the script.
- **400 about size or parameters.** The script asks for 1536×1024 (OpenAI) or 3:2 (Gemini). Some models accept only listed sizes; adjust them in the script.
- **The edit drifts from the base view.** Generate several candidates (`--count 4`). Nano Banana keeps scenes more consistent; try it for the edit eras.
- **Safety refusals.** Battles, sieges and fire can trip filters. Describe the city, not the violence.

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

The script reads only `OPENAI_API_KEY` or `GEMINI_API_KEY`. It sends nothing else.

## 3. How the data fits together

`data/depictions.json` has three parts.

**`style`.** One paragraph shared by every picture: ink on laid paper, hatching, a sparing wash, no text. Keep it fixed, so the whole atlas looks like one notebook.

**`views`.** For each city, where the artist stands and what is where in the frame. Every era of that city is drawn from this one view, so the pictures line up when you step through time.

**`depictions`.** One entry per era:

| Field | Meaning |
|---|---|
| `id` | `<city>-<era>`, for example `constantinople-ottoman`. It also names the image file |
| `city` | City id from `cities.csv` |
| `from`, `to` | Years the era covers. Leave out `to` for an era that runs to today. Eras of one city must not overlap |
| `title` | Short name of the era ("Ottoman Istanbul") |
| `caption` | 1–3 sentences on the city in that era, for everyone |
| `captions` | Optional, per viewpoint: how `china`, `islam`, … knew it (Fulin 拂菻, al-Qustantiniyya) |
| `sources`, `confidence` | Source ids from `sources.csv`. The build checks them like every other fact |
| `prompt` | What to draw for this era: the year, what stands, what is gone, the boats on the water |
| `base` | Optional: the earlier era to redraw from. The model edits that image, which keeps the same view |

**Images** go in `data/depictions/`. For each depiction, the build takes the first file it finds:
1. `<id>.webp`, `.png` or `.jpg`: an accepted image;
2. otherwise `<id>.placeholder.svg`: shown with a "Placeholder" tag.

An optional `<id>.json` beside the image records the provider, model and date. The card shows the model name.

## 4. Workflow for one city

```sh
# See exactly what will be sent
uv run --project scripts python scripts/generate_images.py --only constantinople-byzantion --dry-run

# Generate 3 candidates for the first era (no base: drawn from text alone)
uv run --project scripts python scripts/generate_images.py --provider openai --only constantinople-byzantion --count 3
uv run --project scripts python scripts/generate_images.py --provider gemini --only constantinople-byzantion --count 3
```

Candidates land in `data/depictions/_candidates/`, which is never committed. Each `.webp` has a full-size `.png` and a `.json` note beside it. Open them, check them against the list in §5, and accept the best:

```sh
uv run --project scripts python scripts/generate_images.py --accept data/depictions/_candidates/constantinople-byzantion__openai__20261025T120000-1.webp
```

Then the next era. An era with a `base` is drawn as an edit of the accepted base image, so accept the eras **in order**: Byzantion, then New Rome, Justinian, and so on. Running without `--only` generates every era that has no accepted image yet but whose base has one.

When the city is done:

```sh
npm run data        # picks up the new images (placeholders drop out)
npm run dev         # open ?city=constantinople and step through the eras
npm run deploy      # when happy
```

Commit `data/depictions/<id>.webp` and `<id>.json`. Each image is about 100–250 KB at 1536 px wide.

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

## 6. Adding another city

1. Add a `views.<city>` paragraph: where the artist stands, what is left, centre and right, and the foreground.
2. Add one depiction per era, with real turning points as era boundaries (a founding, a conquest, a great building, a fire, a railway). Most cities need 3–6.
3. Write the captions first and source them. Then write the prompts from the captions.
4. Optionally add placeholder SVGs so the card works before generation. Otherwise the build fails on a missing image.
5. Generate, review and accept in order, as in §4.

## 7. Troubleshooting

- **"model not found" or 404.** Model ids change. Pass `--model` with the current id from the provider's docs, and update `PROVIDERS` in the script.
- **400 about size or parameters.** The script asks for 1536×1024 (OpenAI) or 3:2 (Gemini). Some models accept only listed sizes; adjust them in the script.
- **The edit drifts from the base view.** Generate several candidates (`--count 4`). Nano Banana keeps scenes more consistent; try it for the edit eras.
- **Safety refusals.** Battles, sieges and fire can trip filters. Describe the city, not the violence.

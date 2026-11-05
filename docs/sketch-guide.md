# Drawing for the atlas: a guide to the sketches

[中文](sketch-guide.zh.md)

The atlas has some six hundred sketches: scenes along the journeys, cities in each of their eras, inventions, landmarks and natural wonders. They are one of the things people remember it by, and also one of the easiest places for an error to hide. This guide is for anyone who wants to fix a sketch, propose one, or make one. It sets out what a sketch is, how it should look, how to get its history right, and how to hand it in.

For the machinery (API keys, the generator script, folder layout in full) see the [image generation guide](image-api-guide.md). This guide is about the drawing.

## 1. What a sketch is

Every sketch is an **imagined illustration**: a page from a field sketchbook that no one actually drew on the spot, made from a written, sourced description of what stood there at the time. The card always says so ("Imagined sketch · after Procopius, …"). A sketch is never presented as a period artwork, a photograph or a reconstruction known to be exact.

That has two consequences:

- **The words come first.** The caption and its sources are the facts; the picture follows them. A picture can't add a fact the caption doesn't support, and a beautiful picture with a wrong detail is a wrong picture.
- **Honest about guesswork.** Where the evidence is thin (a destroyed wonder, a lost city's skyline), the sketch is an interpretation, and its caption says so.

## 2. The look

All the sketches belong to one set of notebooks, in the manner of the expedition artists of the 18th and 19th centuries: Cook's artists, Conrad Martens on the *Beagle*, Thomas Baines with Livingstone. Every page shares:

- **A landscape page, 3:2.**
- **Graphite underdrawing** with the construction lines left in.
- **Quick sepia and brown ink** over part of it, with loose parallel hatching for shade.
- **A few uneven watercolour washes** in ochre, grey-green and faded blue (journeys may add a touch of red), pooling and leaving the paper bare in places.
- **Unfinished edges:** detail gathers on the subject; the sky, the margins and the near ground dissolve into bare, slightly foxed cream paper.
- **No writing at all:** no labels, captions, dates, numbers or signature. Inscriptions in a scene are illegible marks.
- **No frame, binding or border.** A single page.
- **A working sketch,** not a finished painting, a photograph, a digital render, concept art or an infographic.

Each kind of subject adds its own rules. The exact wording, which every model prompt starts from, is in [`data/depictions/style.json`](../data/depictions/style.json).

| Kind | What the page shows | Particular rules |
| --- | --- | --- |
| **City** | One fixed view of the city, redrawn for each era | Every era is drawn from the same spot, written in the subject's `view`, so the pages line up as the years change |
| **Journey** | One moment at a stop, close enough to see faces, hands, tools and goods | The traveller looks the same throughout and is shown in action, never standing to attention; some pages show only what the party saw; a small separate study of an object or creature may sit beside the scene |
| **Invention** | The object, the workshop, or people using it | One coherent scene, with at most one small unlabelled detail study |
| **Built landmark** | A dated architectural study | One perspective, believable structure and scale; people optional and small; no modern tourist works |
| **Natural wonder** | The real landscape | Its true landforms and scale, from one viewpoint; no tourist works, no invented features, no posing explorer |

## 3. Getting the history right

Most of the work is research, done before anything is drawn.

1. **Fix the year.** A sketch shows one moment: a city era's first years, the day of a journey's stop, a landmark at a stated date. Write the year down.
2. **List what stood, and what did not yet.** Buildings, walls, bridges, harbours, the shape of the shore. The commonest error is a later landmark: minarets on Hagia Sophia before 1453, the Registan in Timurid Samarkand, Portuguese forts in Kilwa before they were built, a Gothic castle on a Bronze Age island.
3. **Check what people used:** ships and boats (a trireme is not a galley, nor a caravel a galleon), dress, tools, animals, crops, money and weapons, all of their place and time.
4. **Draw people with respect.** People of the place, dressed as they were, doing what they did, never exotic decoration around a visiting hero.
5. **Mark the uncertain.** If the evidence doesn't say what something looked like, choose the plainest plausible form and say in the caption that it is a reconstruction.

Good sources are site reports and archaeological surveys, period descriptions (a traveller's own account of the city), period maps and views, and museum catalogues of objects. Use pictures, including photographs of ruins and later paintings, as evidence of facts, never as something to copy.

## 4. The words: caption and record

Each sketch has an entry in its subject's `subject.json` (see the [image guide, §3](image-api-guide.md#3-how-the-data-fits-together) for every field). The ones a contributor writes:

- **`title`:** a short name for the page ("Ottoman Istanbul", "The tin trade at Belerion").
- **`caption`:** one to three plain sentences on what the page shows, in the third person, without embellishment. It names what is uncertain.
- **`sources`, `confidence`:** source ids from [`data/sources.csv`](../data/sources.csv) (add the source there if it is new), and `high`, `medium` or `low`.
- **`prompt`:** what to draw, for this page: the year, the viewpoint, what stands and where, the people and what they are doing, and what to leave out.
- **`evidence`** (optional but welcome): a link and a sentence on what the drawing rests on.

Chinese titles and captions go in [`data/i18n/zh/depictions.json`](../data/i18n/zh/depictions.json); if you can't write them, someone will.

## 5. Making the picture

### With an image model

Most sketches so far were made with an image model. A good page comes from a good prompt, and from patience:

- **Start from the style.** The prompt is the kind's style from `style.json` followed by the page's own `prompt`. Don't rewrite the style; the set should look like one hand.
- **Be concrete.** Name the landmark and where it stands in the frame ("the dome at centre left, the harbour wall running right"). Say what to leave out ("no minarets", "no stone castle on the island").
- **Keep continuity.** A city's later eras are drawn as edits of the earlier picture (`base`); a journey's scenes take its first scene as a reference for the traveller's face (`ref`). Repeat the traveller's description in every scene.
- **Make several, keep one.** Generate a few candidates and judge them against the checklist below. If a page keeps failing, sharpen the prompt instead of accepting a near miss.
- **Record everything.** The full prompt, the model and the date go in the page's `.json` record, so anyone can see how it was made and make it again.

If you have an API key, [`scripts/generate_images.py`](../scripts/generate_images.py) does the assembling and recording for you; the [image guide](image-api-guide.md#4-workflow-for-one-subject) shows how. Without one, send the prompt you used and the picture, and the record will be written for you.

### By hand

Drawings by hand are welcome, and are credited to their artist on the card ("Imagined sketch by …"). They should sit comfortably beside the others: pencil, ink and a little watercolour on cream paper, unfinished at the edges, with no writing. Before starting a set, say so in a [discussion](https://github.com/Greenere/the-world-we-know/discussions), so it can be planned to fit.

- **Scan or photograph** the page flat, in even daylight, at least **1536 px wide**, cropped to 3:2.
- **Send the original file** (PNG or high-quality JPEG); the build makes the smaller sizes itself.
- **The record** names you as `artist` instead of a model, and still carries the caption, sources and what the drawing is based on.

## 6. Checklist

A page is accepted only if every answer is yes.

- [ ] **History:** everything in it existed in that year at that place, and nothing that didn't.
- [ ] **Caption:** the picture shows what the caption says, and nothing it doesn't support.
- [ ] **People:** of their place and time, drawn with respect.
- [ ] **No writing:** no letters, numbers, labels or signature anywhere, including in the sky and margins.
- [ ] **Style:** graphite, ink and light wash on cream paper, unfinished edges, a single page; not a painting, render or photograph.
- [ ] **View:** for a city, the same view as its other eras; for a journey, the same traveller as its other scenes.
- [ ] **Record:** sources and confidence given, and the prompt and model (or the artist) recorded.
- [ ] **Rights:** you made it, or have the right to share it under CC BY 4.0, and it doesn't copy an existing artwork.

## 7. Fixing a sketch

If a sketch has something wrong in it, **use "Suggest a correction" on its card.** The form already names the sketch on show and where its prompt and sources are recorded. Say what is wrong ("the ships are 17th-century galleons; in 1100 they would be dromons") and what your source shows instead.

A fix usually means sharpening the prompt and drawing the page again. The old picture stays in the repository's history.

## 8. Handing one in

- **To propose a subject, fix a page or send a picture:** use the [sketch form](https://github.com/Greenere/the-world-we-know/issues/new?template=sketch.yml). Attach the picture by dragging it into the form.
- **If you use git:** put the picture as `<id>.webp` (or `.png`) and its record as `<id>.json` in `data/depictions/<kind>/<subject>/`, add or update the entry in `subject.json`, run `npm run data`, and open a pull request. See [CONTRIBUTING.md](../CONTRIBUTING.md#editing-the-data-yourself).

The sketches, like the rest of the atlas's content, are published under [CC BY 4.0](../data/LICENSE.md).

# Contributing to The World We Know

[中文](CONTRIBUTING.zh.md)

The atlas says what each culture knew of the world, and when. Every one of those claims should rest on a source, and many still rest on general knowledge. If you know a region, a period or a culture well, you can make it more right. You don't need to write code or touch a file to help.

## Three ways to help

### 1. Point out a mistake

Every card in the atlas (a region, a place, a journey, an invention, a book, a plant or animal) ends with **Suggest a correction**. It opens a short form already filled in with what you were looking at, through whose eyes and in what year. Say what is wrong and where you read otherwise; we will make the change and credit you.

You can also [open the form directly](https://github.com/Greenere/the-world-we-know/issues/new?template=correction.yml).

### 2. Find a source for a draft row

Some rows still cite a placeholder: `draft` (a date from general knowledge) or `draft-urban` (a city's dates, waiting to be checked against Chandler's *Four Thousand Years of Urban Growth* and Modelski's *World Cities*). They are listed, grouped by area, in the issues labelled [**needs source**](https://github.com/Greenere/the-world-we-know/issues?q=is%3Aopen+label%3A%22needs+source%22). Pick a few, check them, and reply on the issue or use the [source form](https://github.com/Greenere/the-world-we-know/issues/new?template=source.yml). A source that confirms a row as it stands is just as useful as one that changes it.

### 3. Review a culture's view

Each viewpoint is a timeline of what one culture knew. If you know that culture's history, ideally from within its own tradition, look at the map through its eyes across the centuries: switch to it, play the timeline, and open the regions. Where it knows too much too early, or too little too late, tell us. [Discussions](https://github.com/Greenere/the-world-we-know/discussions) are the place for a wider review.

## What makes a good source

- **Specific.** A book or article with a page or chapter, or a primary text with its passage, rather than a general website.
- **Close to the claim.** For "Europe knew the Fezzan from 19 BCE", Pliny on Balbus's campaign is better than a modern summary; a modern study is better than an encyclopaedia.
- **Honest about doubt.** Every row has a confidence: `high` (well attested), `medium` (likely, from good sources) or `low` (inferred or contested). A low-confidence row with a source is better than a high-confidence one without.

The atlas never says "discovered". It says "first known to" a viewpoint: someone was almost always there already.

## Editing the data yourself

If you are comfortable with git, you are welcome to open a pull request. Everything lives in [`data/`](data); the [README](README.md#the-data) describes each file.

- To cite a source, add it to `data/sources.csv` (its `kind` is `work` for a text of its own time, `study` for modern scholarship) and use its id in the row.
- A row in `knowledge.csv` is one change in what a viewpoint knew of a region: `viewpoint, region, year, level, confidence, source, note`. Levels run from 0 (unknown) through 1 rumour, 2 contact, 3 coast charted and 4 interior mapped to 5 surveyed.
- A large region can hold smaller ones (the Sahara holds its west, centre and east). Put a row on the part it concerns; a row on the large region lights all of it.
- If a note is new, add its Chinese to `data/i18n/zh/notes.json` if you can; otherwise leave it, and someone will.

Run `npm run data` (it checks every reference and will tell you what's wrong) and `npm run build` before opening the pull request; both must pass. See [Running it locally](README.md#running-it-locally).

## Beyond the data

The atlas is also a piece of software, a bilingual text and a set of pictures, and all of those can use help.

### Report a bug or suggest an idea

Something broken, slow or confusing? [Open an issue](https://github.com/Greenere/the-world-we-know/issues/new) with what you did, what you expected, your browser and device, and the map's address (it records the view). A screenshot helps. For an idea, or anything you are unsure of, start a [discussion](https://github.com/Greenere/the-world-we-know/discussions) first. Corrections to the content itself are quickest through the link on the card.

### Code

The site is plain TypeScript with no framework, drawing the map with [MapLibre GL](https://maplibre.org/) and [deck.gl](https://deck.gl/); the data is compiled by a Python script. [Running it locally](README.md#running-it-locally) takes three commands, and the [project layout](README.md#project-layout) shows where things live.

- **Talk first about anything large.** A new feature, a new dependency or a change to how knowledge is modelled is best agreed in an issue or discussion before you build it. Small fixes can go straight to a pull request.
- **Match the code around you:** its naming, its idioms, and its comments, which explain *why* in plain sentences.
- **Every piece of interface text goes through `t()`**, with its Chinese in `src/i18n-zh.ts`. If you can't write the Chinese, say so in the pull request and someone will.
- **Look at it, not just at the tests:** check the change in the running app, at phone width as well as on a wide screen, and in both languages.
- **Before opening the pull request**, run `npm run typecheck`, `npm test`, `npm run data` and `npm run build`. The same checks run on every pull request.
- Keep a pull request to one change, and say in it what you changed and how you checked it.

### Translation

- **Improve the Chinese.** Interface text is in [`src/i18n-zh.ts`](src/i18n-zh.ts); the data's Chinese (names, journeys, notes, books) is in [`data/i18n/zh/`](data/i18n/zh). Better wording and more natural names are always welcome.
- **Add a language.** The data's translations follow one pattern any language can copy, but the interface currently switches between two languages only. Start a discussion first, so the switch can grow a third.

### Design and accessibility

The atlas aims to look like an old printed atlas and to be easy to read and use. If something is hard to see, to click or to understand, or can't be reached with the keyboard or a screen reader, please tell us; an issue with a screenshot is ideal. Design proposals are welcome as a discussion with a sketch or mock-up.

### Sketches

The pictures of cities, journey scenes, landmarks and inventions are **imagined illustrations**, labelled as such on every card, and each records the prompt it was made from and the sources its details follow. They are one of the easiest places for an error to hide, and contributions to them are especially welcome. The [sketch guide](docs/sketch-guide.md) sets out how they should look, how to get their history right, a checklist every page must pass, and how to make one with an image model or by hand.

- **Spot an error in a picture**, such as buildings, dress or ships wrong for the place and time: use the card's correction link, which names the sketch on show, and say what the sources show instead.
- **Propose a subject or send a sketch** through the [sketch form](https://github.com/Greenere/the-world-we-know/issues/new?template=sketch.yml). Drawings by hand are credited to their artist on the card.

### Writing

Cards carry short stories and notes. They are plain and specific, name their sources, and never say "discovered": a place is "first known to" a viewpoint, since someone was almost always there already. Proposals to sharpen a story, or to add one where there is none, are welcome as a correction or a pull request.

### Spread the word

Share the atlas with people who know a region or a period well, as they are the ones who can make it more right. If you use it in teaching or research, we would love to hear how in a [discussion](https://github.com/Greenere/the-world-we-know/discussions).

## Credit and license

Contributors are thanked in the commit that uses their correction or source. The data is published under [CC BY 4.0](data/LICENSE.md) and the code under the [Mozilla Public License 2.0](LICENSE); by contributing you agree that your contribution is shared under the same terms.

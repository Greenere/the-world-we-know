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

## Credit and license

Contributors are thanked in the commit that uses their correction or source. The data is published under [CC BY 4.0](data/LICENSE.md) and the code under the [Mozilla Public License 2.0](LICENSE); by contributing you agree that your contribution is shared under the same terms.

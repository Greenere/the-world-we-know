# Built landmark sketchbook

All 80 `kind=built` landmarks in `data/landmarks.csv` have one architectural
study in `data/depictions/built/<id>/`. Each folder contains the accepted
`sketch.webp`, a `subject.json` with the depicted year and caption, and
`sketch.json` recording the full built-in imagegen prompt and provenance.
Chinese titles and captions live in `data/i18n/zh/depictions.json`.

These are standalone dated studies, not a sequence showing each building
throughout its history. The card and enlarged image identify the depicted
period. Opening a study preserves the selected map year, including when it
differs from the sketch's period. Existing city-era behavior is unchanged.
The build validates built-landmark IDs and creates thumbnail, card and full
WebP variants; images load on demand through the existing plate component.

The set alternates exterior approaches, interiors, elevated engineering views
and details of stonework or sculpture. Graphite, sepia ink and muted watercolor
match the other sketchbooks. Captions describe the visible subject in plain
language and retain the landmark's existing source and confidence; an image
does not upgrade an editorial `draft` citation into archaeological evidence.

Period choices distinguish reconstructions from later surviving fabric:
Khufu's pyramid retains its casing, ancient Hagia Sophia has no Ottoman
roundels, Abu Simbel is shown before relocation, and Hoover Dam has no modern
bypass bridge. Excavated Göbekli Tepe and the terracotta army are explicitly
modern archaeological views. Notre-Dame is dated around 1900 to match its
nineteenth-century spire, Prambanan around 1955 to accommodate the restored
central tower, and Hagia Sophia around 1100 for its Byzantine decorative
scheme. Destroyed ancient wonders are interpretive reconstructions, not
claims that their exact appearance or siting is known.

Architectural references checked alongside the authored landmark records:

- [English Heritage: Stonehenge stones](https://www.english-heritage.org.uk/visit/places/stonehenge/things-to-do/stone-circle/stones-of-stonehenge)
- [UNESCO: Göbekli Tepe](https://whc.unesco.org/en/list/1572/)
- [UNESCO: Mahabodhi](https://whc.unesco.org/en/list/1056/)
- [UNESCO: Konark](https://www.unesco.org/en/articles/sun-temple-konarak)
- [Newgrange: passage and chamber](https://www.newgrange.com/description.htm)
- [Metropolitan Museum: ancient colossal statues](https://www.metmuseum.org/fr/perspectives/ancient-and-modern-colossal-statues) — the Colossus does not straddle the harbour.
- [UNESCO: Samarkand](https://whc.unesco.org/en/list/603)
- [UNESCO: Prambanan](https://whc.unesco.org/en/list/642/)
- [UNESCO: Timbuktu](https://whc.unesco.org/en/activities/1099)
- [Tōdai-ji: rebuilding in 1709](https://www.todaiji.or.jp/en/history/edoki/)

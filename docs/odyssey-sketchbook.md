# The Odyssey sketchbook

Reworked 28 October 2026: 42 pages across all 18 existing stops, replacing the
original one-picture-per-stop sequence. Longer episodes receive two to four
pages, in narrative order. The route's coordinates and schematic dates remain
unchanged; the journey summary explains their legendary and illustrative nature.

## Captions and evidence

English and Chinese captions use direct third-person paraphrases, with book
references, rather than repeated reconstruction disclaimers or invented dialogue.
The existing Imagined sketch credit remains. Each scene has an editorial
`evidence` record with its books and primary-text URL; this is not another warning
displayed on the card. The source remains `homer` and confidence remains `low`:
these are illustrations of a poem, not evidence of a historical itinerary.

Primary text checked: [Homer, The Odyssey, translated by Samuel Butler, Project
Gutenberg](https://www.gutenberg.org/files/1727/1727-h/1727-h.htm), especially
Books 5–13, 17 and 21–23. Butler uses Roman names for several gods and Ulysses for
Odysseus; the captions retain the atlas's Greek names. His speculative preface
and geographical identifications are not used as evidence for the map.

## Visual sequence

Wide shorelines and harbours alternate with interiors, animals, everyday work,
objects and encounters. Thirty pages do not feature an identifiable
Odysseus; some retain tiny crew figures for scale. The `composition` field records
each page's focus and viewpoint. Object pages are full scenes, rather than a
small decorative inset repeated beside a hero portrait.

- Troy to the Lotus-eaters: fleet, Maron's wine, the retreat, Cape Malea, offered
  food and the reluctant scouts back aboard.
- Cyclopes and Aeolus: dairy stores, the wine and Nobody, escape under the ram,
  the walled island, sealed wind bag, Ithaca's fires, the opened bag and refusal.
- Laestrygonians: a quiet enclosed harbour followed by its destruction, from
  different viewpoints that show why the ship outside survives.
- Aeaea and Ocean: Circe's animals, moly, restored companions, the misty shore,
  Tiresias, Anticlea, Elpenor's oar and Circe's final instructions.
- Sirens to Thrinacia: wax and rope, the rowing passage, Charybdis and Scylla as
  separate views, sacred cattle, empty provisions and the wreck's mast and keel.
- Ogygia and Scheria: Calypso's garden, raft carpentry, navigation by stars,
  shelter under olives, laundry beside the river, Alcinous's orchard and the bard.
- Ithaca: arrival asleep, Argos, the bow and the rooted olive bedpost.

## Details corrected or made explicit

- The Sirens passage is calm; the sail is lowered and stowed and the crew rows.
  Their anatomy is not specified by Homer, so distant silhouettes avoid asserting
  a mermaid or bird-woman design as textual fact.
- The scouts' lotus food and Hermes's moly are not assigned a modern botanical
  species. Moly's black root and white flower follow the description.
- Maron's wine is a gift for sparing his household, not generic stolen treasure.
- The man escaping beneath the ram is physically under its belly, not astride it.
- Scylla's cave is high; Charybdis lies below the lower rock and its fig tree.
  Separate compositions avoid flattening them into a symmetrical monster duel.
- The Sun's cattle are ordinary-looking cattle. Scarcity and the crew's decision
  are explained before the shipwreck; Odysseus does not join their slaughter.
- The post-wreck support is the mast lashed to the keel. The substantial raft is
  built later on Ogygia; Calypso has neither a ship nor sailors to send him home.
- Nausicaa's page centres laundry and hospitality, rather than a romantic pose.
- Penelope's bedpost is a rooted trunk trimmed and worked into furniture, not a
  leafy tree growing through the bedchamber. The bow page avoids inventing the
  contested physical arrangement of the twelve axes.

## Assets and playback

Accepted WebP artwork and full built-in imagegen prompts live beside
`data/depictions/journey/odyssey/subject.json`; translations live under
`journey/odyssey` in `data/i18n/zh/depictions.json`. The original departure picture
is retained at `data/depictions/_references/odyssey-departure.webp` and serves
only as an identity and drawing-style reference for selected new scenes.
It is not an instruction to repeat its composition.

The existing shared journey player shows every page at a stop before continuing,
including all four pages at the final stop. At normal speed its caption-based
reading time is 8–14 seconds per page; faster playback retains a four-second
minimum. Previous/next sketch controls and the full sketch strip also allow
manual browsing. No Odyssey-specific playback implementation is needed.

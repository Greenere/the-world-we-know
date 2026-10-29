# Invention sketchbook

Every entry in `data/inventions.json` has one standalone study under
`data/depictions/invention/<id>/`. The collection currently contains 82 cards.

Each folder contains:

- `subject.json`: one `studies` entry (initially `sketch`), with title, caption, sources,
  confidence and the scene brief.
- `<study-id>.webp`: the accepted landscape illustration.
- `<study-id>.json`: the complete prompt, date and built-in imagegen method.

The Inca road and powered-flight studies use `sketch-v2`: the bridge is viewed
along its deck to make the traveller's footing and position inside the railings
clear; the Flyer follows the [period photographs reproduced by the National Park
Service](https://www.nps.gov/articles/wrightflyer.htm). Versioned asset names let
previously opened cards load the replacements without reusing cached images.

The astrolabe also uses `sketch-v2`, with a rigid flat disk, a consistent rim,
coplanar plates and a straight rule. Its revised prompt is saved beside the image.

Opening an invention centres its location. While its card is open, Left/Right
browse the same chronological list as the card buttons, stopping at either end.
Search, editable controls and enlarged-image dialogs keep their own key handling.
Invention-to-invention transitions retain the previous decoded sketch beneath
the next one, using the journey sketchbook's crossfade and text fade.

The shared invention style is in `data/depictions/style.json`: graphite,
sepia ink and restrained watercolour, with unfinished edges on cream paper.
Compositions alternate between object studies, tools being used, workshops,
observation scenes and wider landscapes. Clothing, materials and machinery
follow the date and place of the existing card. These are imagined studies,
not facsimiles of surviving artifacts or portraits claimed to be eyewitness records.

The existing invention summary supplies the enlarged image caption; its source
and confidence are carried into the study. Chinese titles and captions are in
`data/i18n/zh/depictions.json`, keyed by `invention/<id>`. When revising an
invention's summary, update the corresponding study and translation too.

`npm run data` validates the invention IDs and source references, produces
thumbnail/card/full WebP sizes and attaches a picture count to each invention.
The card fetches its study only when opened. Its existing heading, date and
summary remain visible; clicking the image opens the enlarged view with the
translated title and caption. The existing Imagined sketch credit identifies
the illustration. Invention studies do not participate in journey playback.

## Visual checks

The scene briefs use each card's cited source and distinguish the object being
illustrated from later forms. Examples include a suspended needle for Shen Kuo's
compass, baked-clay type for Bi Sheng, a centrally mounted Han rudder, the
watch-shaped H4, a side-wheel Great Western, a prone-pilot Wright Flyer, and a
NeXT workstation for the early Web.

Additional object/context references consulted:

- [British Museum: Babylonian map tablet](https://www.britishmuseum.org/collection/object/W_Sp-II-967)
- [Royal Museums Greenwich: Harrison's timekeepers](https://www.rmg.co.uk/stories/time/harrisons-clocks-longitude-problem)
- [Smithsonian: Marshall Islands stick navigation chart](https://www.si.edu/object/nmnhanthropology_8552873)
- [Royal Museums Greenwich: backstaff NAV0045](https://www.rmg.co.uk/collections/objects/rmgc-object-42257)
- [CERN: The birth of the Web](https://home.cern/science/computing/the-birth-of-the-web)

Small marks on maps and artifacts suggest historical writing without introducing
readable invented quotations. Maps are interpretive sketches, not reference
maps for measuring locations. Layout, poses, light and incidental surroundings
are artistic choices.

## October 2026 additions

Twenty-two new studies complete the expanded collection: the Royal Road, Pharos,
sewn-plank boats, double-hulled voyaging canoe, Mongol post, Mamluk pigeon post,
Ptolemy in Latin, Zheng He's charts, chasqui, Behaim's globe, Waldseemüller's map,
Piri Reis's map, Ricci's map, octant, Cihannüma, Cassini's survey, semaphore,
Great Trigonometrical Survey, electric telegraph, Haiguo tuzhi, telephone and radar.
Each uses the existing card's summary, source and confidence, with matching
Chinese title and enlarged-image caption.

The compositions distinguish relay systems (horse change, pass inspection,
runner handoff, pigeon message), mapmaking (translation, scroll, globe, wall map,
parchment, printing and field survey) and instruments (close mechanical studies).
The early East African boat page shows the sewn seam, without projecting a later
complete mtepe rig back into the first century. Historical maps are interpretive
studies, not exact facsimiles; the surviving charts and later museum instruments
inform their broad forms without asserting every depicted detail existed at the
card's earliest date.

Additional references checked for these drawings:

- [Germanisches Nationalmuseum: Behaim globe](https://objektkatalog.gnm.de/wisski/navigate/4516/view)
- [Library of Congress: Waldseemüller's 1507 map](https://loc.gov/exhibits/exploring-the-early-americas/interactives/waldseemuller-maps/worldmap1507/index.html)
- [Royal Geographical Society: Ricci's world map](https://www.rgs.org/our-collections/stories-from-our-collections/explore-our-collections/kunyu-wanguo-quantu-map) — period geography includes a hypothetical southern continent, rather than a modern outline of Australia.
- [London Museum: Hadley's octant](https://www.londonmuseum.org.uk/collections/v/object-281936/octant-hadleys-octant/) — a later surviving instrument, used for general geometry rather than copied as the 1731 prototype.
- [Musée des Arts et Métiers: Chappe telegraph model](https://www.arts-et-metiers.net/musee/modele-telegraphe-optique-systeme-chappe)
- [Science Museum Group: replica of Bell's March 1876 liquid transmitter](https://collection.sciencemuseumgroup.org.uk/objects/co33314/replica-of-bells-liquid-transmitter-of-march-1876-1880-1958)
- [Science Museum Group: apparatus from the 1935 radar experiment](https://collection.sciencemuseumgroup.org.uk/objects/co35028/apparatus-used-by-r-watson-watt-in-february-1935-f)

Prompts exclude later familiar substitutes: a dial telephone, a rotating radar
dish or circular sweep screen, a modern metal sextant, and laser surveying gear.

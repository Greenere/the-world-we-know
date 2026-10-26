# Ibn Battuta sketchbook: route and scene audit

Reviewed 26 October 2026. The sketchbook now has 69 pages across 54 illustrated stops on a 69-stop route. No stretch has more than two consecutive unillustrated stops. The pages alternate landscapes, architecture, people, transport, domestic life and objects. Nineteen pages were added to the original fifty. Calicut’s storm aftermath and the Granada view replace earlier compositions.

## Evidence and editorial approach

The route is a selective itinerary of the *Rihla*, not a record of every excursion or an independently verified GPS track. Calendar years remain approximate. Interpretive weather, camera position and object arrangements belong to the existing **Imagined sketch** annotation. Captions use plain third-person paraphrases of his descriptions where passages have been located. Contextual details use natural conditional narration such as “would have found”; they do not become invented eyewitness claims. Avoid second-person invitations, lyrical metaphors and repeated disclaimers. Each scene’s editorial `evidence` field records the basis and passage; this field is not displayed as another warning on the card. Source references and confidence remain attached to every page; the journey summary carries the meaningful chronology and China caveat.

Primary texts checked:

- [Gibb’s translated selections, Fordham](https://sourcebooks.web.fordham.edu/source/1354-ibnbattuta.asp): North Africa, Alexandria, Damascus, the Golden Horde, Mali and other selected passages.
- [Lee, ships of Calicut and the failed embassy](https://franpritchett.com/00generallinks/ibnbatuta/07china2.html): Chinese ship descriptions, shorebound traveller, wrecks, loss of baggage and subsequent southern Indian excursions.
- [Lee, Ma’bar and Bengal](https://franpritchett.com/00generallinks/ibnbatuta/10bengal.html): Sri Lanka–Ma’bar–Malabar–Maldives–Bengal sequence.
- [Lee’s full 1829 translation](https://archive.org/details/b28406084), pp. 200–201: Samudra’s ruler, conversation with scholars after Friday prayer, hospitality and onward passage. The historical text’s “Java” here refers to Sumatra; it is not an invitation to relocate Samudra to modern Java.

Cross-checks:

- [UC Berkeley ORIAS itinerary](https://orias.berkeley.edu/resources-teachers/travels-ibn-battuta/journey), based on Gibb and Ross Dunn. Used as a route guide, with its quotations checked against the translated account where available. Its modern illustrations are not evidence for fourteenth-century appearances.
- [C. F. Beckingham, Encyclopaedia Iranica](https://www.iranicaonline.org/articles/ebn-battuta/): conflicting dates, literary borrowings, and uncertainty in portions of the eastern itinerary. This is why we retain approximate years and lower confidence for Hangzhou, rather than treating every detail as established fact.

## Corrections

| Topic | Result |
| --- | --- |
| Ship technology | Moved `junk-details` from Samudra to Calicut. The account describes Chinese ships while waiting at Calicut and identifies Chinese construction centres. Neither the picture nor caption now claims he studied shipbuilding in Sumatra. |
| Samudra | Added the documented scholarly conversation after prayer. The other pages show a waterfront and provisioning on the return visit; there is no local Chinese shipyard claim. |
| Calicut | Three scales in order: offshore shipping, close fittings, intimate aftermath on shore. The traveller was not aboard the wreck. Two ships were wrecked and his possessions departed in another vessel. |
| Golden Horde | Separated the mobile camp near the northern Caucasus from New Sarai. Added the return via Astrakhan after Constantinople, then New Sarai before Central Asia. Removed the `from` branch that incorrectly made this a simultaneous route. The camp and capital coordinates are approximate. |
| Delhi to Calicut | Restored the Daulatabad–Cambay–Gandhar approach and explicit embarkation at Gandhar, followed by a sea leg down the west coast. |
| Sri Lanka to Bengal | Restored Madurai/Ma’bar and the return via the Malabar coast and Maldives. This is not a direct sail north from Adam’s Peak. Minor excursions remain compressed. |
| Westward return | Shaped the route through Hormuz and Persian cities before Baghdad. Restored Cairo before the final hajj, Alexandria as the embarkation point for the Mediterranean passage, and Tangier before Fez. |
| Bijaya | Fever belongs here; the later episode of tying himself into the saddle belongs after Bona. Removed that misplaced detail from the stop note. |
| Multan | Described arrival after crossing the Indus, not Multan itself as the river crossing. |
| Granada | Replaced the distant orchard panorama with a closer Albaicin view across the Darro toward the Alhambra. His praise for the surroundings remains paraphrased; this precise viewpoint is contextual. Checked topography and Nasrid building phases against the Patronato; excluded later Christian additions. |
| Bukhara | Added damaged brick arcades, matching the account’s ruined colleges. Avoided later Timurid blue-tiled monuments. |
| Return to Alexandria | Added the ruined, inaccessible lighthouse he describes in 1349, contrasting the accessible structure seen in 1326. |
| China and Mali | Kept interpretive scenes and source confidence. No added Beijing visit; no claim to know the exact site or architecture of Mali’s capital. |

## Additional stop pages and caption revision

- **Najaf:** [Arabic Rihla, p. 172](https://ablibrary.net/book_content/b/6802/172?lang=ar). The sequence of markets and the college’s three-day hospitality supply the scene and caption. The picture avoids the later gilded shrine skyline.
- **Isfahan:** [Gibb’s 1929 translation](https://www.heroesandlegends.com.au/wp-content/uploads/2022/08/2015.62617.Ibn-Battuta-Travels-In-Asia-And-Africa-1325-1354_text.pdf), p. 91 (PDF page 107). Fruit at a market stall follows his praise of apricots, quinces, grapes and melons. The particular arrangement is illustrative.
- **Dhofar, first visit:** Gibb selections, pp. 113–115, in the Fordham source above. A botanical page follows his observations of banana groves, coconut palms and betel on supports. The return visit retains its separate coastal scene.
- **Sinop:** Gibb (1929), p. 141 (PDF page 159). The caption preserves the distinction between about forty days waiting, hiring a Greek ship, and eleven additional days waiting for wind. The quay and shelter are a contextual composition.
- **Granada:** Gibb (1929), pp. 315–316, for the reign of Yusuf I, gardens and streams; [Patronato, The Enclave](https://www.alhambra-patronato.es/en/discover/alhambra-y-generalife/the-enclave), for the Albaicin–Darro–Sabika relationship and the fortification’s development. The image does not imply a documented palace audience.

All 69 English and Chinese captions were reviewed for the revised tone. They are paraphrases or contextual descriptions, not fabricated direct quotations. Existing route-level uncertainty remains in the summary and confidence fields. Hormuz’s caption now follows the account’s water collection from wells and reservoirs elsewhere on the island, without implying all its water was imported from the mainland.

## Playback and assets

Playback holds at each illustrated stop and turns through every page in authored order. At normal speed, pages receive at least eight seconds, with longer captions allowing more time. Speed controls affect this interval but never reduce it below four seconds. Image decoding precedes reading time; loading failures have a bounded wait. Pausing preserves the current page and remaining time. First and final stops receive the same treatment. Manual page controls pause playback, and hidden/dismissed cards do not hold travel.

Images were generated with the built-in imagegen tool and reviewed as contact sheets and individual images. Accepted WebPs and the exact generation prompts are together in [`data/depictions/journey/ibnbattuta`](../data/depictions/journey/ibnbattuta/). English scene data is in `subject.json`; Chinese captions are in `data/i18n/zh/depictions.json`.

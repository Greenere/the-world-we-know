# Marco Polo sketchbook

The collection contains 108 pages: 90 for `polo` and 18 for `polo-yunnan`.
All 69 narrative stops of the main route and all 13 stops of the Yunnan branch
have at least one page. Sailing waypoints are not narrative stops. Companion
pages share a stop and play before the traveller moves on.

| Main route section | Stops | Pages |
| --- | ---: | ---: |
| Venice to the first visit to Hormuz | 14 | 18 |
| Return inland, Pamirs and the road toward China | 22 | 26 |
| Shangdu, Khanbaliq and the southern cities | 17 | 27 |
| Maritime return and Genoese epilogue | 16 | 19 |

Marco appears in 25 pages across both routes. The others concentrate on places,
local work, animals, plants, food, trade goods and technical details. The
compositions alternate wide views, interiors, activity at human scale and close
object studies. Repeated visits have different subjects: the first Hormuz pages
show its port and sewn hulls; the return shows arrival after the sea voyage.

## Text and evidence

English captions and scene briefs live in each journey's `subject.json`.
Chinese titles and captions live under `journey/polo` and
`journey/polo-yunnan` in `data/i18n/zh/depictions.json`. Captions are plain-language
paraphrases or contextual descriptions, not invented quotations. Reported
stories are attributed when included. Existing route source/confidence values
are retained; the pictures do not raise their confidence.

The main textual reference is the public-domain Yule–Cordier edition:

- [Volume I: prologue, the outward route and the Khan's court](https://www.gutenberg.org/files/10636/10636-h/10636-h.htm)
- [Volume II: south-western and southern China, the maritime return](https://www.gutenberg.org/files/12410/12410-h/12410-h.htm)
- [Columbia University: translated Hangzhou excerpts](https://afe.easia.columbia.edu/ps/china/polo_hangzhou.pdf)

The book and its later editorial notes must be distinguished. An incidental
boat, loom, room or viewpoint is an interpretive reconstruction; it is not
evidence that Polo personally observed that exact scene. The dates inside China
follow the authored route's approximate chronology. No new claim that the book
provides a complete dated itinerary is made.

Specific choices:

- Hormuz is the old mainland settlement, without the later island fortress.
- The close shipbuilding study belongs to Hormuz; Sumatra shows the monsoon
  wait and anchorage, not an invented shipbuilding lesson.
- The Pamir animal is an argali with coherent horns and hooves.
- The desert-voices account accompanies an ordinary caravan at dusk, without
  spirits. Allegations about island peoples are not turned into scenes of
  violence or dehumanising caricatures.
- Yangzhou shows commerce, not Polo enthroned as its governor.
- The carved bridge at Lugou is not drawn with the book's exaggerated arch count.
- Shangdu's cane pavilion is a braced, dismantlable structure. Khanbaliq is Yuan
  Dadu, not the later Forbidden City.
- Currency pages distinguish Yuan paper notes, salt cakes and cowrie shells.
- The Yunnan battle account is not staged as a battle witnessed or commanded
  by Marco. Dali's pages show its setting and horses, not a claim that a
  particular crocodile species lived beside the city.
- The homecoming baggage does not enact the later jewels-in-the-coats story
  as established fact. Genoa closes the journey with dictation to Rustichello.

## Files and playback

Artwork is saved as WebP beside its full built-in imagegen prompt record under
`data/depictions/journey/polo/` and `data/depictions/journey/polo-yunnan/`.
Each scene records its stop, subject, composition focus, traveller presence and
textual reference. Source PNGs are converted into accepted WebP artwork; the
normal data build creates thumbnail, card and enlarged variants.

The shared journey player provides caption-based reading time for every page,
including companion pages at the same stop. At normal speed pages receive
8–14 seconds; faster playback retains a four-second minimum. These journeys
use the existing controls and playback logic without a special-case player.

## Page index

### Main journey

| Stop | Place | Sketch | Focus |
| ---: | --- | --- | --- |
| 1 | Venice | Leaving Venice | people |
| 1 | Venice | Across the Adriatic | travel |
| 2 | Acre | The harbour at Acre | landscape |
| 3 | Jerusalem | Oil for the Khan | object |
| 4 | Acre | Letters from the legate | people |
| 5 | Ayas | From the port to the road | travel |
| 6 | Sivas | Carpets of Turcomania | craft |
| 7 | Arzinga (Erzincan) | Cloth at Erzincan | object |
| 8 | Erzurum | Across the Armenian highlands | landscape |
| 9 | Tauris (Tabriz) | The market of Tabriz | city |
| 9 | Tauris (Tabriz) | Weighing a purchase | object |
| 10 | Saba (Saveh) | The tombs shown at Saveh | architecture |
| 11 | Yazd | Silk from Yazd | craft |
| 12 | Kerman | Embroidery in Kerman | craft |
| 12 | Kerman | Turquoise and worked steel | object |
| 13 | Camadi | Shelter after the raid | people |
| 14 | Hormuz | Old Hormuz on the mainland | city |
| 14 | Hormuz | Planks joined with cord | craft |
| 15 | Kerman | Back through Kerman | travel |
| 16 | Cobinan (Kuhbanan) | A polished steel mirror | object |
| 17 | Tonocain (Tun) | The country of the Dry Tree | landscape |
| 18 | Sapurgan (Sheberghan) | Melons dried for the road | food |
| 19 | Balkh | The ruined city of Balkh | city |
| 20 | Taican (Taloqan) | Salt from the mountains | object |
| 21 | Badakhshan | A pause in Badakhshan | people |
| 21 | Badakhshan | Lapis and balas rubies | object |
| 22 | Vokhan (Wakhan) | Up the Wakhan valley | landscape |
| 23 | The Pamir | Crossing the high plain | travel |
| 23 | The Pamir | The sheep with great horns | animal |
| 24 | Kashgar | Gardens around Kashgar | landscape |
| 25 | Yarkand | Water in the oasis | life |
| 26 | Khotan | Searching the riverbed | craft |
| 26 | Khotan | A handful of jade | object |
| 27 | Pem (Keriya) | Stones from the Keriya waters | life |
| 28 | Charchan (Qiemo) | A settlement at the sand's edge | landscape |
| 29 | Lop (Charklik) | Provisioning at Lop | people |
| 29 | Lop (Charklik) | Keeping together after dark | travel |
| 30 | Shazhou (Dunhuang) | Paper figures at Dunhuang | craft |
| 31 | Succiu (Suzhou, Jiuquan) | Rhubarb for distant markets | plant |
| 32 | Campichu (Ganzhou) | A reclining Buddha at Ganzhou | architecture |
| 33 | Ergiuul (Liangzhou) | A shaggy pack animal | animal |
| 34 | Egrigaia (Ningxia) | Cloth from camel hair | object |
| 35 | Tenduc | A Christian community on the steppe | life |
| 36 | Chagannor | Birds by the lake | animal |
| 37 | Shangdu (Xanadu) | The summer capital | city |
| 37 | Shangdu (Xanadu) | The palace of cane | architecture |
| 37 | Shangdu (Xanadu) | An audience with Kublai | people |
| 38 | Khanbaliq (Beijing) | Streets of the new capital | city |
| 38 | Khanbaliq (Beijing) | Paper accepted as money | object |
| 38 | Khanbaliq (Beijing) | Fresh horses at a post station | life |
| 39 | Pulisanghin (Lugou Bridge) | The bridge and its stone lions | architecture |
| 40 | Juju (Zhuozhou) | Where the roads divide | travel |
| 41 | Cacanfu (Hejian) | Silk in Hejian | craft |
| 42 | Cianglu (Changlu) | Drawing salt from the earth | craft |
| 42 | Cianglu (Changlu) | Crystals in the salt pan | object |
| 43 | Sinjumatu (Jining) | A waterway joining north and south | landscape |
| 44 | Coiganju (Huai'an) | Crossing into Manzi | travel |
| 45 | Cayu (Gaoyou) | Fish beside the canal | food |
| 46 | Yangiu (Yangzhou) | Merchants at Yangzhou | city |
| 47 | Chinghianfu (Zhenjiang) | A Christian church at Zhenjiang | architecture |
| 48 | Suju (Suzhou) | A bridge in Suzhou | city |
| 48 | Suju (Suzhou) | Choosing a length of silk | life |
| 49 | Quinsay (Hangzhou) | Waterways of Hangzhou | city |
| 49 | Quinsay (Hangzhou) | A southern market | life |
| 49 | Quinsay (Hangzhou) | Boats on the lake | landscape |
| 50 | Ghiuju (Quzhou) | Toward the Fujian hills | landscape |
| 51 | Quenlinfu (Jian'ou) | The chickens with soft plumage | animal |
| 52 | Fuju (Fuzhou) | Sugar for trade | craft |
| 53 | Zaiton (Quanzhou) | The port of Zaiton | city |
| 53 | Zaiton (Quanzhou) | Loading for the voyage | craft |
| 53 | Zaiton (Quanzhou) | The princess's escort | people |
| 54 | Ciamba (Champa) | Along the coast of Champa | landscape |
| 55 | Sondur and Condur (Côn Sơn) | Islands off the route | landscape |
| 56 | Pentam (Bintan) | Feeling a way through the shallows | travel |
| 57 | Samara (Samudra), Sumatra | Waiting for the monsoon | life |
| 57 | Samara (Samudra), Sumatra | The anchorage in rain | landscape |
| 58 | Necuveram (Nicobar Islands) | Coconuts on an island shore | plant |
| 59 | Seilan (Sri Lanka) | Stones from Seilan | object |
| 60 | Cail (Kayal), Maabar | The pearl fishery | life |
| 60 | Cail (Kayal), Maabar | Sorting the catch | object |
| 61 | Comari (Kanyakumari) | Rounding the southern cape | travel |
| 62 | Coilum (Quilon) | Pepper at Quilon | plant |
| 63 | Hormuz | Landfall in Persia | people |
| 64 | Tauris (Tabriz) | Tablets for the road west | object |
| 65 | Trebizond | Reduced baggage at Trebizond | life |
| 66 | Constantinople | Through the Bosporus | city |
| 67 | Negroponte | The narrow channel at Negroponte | landscape |
| 68 | Venice | Venice after twenty-four years | people |
| 68 | Venice | What came home | object |
| 69 | Genoa | The journey becomes a book | people |

### Yunnan branch

| Stop | Place | Sketch | Focus |
| ---: | --- | --- | --- |
| 1 | Juju (Zhuozhou) | Taking the western road | travel |
| 2 | Taianfu (Taiyuan) | Vineyards at Taiyuan | plant |
| 3 | Pianfu (Pingyang) | Silk merchants in Pingyang | life |
| 4 | The Caramoran (Yellow River) | Across the Yellow River | travel |
| 4 | The Caramoran (Yellow River) | Ropes and river mud | object |
| 5 | Kenjanfu (Xi'an) | Outside Prince Mangala's palace | architecture |
| 6 | Acbalec Manzi (Hanzhong) | Through the Qinling valleys | landscape |
| 7 | Sindufu (Chengdu) | A bridge lined with shops | architecture |
| 7 | Sindufu (Chengdu) | Under the bridge roof | life |
| 8 | Tebet | Bamboo in the campfire | life |
| 9 | Caindu (Xichang) | The lake at Caindu | landscape |
| 9 | Caindu (Xichang) | Salt cakes used in exchange | object |
| 10 | The Brius (Jinsha River) | Gold in the river gravel | craft |
| 11 | Yachi (Kunming) | The market at Yachi | city |
| 11 | Yachi (Kunming) | Shells as money | object |
| 12 | Carajan (Dali) | The old kingdom of Dali | landscape |
| 12 | Carajan (Dali) | Horses of the south-west | animal |
| 13 | Zardandan (Yongchang) | The road beyond Yongchang | travel |

// Line icons drawn for this atlas: 20×20, 1.5 strokes, currentColor.

const wrap = (body: string, view = '0 0 20 20') =>
  `<svg viewBox="${view}" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  play: wrap('<path d="M7 4.8v10.4L15.5 10z" fill="currentColor" stroke="none"/>'),
  pause: wrap('<path d="M6.5 4.5v11M13.5 4.5v11" stroke-width="2.2"/>'),
  prev: wrap('<path d="M12.5 4.5L7 10l5.5 5.5"/>'),
  next: wrap('<path d="M7.5 4.5L13 10l-5.5 5.5"/>'),
  close: wrap('<path d="M5 5l10 10M15 5L5 15"/>'),
  search: wrap('<circle cx="8.6" cy="8.6" r="5"/><path d="M12.4 12.4L16.5 16.5"/>'),
  globe: wrap(
    '<circle cx="10" cy="10" r="7"/><ellipse cx="10" cy="10" rx="3" ry="7"/><path d="M3.3 7.6h13.4M3.3 12.4h13.4"/>',
  ),
  flat: wrap('<rect x="3" y="4.5" width="14" height="11" rx="1"/><path d="M3 8.2h14M3 11.8h14M8 4.5v11M12 4.5v11"/>'),
  /** The atlas's own mark, before its name: a compass rose in red ink. */
  rose:
    '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10.5" stroke-width="1"/><circle cx="12" cy="12" r="7.6" stroke-width=".6"/><path d="M12 2.6 13.5 12 12 21.4 10.5 12z" fill="currentColor" stroke="none"/><path d="M2.6 12 12 10.6 21.4 12 12 13.4z" fill="currentColor" stroke="none" opacity=".5"/></svg>',
  info: wrap('<circle cx="10" cy="10" r="7"/><path d="M10 9v4.6"/><circle cx="10" cy="6.4" r=".4" fill="currentColor"/>'),
  compare: wrap('<circle cx="7.6" cy="10" r="4.6"/><circle cx="12.4" cy="10" r="4.6"/>'),
  compass: wrap(
    '<circle cx="10" cy="10" r="7.2"/><path d="M10 3.6l1.6 6.4L10 16.4 8.4 10z" fill="currentColor" stroke="none" opacity=".85"/><path d="M3.6 10h1.6M14.8 10h1.6"/>',
  ),
  speed: wrap('<path d="M4 14a6 6 0 1 1 12 0"/><path d="M10 14l3-4"/>'),
  arrow: wrap('<path d="M4 10h11M11 6l4 4-4 4"/>'),
  /** The auto camera: a frame whose corners open outward. */
  frame: wrap('<path d="M3.5 7.5v-4h4M12.5 3.5h4v4M16.5 12.5v4h-4M7.5 16.5h-4v-4"/><path d="M7.2 10h5.6M10 7.2v5.6" stroke-width="1.2"/>'),
  follow: wrap('<circle cx="10" cy="10" r="5.2"/><circle cx="10" cy="10" r="1.6" fill="currentColor" stroke="none"/><path d="M10 2.5v2.6M10 14.9v2.6M2.5 10h2.6M14.9 10h2.6"/>'),
  route: wrap('<circle cx="4.5" cy="14.5" r="1.8"/><circle cx="15.5" cy="5.5" r="1.8"/><path d="M6.2 13.6c3-1 1.6-4.6 4.6-5.4 1.4-.4 2.4-1 3.2-1.6" stroke-dasharray="1.6 2"/>'),
  sketch: wrap('<rect x="3" y="4.5" width="14" height="11" rx=".8"/><path d="M3.6 13.6l3.8-3.6 2.8 2.6 2.2-1.9 3.9 3.1"/><circle cx="12.9" cy="8" r="1.1"/>'),
  more: wrap('<circle cx="5" cy="5" r="1.6"/><circle cx="10" cy="5" r="1.6"/><circle cx="15" cy="5" r="1.6"/><circle cx="5" cy="10" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="15" cy="10" r="1.6"/><circle cx="5" cy="15" r="1.6"/><circle cx="10" cy="15" r="1.6"/><circle cx="15" cy="15" r="1.6"/>'),
  list: wrap('<path d="M7 5.5h9.5M7 10h9.5M7 14.5h9.5"/><circle cx="4" cy="5.5" r=".9" fill="currentColor" stroke="none"/><circle cx="4" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="4" cy="14.5" r=".9" fill="currentColor" stroke="none"/>'),
  timeline: wrap('<path d="M3 4v12M3 16h14"/><path d="M5.5 6.5h5M8 9.5h7M6 12.5h4" stroke-width="2.2"/>'),
  built: wrap('<path d="M10 4.2l6.3 11.3H3.7z"/><path d="M10 4.2l1.8 11.3"/>'),
  natural: wrap('<path d="M3 13l5-8 2.6 4 1.6-2.3L17 13"/><path d="M4.5 16.3c1.8-1.3 3.7-1.3 5.5 0s3.7 1.3 5.5 0"/>'),
  /** The GitHub mark (Octicons, MIT), filled rather than stroked like the rest. */
  github: '<svg viewBox="0 0 16 16" width="17" height="17" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>',
  ruin: wrap('<path d="M3.5 16.5h13M6 16.5V8.8M10 16.5v-6M14 16.5V10.2"/><path d="M4.5 8.8h3.2l1-1.1 1.6.9 1.3-.8"/>'),
  invention: wrap('<circle cx="10" cy="10" r="7"/><path d="M10 4.6l1.3 4.1 4.1 1.3-4.1 1.3L10 15.4l-1.3-4.1L4.6 10l4.1-1.3z"/>'),
  /** A work of its time: an open book. A modern study: a closed one on the shelf. */
  book: wrap('<path d="M10 5.6C8.2 4.3 5.8 3.9 3.5 4.2v10.4c2.3-.3 4.7.1 6.5 1.4 1.8-1.3 4.2-1.7 6.5-1.4V4.2c-2.3-.3-4.7.1-6.5 1.4z"/><path d="M10 5.6V16"/>'),
  study: wrap('<rect x="4.8" y="3.5" width="10.4" height="13" rx=".8"/><path d="M7.3 3.5v13M9.8 7h3.4M9.8 9.4h3.4"/>'),
  city: wrap('<path d="M3.5 16.5h13M5 16.5V9.2l2.6-2 2.4 2v7.3M10 16.5V6.4l3-2.4 2.5 2.4v10.1"/>'),
  link: wrap('<path d="M8.5 11.5l3-3M7 9.5l-1.8 1.8a2.5 2.5 0 0 0 3.5 3.5L10.5 13M13 10.5l1.8-1.8a2.5 2.5 0 0 0-3.5-3.5L9.5 7"/>'),
};

/** One small mark per journey kind. */
export const kindIcons: Record<string, string> = {
  sailor: wrap('<path d="M10 3v11M10 4l5 8h-5M10 6l-4 6h4M3.5 14.5h13l-2 2.5h-9z"/>'),
  fleet: wrap('<path d="M6 4v9M6 5l3.5 2.5L6 10M13 6v7M13 7l3 2-3 2M2.5 13.5h15l-1.8 2.8H4.3z"/>'),
  'merchant route': wrap('<path d="M9 3v11M9 3.5c4 2 5 6 5 10.5H9M3 14.5h14l-2 2.5H5z"/>'),
  merchant: wrap('<path d="M10 3.5v13M5 6h10M5 6l-2.2 5h4.4zM15 6l-2.2 5h4.4zM7 16.5h6"/>'),
  traveler: wrap('<circle cx="10.5" cy="4.2" r="1.6"/><path d="M10 6.5l-2 4 2.5 2-1 4.5M10.5 9.5l3 1.6M8 10.5l-2.6 1.5M10.5 12.5l2.5 4"/>'),
  pilgrim: wrap('<path d="M6 3v14"/><circle cx="12" cy="4.5" r="1.6"/><path d="M12 6.6v5l-2 5M12 11.6l2 5M9 8.5l3 .5 2.5-1"/>'),
  envoy: wrap('<path d="M6 3v14M6 4h8l-2 2.5 2 2.5H6"/>'),
  castaway: wrap('<path d="M4 11.8l11-2.2.6 2.4-10.2 2.2z"/><path d="M9 10.8V4.5l3.8 4.8"/><path d="M2.5 16.5c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0"/>'),
  'group voyage': wrap('<path d="M2.5 12.5c3 2 12 2 15 0M4 12.5l1.5 2.5h9l1.5-2.5M9 3c-3 2-4 6-3 9h6C11 8 10 5 9 3z"/>'),
  polar: wrap('<path d="M10 3v14M4 6.5l12 7M16 6.5l-12 7M8.4 3.8L10 5.4l1.6-1.6M8.4 16.2L10 14.6l1.6 1.6"/>'),
  mountaineering: wrap('<path d="M2.5 16.5L8 7l2.5 3.5L13 6l4.5 10.5z"/><path d="M8 7l1 3.2 1.5.3"/>'),
  'deep dive': wrap('<circle cx="10" cy="12" r="4"/><path d="M6 8.5h8M10 3v5M7.5 3h5"/><circle cx="10" cy="12" r="1.3"/>'),
  military: wrap('<path d="M4 4l9.5 9.5M16 4l-9.5 9.5M3.5 3.5l2 .2.2 2M16.5 3.5l-2 .2-.2 2M11.8 15.2l3.4-3.4M8.2 15.2l-3.4-3.4M14 14l2.5 2.5M6 14l-2.5 2.5"/>'),
  scientific: wrap('<path d="M10 3.5v2M10 5.5l-5 10.5M10 5.5l5 10.5M6.2 13.4a8 8 0 0 0 7.6 0"/><circle cx="10" cy="5.5" r="1.1" fill="currentColor" stroke="none"/><path d="M10 5.5l2.2 6.6"/>'),
  spaceflight: wrap('<path d="M10 2.5c2.5 2 3.5 5 3.2 8.5H6.8C6.5 7.5 7.5 4.5 10 2.5z"/><path d="M6.8 11l-2 3.5 3-.7M13.2 11l2 3.5-3-.7M9 14.5l1 3 1-3"/>'),
};

/** The map signs for natural wonders, one per kind. */
export const naturalIcons: Record<string, string> = {
  peak: wrap('<path d="M2.5 15.5l5.5-10 3 4.5 2-3 4.5 8.5"/><path d="M6.3 9.2l1.7 1 1.8-1.3"/>'),
  volcano: wrap('<path d="M2.5 16l5-8h5l5 8"/><path d="M10 6.5c-2-1.3 2-2.6 0-4.5"/>'),
  falls: wrap('<path d="M3.5 4.5h13M7 4.5v8M10 4.5v9M13 4.5v8"/><path d="M4 16.5c2-.8 4 .8 6 0s4 .8 6 0"/>'),
  gorge: wrap('<path d="M2 5h3.5l1 4h2l1.3 7M18 5h-3.5l-1 4h-2l-1.3 7"/>'),
  rock: wrap('<path d="M3.5 14c.4-6.5 12.6-6.5 13 0z"/><path d="M2 16.5h16"/>'),
  pool: wrap('<ellipse cx="10" cy="10" rx="7.5" ry="5"/><path d="M5.5 9.3c1.5-.9 3 .9 4.5 0s3 .9 4.5 0"/>'),
  water: wrap('<path d="M3 8c2.3-1.2 4.7 1.2 7 0s4.7 1.2 7 0M3 12c2.3-1.2 4.7 1.2 7 0s4.7 1.2 7 0"/>'),
};

/** One mark per invention category. */
export const inventionIcons: Record<string, string> = {
  navigation: icons.compass,
  measurement: wrap('<path d="M4 16V4a12 12 0 0 1 12 12z"/><path d="M4 16l9-9M6.6 9.8a6 6 0 0 1 3.6 3.6"/>'),
  mapping: wrap('<path d="M3 5.5l4.5-2 5 2 4.5-2v11l-4.5 2-5-2-4.5 2z"/><path d="M7.5 3.5v11M12.5 5.5v11"/>'),
  communication: wrap('<path d="M10 5.5C8 4 5.5 3.8 3 4.3v10.4c2.5-.5 5-.3 7 1.2 2-1.5 4.5-1.7 7-1.2V4.3C14.5 3.8 12 4 10 5.5zM10 5.5v10.4"/>'),
  transport: wrap('<circle cx="10" cy="7.5" r="4.6"/><path d="M6.6 10.6L9 16.5h2l2.4-5.9M8.6 16.5h2.8"/>'),
  imaging: wrap('<path d="M2.5 10s3-5 7.5-5 7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5z"/><circle cx="10" cy="10" r="2.4"/>'),
};

/** Plants and animals: a sprig and a paw print. */
export const livingIcons: Record<string, string> = {
  plant: wrap('<path d="M10 17.5V8"/><path d="M10 11.5c-4.2.4-6.3-2.2-6-6 3.8-.3 6.2 2 6 6zM10 9c.1-3.6 2.3-5.8 6-5.6.2 3.7-2.3 5.9-6 5.6z"/>'),
  animal: wrap('<ellipse cx="10" cy="13.4" rx="3.6" ry="3"/><ellipse cx="5" cy="9" rx="1.5" ry="1.9"/><ellipse cx="8.2" cy="5.6" rx="1.5" ry="1.9"/><ellipse cx="11.8" cy="5.6" rx="1.5" ry="1.9"/><ellipse cx="15" cy="9" rx="1.5" ry="1.9"/>'),
};

/** The home seal for each viewpoint, used on the map and in the switcher. */
export function sealSvg(id: string, color: string, size = 18) {
  const s = (body: string) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
  switch (id) {
    case 'china':
      return s(
        `<rect x="2.5" y="2.5" width="19" height="19" rx="2.2" fill="${color}"/><rect x="5" y="5" width="14" height="14" rx="1" fill="none" stroke="#f6f0e2" stroke-width="1"/><path d="M12 6.5v11M8 9.5h8v4H8z" fill="none" stroke="#f6f0e2" stroke-width="1.6"/>`,
      );
    case 'islam':
      return s(
        `<g fill="${color}"><rect x="5" y="5" width="14" height="14" rx=".6"/><rect x="5" y="5" width="14" height="14" rx=".6" transform="rotate(45 12 12)"/></g><circle cx="12" cy="12" r="3.6" fill="none" stroke="#f6f0e2" stroke-width="1.3"/>`,
      );
    case 'polynesia':
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><path d="M8.5 18.5C6 13 8 7.5 12.5 5c-1.5 3.5-1 7 2.5 9.5-2 0-4 1.5-6.5 4z" fill="#f6f0e2"/>`,
      );
    case 'humanity':
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><path d="M10.2 17.8c-1.6-.2-2.3-1.6-2-3.4.4-2.4 1-4.6 2.7-4.4 1.6.2 1.9 2 1.5 4.2-.4 2.2-.8 3.8-2.2 3.6z" fill="#f6f0e2"/><g fill="#f6f0e2"><circle cx="10.4" cy="7.6" r="1"/><circle cx="12.4" cy="7.2" r=".9"/><circle cx="14" cy="8.1" r=".8"/><circle cx="14.9" cy="9.6" r=".7"/><circle cx="8.7" cy="8.5" r=".8"/></g>`,
      );
    case 'india':
      // A dharma wheel.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><circle cx="12" cy="12" r="6.6" fill="none" stroke="#f6f0e2" stroke-width="1.3"/><circle cx="12" cy="12" r="1.6" fill="#f6f0e2"/><g stroke="#f6f0e2" stroke-width="1">${[0, 1, 2, 3, 4, 5, 6, 7].map(k => { const a = (k * Math.PI) / 4; return `<line x1="${12 + Math.cos(a) * 1.6}" y1="${12 + Math.sin(a) * 1.6}" x2="${12 + Math.cos(a) * 6.6}" y2="${12 + Math.sin(a) * 6.6}"/>`; }).join('')}</g>`,
      );
    case 'japan':
      // A five-petalled blossom, like a family crest (mon).
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><g fill="#f6f0e2">${[0, 1, 2, 3, 4].map(k => `<ellipse cx="12" cy="7.4" rx="2.5" ry="3.4" transform="rotate(${k * 72} 12 12)"/>`).join('')}</g><circle cx="12" cy="12" r="1.5" fill="${color}"/>`,
      );
    case 'sahel':
      // The mud-brick towers of a Sahel mosque.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><path d="M6 17.5V11l1.2-1.6L8.4 11v-1.5l1.4-2.2 1.4 2.2V11h1.6V8.4l1.6-2.6 1.6 2.6V11l1.2-1.6L18 11v6.5z" fill="#f6f0e2"/><path d="M8 12.2v1.6M11.2 12.2v1.6M14.4 12.2v1.6M10.6 17.5v-2.4h2.8v2.4" stroke="${color}" stroke-width=".9" fill="none"/>`,
      );
    case 'mexica':
      // A stepped temple-pyramid with its twin shrines.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><path d="M5.5 17.5h13l-1.5-2.6h-10zM7.2 14.9h9.6L15.6 12.4H8.4zM8.6 12.4h6.8L14.4 10H9.6z" fill="#f6f0e2"/><path d="M9.8 10V7.6h1.8V10M12.4 10V7.6h1.8V10" fill="#f6f0e2"/>`,
      );
    case 'persia':
      // A winged disc.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><circle cx="12" cy="10.6" r="2.4" fill="#f6f0e2"/><path d="M4.6 10.4c2.6.2 4.4.9 5.2 1.6M19.4 10.4c-2.6.2-4.4.9-5.2 1.6M5.4 12.4c2.2.2 3.8.8 4.6 1.4M18.6 12.4c-2.2.2-3.8.8-4.6 1.4M10.6 13.4l1.4 4 1.4-4" stroke="#f6f0e2" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
      );
    case 'egypt':
      // A pyramid under the sun.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><circle cx="12" cy="7" r="1.8" fill="#f6f0e2"/><path d="M5.5 17.5L12 9.6l6.5 7.9z" fill="#f6f0e2"/><path d="M12 9.6l1.4 7.9" stroke="${color}" stroke-width=".8"/>`,
      );
    case 'arabia':
      // An incense burner with rising smoke.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><path d="M8.4 12.2h7.2v3.4H8.4zM9.6 15.6h4.8l.8 2H8.8z" fill="#f6f0e2"/><path d="M11 11c-1-1.4.6-2.2 0-3.6M13 11c-.8-1.6.8-2.4.2-4" stroke="#f6f0e2" stroke-width="1" fill="none" stroke-linecap="round"/>`,
      );
    case 'maghreb':
      // A horseshoe arch.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><path d="M7.4 18V11a4.6 4.6 0 0 1 9.2 0v7h-2.2v-6.6a2.4 2.4 0 0 0-4.8 0V18z" fill="#f6f0e2"/><path d="M6 18.2h12" stroke="#f6f0e2" stroke-width="1.2"/>`,
      );
    case 'greece':
      // An Ionic column.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><g fill="#f6f0e2"><rect x="6.8" y="6" width="10.4" height="1.3" rx=".3"/><circle cx="7.6" cy="8.6" r="1.3"/><circle cx="16.4" cy="8.6" r="1.3"/><rect x="7.6" y="7.3" width="8.8" height="1.3"/><rect x="9.2" y="8.6" width="5.6" height="8"/><rect x="8" y="16.6" width="8" height="1.4" rx=".3"/></g><path d="M10.6 9.4v6.6M12 9.4v6.6M13.4 9.4v6.6" stroke="${color}" stroke-width=".6"/><circle cx="7.6" cy="8.6" r=".45" fill="${color}"/><circle cx="16.4" cy="8.6" r=".45" fill="${color}"/>`,
      );
    case 'rome':
      // A laurel wreath.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><g fill="#f6f0e2">${[0, 1, 2, 3, 4, 5].map(k => { const a = ((115 + k * 25) * Math.PI) / 180; const x = 12 + Math.cos(a) * 6; const y = 12 + Math.sin(a) * 6; const r = (115 + k * 25) + 90; return `<ellipse cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" rx=".95" ry="2" transform="rotate(${r - 35} ${x.toFixed(2)} ${y.toFixed(2)})"/><ellipse cx="${(24 - x).toFixed(2)}" cy="${y.toFixed(2)}" rx=".95" ry="2" transform="rotate(${-(r - 35)} ${(24 - x).toFixed(2)} ${y.toFixed(2)})"/>`; }).join('')}</g><path d="M10.2 18.2l1.8-1 1.8 1" stroke="#f6f0e2" stroke-width="1" fill="none" stroke-linecap="round"/>`,
      );
    case 'iberia':
      // The castle of Castile.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><path d="M6.6 17.6V10.4h1.7V8.6h1.6v1.8h1.3V7.2h1.6v3.2h1.3V8.6h1.6v1.8h1.7v7.2z" fill="#f6f0e2"/><path d="M11 17.6v-3a1 1 0 0 1 2 0v3M8.6 12.4h1M14.4 12.4h1" stroke="${color}" stroke-width=".9" fill="none"/>`,
      );
    case 'france':
      // A fleur-de-lis.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><g fill="#f6f0e2"><path d="M12 4.8c1.7 2.1 1.9 4.4 0 6.9-1.9-2.5-1.7-4.8 0-6.9z"/><path d="M11.3 12.3C9.5 9.4 6.3 9.9 6.5 12.5c.2 1.7 2.1 2.1 2.9 1-1 .2-1.8-.6-1.4-1.4.6-1.1 2.3-.6 3.3.2z"/><path d="M12.7 12.3c1.8-2.9 5-2.4 4.8.2-.2 1.7-2.1 2.1-2.9 1 1 .2 1.8-.6 1.4-1.4-.6-1.1-2.3-.6-3.3.2z"/><rect x="8.8" y="12.3" width="6.4" height="1.3" rx=".3"/><path d="M11.2 13.6l-.7 3.8h3l-.7-3.8z"/></g>`,
      );
    case 'britain':
      // A Tudor rose.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><g fill="#f6f0e2">${[0, 1, 2, 3, 4].map(k => { const a = ((-90 + k * 72) * Math.PI) / 180; return `<circle cx="${(12 + Math.cos(a) * 3.6).toFixed(2)}" cy="${(12 + Math.sin(a) * 3.6).toFixed(2)}" r="2.7"/>`; }).join('')}</g><circle cx="12" cy="12" r="2.9" fill="${color}"/><circle cx="12" cy="12" r="1.5" fill="#f6f0e2"/>`,
      );
    case 'germany':
      // A Hanseatic cog.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><g fill="#f6f0e2"><path d="M5.2 13.4h13.6l-1.9 3.8H7.1z"/><rect x="8.6" y="5.6" width="6.8" height="6.4" rx=".4"/><path d="M15.6 13.4v-2h2.6l.6 2z"/></g><path d="M12 5v8.4" stroke="#f6f0e2" stroke-width=".9"/><path d="M8.6 8.8h6.8" stroke="${color}" stroke-width=".7"/>`,
      );
    case 'norse':
      // A longship under sail.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><g fill="#f6f0e2"><path d="M4.4 13q7.6 5.4 15.2 0l-.9 1.6q-6.7 3.6-13.4 0z"/><rect x="8.6" y="5.6" width="6.8" height="6" rx=".3"/></g><path d="M8.6 7.6h6.8M8.6 9.6h6.8" stroke="${color}" stroke-width=".8"/><path d="M12 5v8.6M4.4 13c-.7-1.5-.3-3 .9-3.5.7-.3 1.2.4.8.9M19.6 13c.5-1.2.4-2.4-.4-3" stroke="#f6f0e2" stroke-width="1" fill="none" stroke-linecap="round"/>`,
      );
    case 'russia':
      // An onion dome.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><g fill="#f6f0e2"><path d="M12 5.6c.6 1.6 3.7 3 3.7 5.9 0 1.4-1.3 2.2-3.7 2.2s-3.7-.8-3.7-2.2c0-2.9 3.1-4.3 3.7-5.9z"/><rect x="9.3" y="13.2" width="5.4" height="4.4"/><rect x="7.6" y="17.4" width="8.8" height="1" rx=".3"/></g><path d="M12 3.4v2.4M11 4.3h2M11 17.6v-2.2a1 1 0 0 1 2 0v2.2" stroke="#f6f0e2" stroke-width=".8" fill="none"/><path d="M11 17.6v-2.2a1 1 0 0 1 2 0v2.2" stroke="${color}" stroke-width=".8" fill="none"/>`,
      );
    case 'inuit':
      // An inukshuk, the stone figure that marks the way.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><g fill="#f6f0e2"><rect x="10.2" y="5.2" width="3.6" height="2.8" rx=".5"/><rect x="6.4" y="8.6" width="11.2" height="2.2" rx=".5"/><rect x="9.4" y="11.4" width="5.2" height="2.6" rx=".5"/><rect x="8.2" y="14.6" width="2.6" height="3.8" rx=".5"/><rect x="13.2" y="14.6" width="2.6" height="3.8" rx=".5"/></g>`,
      );
    case 'zimbabwe':
      // The conical tower of Great Zimbabwe.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><path d="M8.6 18V9.6q3.4-3.2 6.8 0V18z" fill="#f6f0e2"/><path d="M8.6 11.6h6.8M8.6 13.6h6.8M8.6 15.6h6.8" stroke="${color}" stroke-width=".7"/><path d="M6 18.2h12" stroke="#f6f0e2" stroke-width="1.2"/>`,
      );
    case 'ethiopia':
      // An Aksum stele, carved with doors and windows.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><path d="M9.4 18.4V7.2Q12 3.6 14.6 7.2v11.2z" fill="#f6f0e2"/><path d="M10.6 9h2.8M10.6 11.6h2.8M10.6 14.2h2.8M11.2 18.4v-2h1.6v2" stroke="${color}" stroke-width=".8" fill="none"/><path d="M7 18.6h10" stroke="#f6f0e2" stroke-width="1.2"/>`,
      );
    case 'swahili':
      // A dhow under its lateen sail.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><g fill="#f6f0e2"><path d="M5 14.2h14l-2 3H7.4z"/><path d="M12.6 4.8L18 13.4H8.2z"/></g><path d="M12.4 4.6l-1 9.6M6.4 7.4l7.8-3" stroke="#f6f0e2" stroke-width=".9" stroke-linecap="round"/>`,
      );
    case 'nusantara':
      // A stupa of Borobudur.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><g fill="#f6f0e2"><path d="M12 4.6v2.4"/><rect x="11.3" y="5" width="1.4" height="3" rx=".4"/><path d="M7.6 13.4q0-5.4 4.4-5.6 4.4.2 4.4 5.6z"/><rect x="6.6" y="13.6" width="10.8" height="1.6" rx=".3"/><rect x="5.4" y="15.6" width="13.2" height="1.8" rx=".3"/></g><path d="M9.6 11.2h.01M12 10.6h.01M14.4 11.2h.01" stroke="${color}" stroke-width="1.1" stroke-linecap="round"/>`,
      );
    case 'inca':
      // Inti, the sun.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><g fill="#f6f0e2">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(k => `<path d="M12 3.2l1 2.6h-2z" transform="rotate(${k * 30} 12 12)"/>`).join('')}</g><circle cx="12" cy="12" r="4.4" fill="#f6f0e2"/><path d="M10.4 11.4h.1M13.5 11.4h.1M10.6 13.4q1.4 1 2.8 0" stroke="${color}" stroke-width="1" stroke-linecap="round" fill="none"/>`,
      );
    case 'korea':
      // Cheomseongdae, Silla's star-watching tower.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><g fill="#f6f0e2"><rect x="9.2" y="5.4" width="5.6" height="1.6" rx=".2"/><path d="M9.9 7.4C9.9 11 8.3 14.4 8.3 17.2h7.4c0-2.8-1.6-6.2-1.6-9.8z"/><rect x="6.8" y="17.2" width="10.4" height="1.4" rx=".3"/></g><path d="M9.7 9.6h4.6M9.2 13.6h5.6M8.7 15.6h6.6" stroke="${color}" stroke-width=".5"/><rect x="11.1" y="10.8" width="1.8" height="1.8" fill="${color}"/>`,
      );
    case 'steppe':
      // A ger, the felt tent of the herders.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><g fill="#f6f0e2"><path d="M5.2 12.4Q8 9 12 7.8q4 1.2 6.8 4.6z"/><rect x="6" y="12.9" width="12" height="4.6" rx=".3"/><rect x="10.8" y="6.6" width="2.4" height="1" rx=".3"/></g><rect x="10.9" y="14.1" width="2.2" height="3.4" fill="${color}"/><path d="M4.8 18.1h14.4" stroke="#f6f0e2" stroke-width="1"/>`,
      );
    case 'maya':
      // Thirteen in bar-and-dot numerals.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><g fill="#f6f0e2"><circle cx="8.6" cy="8" r="1.3"/><circle cx="12" cy="8" r="1.3"/><circle cx="15.4" cy="8" r="1.3"/><rect x="6.2" y="10.6" width="11.6" height="2.4" rx="1.2"/><rect x="6.2" y="14.4" width="11.6" height="2.4" rx="1.2"/></g>`,
      );
    case 'kongo':
      // The dikenga, Kongo's cosmogram: the crossroads of the living and the dead, and the sun's four moments.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><circle cx="12" cy="12" r="5.4" fill="none" stroke="#f6f0e2" stroke-width="1"/><path d="M12 5v14M5 12h14" stroke="#f6f0e2" stroke-width="1.1"/><g fill="#f6f0e2"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="19" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></g>`,
      );
    case 'mississippian':
      // The hand and eye, carved on Mississippian shell and stone.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><g fill="#f6f0e2"><rect x="8.4" y="10.4" width="7.2" height="8" rx="2.4"/><rect x="8.5" y="6.6" width="1.6" height="5" rx=".8"/><rect x="10.3" y="5.4" width="1.6" height="6" rx=".8"/><rect x="12.1" y="5.6" width="1.6" height="6" rx=".8"/><rect x="13.9" y="6.8" width="1.6" height="5" rx=".8"/><rect x="6.6" y="11" width="1.6" height="4.6" rx=".8" transform="rotate(-32 7.4 15.6)"/></g><path d="M9.6 14.6q2.4-2 4.8 0q-2.4 2-4.8 0z" fill="${color}"/><circle cx="12" cy="14.6" r=".8" fill="#f6f0e2"/>`,
      );
    case 'haudenosaunee':
      // The Hiawatha belt: the five nations joined, the tree of peace at the Onondaga heart.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><path d="M3.4 12h17.2" stroke="#f6f0e2" stroke-width="1"/><g fill="none" stroke="#f6f0e2" stroke-width="1"><rect x="3.4" y="10.8" width="2.4" height="2.4"/><rect x="6.6" y="10.8" width="2.4" height="2.4"/><rect x="15" y="10.8" width="2.4" height="2.4"/><rect x="18.2" y="10.8" width="2.4" height="2.4"/></g><path d="M12 5.6l1.8 2.8h-1l1.6 2.4h-1l1.6 2.6H9l1.6-2.6h-1l1.6-2.4h-1z" fill="#f6f0e2"/><rect x="11.4" y="13.4" width="1.2" height="2.6" fill="#f6f0e2"/>`,
      );
    case 'turks':
      // A tulip, the flower of the Seljuk and Ottoman gardens.
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><g fill="#f6f0e2"><path d="M8.3 6.8l2 2.2L12 5.4l1.7 3.6 2-2.2q.7 5.4-3.7 6.4-4.4-1-3.7-6.4z"/><rect x="11.5" y="12.6" width="1" height="6.2" rx=".4"/><path d="M11.8 18.2c-2.6-.2-4.4-2-4.8-4.4 2.2.4 4 2 4.8 4.4z"/><path d="M12.2 16.8c1.8-.4 3.4-2 3.8-4-2 .4-3.4 1.8-3.8 4z"/></g>`,
      );
    default:
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><circle cx="12" cy="12" r="7.4" fill="none" stroke="#f6f0e2" stroke-width=".9"/><path d="M12 5l1.6 5.4L19 12l-5.4 1.6L12 19l-1.6-5.4L5 12l5.4-1.6z" fill="#f6f0e2"/>`,
      );
  }
}

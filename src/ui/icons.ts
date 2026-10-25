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
  info: wrap('<circle cx="10" cy="10" r="7"/><path d="M10 9v4.6"/><circle cx="10" cy="6.4" r=".4" fill="currentColor"/>'),
  compare: wrap('<circle cx="7.6" cy="10" r="4.6"/><circle cx="12.4" cy="10" r="4.6"/>'),
  compass: wrap(
    '<circle cx="10" cy="10" r="7.2"/><path d="M10 3.6l1.6 6.4L10 16.4 8.4 10z" fill="currentColor" stroke="none" opacity=".85"/><path d="M3.6 10h1.6M14.8 10h1.6"/>',
  ),
  speed: wrap('<path d="M4 14a6 6 0 1 1 12 0"/><path d="M10 14l3-4"/>'),
  arrow: wrap('<path d="M4 10h11M11 6l4 4-4 4"/>'),
  follow: wrap('<circle cx="10" cy="10" r="5.2"/><circle cx="10" cy="10" r="1.6" fill="currentColor" stroke="none"/><path d="M10 2.5v2.6M10 14.9v2.6M2.5 10h2.6M14.9 10h2.6"/>'),
  route: wrap('<circle cx="4.5" cy="14.5" r="1.8"/><circle cx="15.5" cy="5.5" r="1.8"/><path d="M6.2 13.6c3-1 1.6-4.6 4.6-5.4 1.4-.4 2.4-1 3.2-1.6" stroke-dasharray="1.6 2"/>'),
  invention: wrap('<circle cx="10" cy="10" r="7"/><path d="M10 4.6l1.3 4.1 4.1 1.3-4.1 1.3L10 15.4l-1.3-4.1L4.6 10l4.1-1.3z"/>'),
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
  'group voyage': wrap('<path d="M2.5 12.5c3 2 12 2 15 0M4 12.5l1.5 2.5h9l1.5-2.5M9 3c-3 2-4 6-3 9h6C11 8 10 5 9 3z"/>'),
  polar: wrap('<path d="M10 3v14M4 6.5l12 7M16 6.5l-12 7M8.4 3.8L10 5.4l1.6-1.6M8.4 16.2L10 14.6l1.6 1.6"/>'),
  mountaineering: wrap('<path d="M2.5 16.5L8 7l2.5 3.5L13 6l4.5 10.5z"/><path d="M8 7l1 3.2 1.5.3"/>'),
  'deep dive': wrap('<circle cx="10" cy="12" r="4"/><path d="M6 8.5h8M10 3v5M7.5 3h5"/><circle cx="10" cy="12" r="1.3"/>'),
  military: wrap('<path d="M4 4l9.5 9.5M16 4l-9.5 9.5M3.5 3.5l2 .2.2 2M16.5 3.5l-2 .2-.2 2M11.8 15.2l3.4-3.4M8.2 15.2l-3.4-3.4M14 14l2.5 2.5M6 14l-2.5 2.5"/>'),
  scientific: wrap('<path d="M10 3.5v2M10 5.5l-5 10.5M10 5.5l5 10.5M6.2 13.4a8 8 0 0 0 7.6 0"/><circle cx="10" cy="5.5" r="1.1" fill="currentColor" stroke="none"/><path d="M10 5.5l2.2 6.6"/>'),
  spaceflight: wrap('<path d="M10 2.5c2.5 2 3.5 5 3.2 8.5H6.8C6.5 7.5 7.5 4.5 10 2.5z"/><path d="M6.8 11l-2 3.5 3-.7M13.2 11l2 3.5-3-.7M9 14.5l1 3 1-3"/>'),
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
    default:
      return s(
        `<circle cx="12" cy="12" r="10" fill="${color}"/><circle cx="12" cy="12" r="7.4" fill="none" stroke="#f6f0e2" stroke-width=".9"/><path d="M12 5l1.6 5.4L19 12l-5.4 1.6L12 19l-1.6-5.4L5 12l5.4-1.6z" fill="#f6f0e2"/>`,
      );
  }
}

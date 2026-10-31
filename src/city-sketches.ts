interface CitySketch {
  id: string;
  from?: number;
  to?: number;
  companionOf?: string;
}

/** Companion views share their main sketch's era; they are not additional eras. */
export function citySketchPages<T extends CitySketch>(items: T[], current: T): T[] {
  const era = current.companionOf ?? current.id;
  return items.filter(x => x.id === era || x.companionOf === era);
}

/** Retain a chosen view while its era is active, and reset when the year leaves it. */
export function citySceneAt<T extends CitySketch>(items: T[], year: number, selected: T | null = null): T | null {
  const era = items.findLast(x => !x.companionOf && year >= (x.from ?? -Infinity) && year < (x.to === undefined ? Infinity : x.to + 1));
  if (!era) return null;
  return selected && citySketchPages(items, era).includes(selected) ? selected : era;
}

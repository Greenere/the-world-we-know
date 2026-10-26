/** First authored page at the latest illustrated stop; retain a manual page only at that stop. */
export function journeySceneAt<T extends {stop?: number}>(items: T[], progress: number, selected: T | null = null): T | null {
  const stop = Math.floor(progress + 1e-6);
  let first = items[0] ?? null;
  for (const item of items) {
    if ((item.stop ?? 0) <= stop && (!first || (item.stop ?? 0) > (first.stop ?? 0))) first = item;
  }
  return selected && items.includes(selected) && first && selected.stop === first.stop ? selected : first;
}

/** Turn a page within a stop, without moving the traveller to a neighbouring stop. */
export function journeyPageStep<T extends {stop?: number}>(items: T[], current: T, delta: -1 | 1): T | null {
  const pages = items.filter(item => item.stop === current.stop);
  const index = pages.indexOf(current);
  return index < 0 ? null : pages[index + delta] ?? null;
}

/** A stop's pages share the journey clock. Pausing never consumes reading time. */
export class JourneySketchPlayback<T extends {stop?: number; caption?: string}> {
  private stop = -1;
  private page: T | null = null;
  private elapsed = 0;
  private waiting = 0;
  private done = false;

  visit(progress: number) {
    const stop = Math.floor(progress + 1e-6);
    if (stop !== this.stop) {
      this.stop = stop;
      this.reset();
    }
  }

  reset(page: T | null = null) {
    this.page = page;
    this.elapsed = this.waiting = 0;
    this.done = false;
  }

  tick(items: T[], progress: number, dt: number, speed: number, ready: boolean): {page: T | null; hold: boolean} {
    this.visit(progress);
    // Scrubbing into a leg must not hold the traveller halfway down the road.
    if (Math.abs(progress - this.stop) > 1e-6) return {page: this.page, hold: false};
    const pages = items.filter(p => p.stop === this.stop);
    if (!pages.length || this.done) return {page: this.page, hold: false};
    if (!this.page || !pages.includes(this.page)) {
      this.page = pages[0];
      return {page: this.page, hold: true};
    }
    // Give the decoded image its own reading time; a failed request cannot stall the journey forever.
    if (!ready && this.waiting < 12) {
      this.waiting += dt;
      return {page: this.page, hold: true};
    }
    const words = this.page.caption?.split(/\s+/).length ?? 0;
    const seconds = Math.max(4, Math.min(14, Math.max(8, words / 3)) / Math.max(0.25, speed));
    this.elapsed += dt;
    if (this.elapsed < seconds) return {page: this.page, hold: true};
    const next = pages[pages.indexOf(this.page) + 1];
    if (next) {
      this.reset(next);
      return {page: next, hold: true};
    }
    this.done = true;
    return {page: this.page, hold: false};
  }
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JourneySketchPlayback, journeyPageStep, journeySceneAt} from '../src/journey-scenes.ts';
const pages = [{id: 'start', stop: 0}, {id: 'city', stop: 3}, {id: 'objects', stop: 3}, {id: 'next', stop: 6}];
test('playback selects the first page at each illustrated stop and spans gaps', () => {
  assert.equal(journeySceneAt(pages, 0), pages[0]);
  assert.equal(journeySceneAt(pages, 3), pages[1]);
  assert.equal(journeySceneAt(pages, 5.8), pages[1]);
  assert.equal(journeySceneAt(pages, 6), pages[3]);
});
test('manual browsing survives ticks at the same illustrated stop', () => {
  assert.equal(journeySceneAt(pages, 3, pages[2]), pages[2]);
  assert.equal(journeySceneAt(pages, 5.9, pages[2]), pages[2]);
});
test('moving to another illustrated stop clears the manual choice in either direction', () => {
  assert.equal(journeySceneAt(pages, 6, pages[2]), pages[3]);
  assert.equal(journeySceneAt(pages, 0, pages[2]), pages[0]);
});
test('single-page journeys and empty sketchbooks remain supported', () => {
  assert.equal(journeySceneAt([], 0), null);
  assert.equal(journeySceneAt([pages[0]], 99), pages[0]);
  assert.equal(journeySceneAt(pages, 3, {stop:3}), pages[1]);
});

test('page controls browse companion sketches but never cross a stop boundary', () => {
  assert.equal(journeyPageStep(pages, pages[1], 1), pages[2]);
  assert.equal(journeyPageStep(pages, pages[2], -1), pages[1]);
  assert.equal(journeyPageStep(pages, pages[1], -1), null);
  assert.equal(journeyPageStep(pages, pages[2], 1), null);
  assert.equal(journeyPageStep(pages, pages[0], 1), null);
  assert.equal(journeyPageStep(pages, {stop: 3}, 1), null);
});

function tickFor(clock, items, progress, seconds, speed = 1, ready = true) {
  let result;
  for (let n = 0; n < seconds * 10; n++) result = clock.tick(items, progress, .1, speed, ready);
  return result;
}

test('all companion pages get reading time before departure, including the final stop', () => {
  const clock = new JourneySketchPlayback();
  assert.deepEqual(clock.tick(pages, 3, 0, 1, true), {page: pages[1], hold: true});
  assert.equal(tickFor(clock, pages, 3, 7).page, pages[1]);
  assert.deepEqual(tickFor(clock, pages, 3, 2), {page: pages[2], hold: true});
  assert.deepEqual(tickFor(clock, pages, 3, 9), {page: pages[2], hold: false});
  assert.equal(clock.tick(pages, 6, 0, 1, true).hold, true);
  assert.equal(tickFor(clock, pages, 6, 9).hold, false);
});

test('loading time does not consume reading time, but failed loads eventually release travel', () => {
  const clock = new JourneySketchPlayback();
  clock.tick(pages, 0, 0, 1, false);
  assert.equal(tickFor(clock, pages, 0, 5, 1, false).hold, true);
  assert.equal(tickFor(clock, pages, 0, 7).hold, true);
  assert.equal(tickFor(clock, pages, 0, 2).hold, false);
  clock.reset();
  clock.tick(pages, 0, 0, 1, false);
  assert.equal(tickFor(clock, pages, 0, 22, 1, false).hold, false);
});

test('pause/resume preserves the current page and remaining reading time', () => {
  const clock = new JourneySketchPlayback();
  clock.tick(pages, 3, 0, 1, true);
  tickFor(clock, pages, 3, 4);
  // Paused frames do not call tick; ordinary UI updates can still observe progress.
  for (let i = 0; i < 100; i++) clock.visit(3);
  assert.equal(tickFor(clock, pages, 3, 3).page, pages[1]);
  assert.equal(tickFor(clock, pages, 3, 2).page, pages[2]);
});

test('manual page choice, scrubbing and replay reset the clock without stranding a moving traveller', () => {
  const clock = new JourneySketchPlayback();
  clock.visit(3);
  clock.reset(pages[2]);
  assert.equal(tickFor(clock, pages, 3, 7).page, pages[2]);
  assert.equal(tickFor(clock, pages, 3, 2).hold, false);
  assert.equal(clock.tick(pages, 4.5, 1, 1, true).hold, false);
  assert.equal(clock.tick(pages, 3, 0, 1, true).page, pages[1]);
  assert.equal(clock.tick(pages, 0, 0, 1, true).page, pages[0]);
  assert.equal(clock.tick(pages, 1, 0, 1, true).hold, false);
  assert.equal(clock.tick([], 0, 0, 1, true).hold, false);
});

test('speed changes affect page time while retaining a four-second minimum', () => {
  const clock = new JourneySketchPlayback();
  clock.tick(pages, 0, 0, 8, true);
  assert.equal(tickFor(clock, pages, 0, 3, 8).hold, true);
  assert.equal(tickFor(clock, pages, 0, 2, 8).hold, false);
  clock.reset();
  clock.tick(pages, 0, 0, .5, true);
  assert.equal(tickFor(clock, pages, 0, 9, .5).hold, true);
  assert.equal(tickFor(clock, pages, 0, 8, .5).hold, false);
});

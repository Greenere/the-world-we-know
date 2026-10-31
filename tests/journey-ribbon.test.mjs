import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ribbonLayout, ribbonProgress, ribbonX, ribbonXAtYear} from '../src/journey-ribbon.ts';

// Out over two years, six years at court, then home: the stay folds, the travel keeps its room.
const t = [1271, 1271.5, 1272, 1272.5, 1273, 1279, 1279.5, 1280];

test('a long stay with no stops folds into a break that says how long', () => {
  const r = ribbonLayout(t, 1000, false);
  assert.equal(r.folds.length, 1);
  assert.equal(r.folds[0].after, 4);
  assert.equal(r.folds[0].years, 6);
  assert.ok(r.folds[0].x1 - r.folds[0].x0 <= 72);
  assert.equal(r.xs.length, t.length);
  assert.equal(r.xs[0], 0);
  assert.ok(Math.abs(r.xs.at(-1) - 1000) < 1e-9);
});

test('positions only ever move forward', () => {
  const r = ribbonLayout([5, 5, 5.2, 9, 9, 30], 800, true);
  for (let i = 1; i < r.xs.length; i++) assert.ok(r.xs[i] >= r.xs[i - 1]);
});

test('the news reaching home is one more step at the right edge', () => {
  const r = ribbonLayout(t, 1000, true);
  assert.equal(r.xs.length, t.length + 1);
  assert.equal(r.xs.at(-1), 1000);
  assert.ok(r.home && r.home.x0 < 1000);
});

test('a journey that happens all at once spaces its stops evenly', () => {
  const r = ribbonLayout([1961.3, 1961.3, 1961.3], 600, false);
  assert.deepEqual(r.xs, [0, 300, 600]);
  assert.equal(r.folds.length, 0);
});

test('even, slow journeys are not folded', () => {
  // Fifty years between every stop: that is this journey's pace, not a pause in it.
  const r = ribbonLayout([1000, 1050, 1100, 1150, 1200], 1000, false);
  assert.equal(r.folds.length, 0);
});

test('progress and position convert both ways', () => {
  const r = ribbonLayout(t, 1000, true);
  for (const p of [0, 0.25, 3, 4.5, 6.75, 8]) assert.ok(Math.abs(ribbonProgress(r, ribbonX(r, p)) - p) < 1e-9);
  assert.equal(ribbonX(r, -3), 0);
  assert.equal(ribbonX(r, 99), 1000);
});

test('a year inside a fold lands inside the fold', () => {
  const r = ribbonLayout(t, 1000, false);
  const x = ribbonXAtYear(r, t, null, 1275);
  assert.ok(x > r.folds[0].x0 && x < r.folds[0].x1);
  assert.equal(ribbonXAtYear(r, t, null, 1200), null);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {citySceneAt, citySketchPages} from '../src/city-sketches.ts';
const old = {id: 'living', from: 100, to: 199};
const ruin = {id: 'ruins', from: 200, to: 299};
const wide = {id: 'panorama', companionOf: 'ruins', from: 200, to: 299};
const later = {id: 'restored', from: 400};
const items = [old, ruin, wide, later];

test('city eras keep their original default image when companion views are added', () => {
  assert.equal(citySceneAt(items, 250), ruin);
  assert.deepEqual(citySketchPages(items, wide), [ruin, wide]);
  assert.deepEqual(citySketchPages(items, old), [old]);
});
test('a selected panorama persists across years within its era, but not into another era or a gap', () => {
  assert.equal(citySceneAt(items, 200, wide), wide);
  assert.equal(citySceneAt(items, 299.9, wide), wide);
  assert.equal(citySceneAt(items, 300, wide), null);
  assert.equal(citySceneAt(items, 500, wide), later);
  assert.equal(citySceneAt(items, 150, wide), old);
  assert.equal(citySceneAt(items, 250, {...wide}), ruin);
});
test('existing single-view eras retain inclusive year boundaries and no-image periods', () => {
  assert.equal(citySceneAt([old, ruin], 99), null);
  assert.equal(citySceneAt([old, ruin], 199.5), old);
  assert.equal(citySceneAt([old, ruin], 200), ruin);
  assert.equal(citySceneAt([], 200), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPACT_FACES, renderCompactFace } from '../faces.ts';
import { renderSprite } from '../sprites.ts';

test('compact faces substitute eyes correctly', () => {
  assert.equal(renderCompactFace(COMPACT_FACES.cat, '✦'), '=✦ω✦=');
  assert.equal(renderCompactFace(COMPACT_FACES.snail, '@'), '@(@)');
});

test('hat overlays replace blank top line', () => {
  const lines = renderSprite('duck', 0, '·', 'crown', false);
  assert.equal(lines[0], '   \\^^^/    ');
});

test('blink substitutes eyes with dashes', () => {
  const normal = renderSprite('blob', 0, '✦', 'none', false);
  const blink = renderSprite('blob', 0, '✦', 'none', true);
  assert.match(normal[2]!, /✦/);
  assert.match(blink[2]!, /-/);
});

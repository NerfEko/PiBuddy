import test from 'node:test';
import assert from 'node:assert/strict';
import { getBubbleTextCharLimit, getBuddyDisplayWidth } from '../bubble.ts';
import { parseBuddyCommand } from '../commands.ts';
import { createDefaultState } from '../state.ts';
import { buildSidecarLines } from '../sidecar.ts';

test('buddy command parser handles switch, test, and default', () => {
  assert.deepEqual(parseBuddyCommand(''), { action: 'default' });
  assert.deepEqual(parseBuddyCommand('switch Nova Duck'), { action: 'switch', value: 'Nova Duck' });
  assert.deepEqual(parseBuddyCommand('pet'), { action: 'pet' });
  assert.deepEqual(parseBuddyCommand('test verify model reaction'), { action: 'test', value: 'verify model reaction' });
});

test('bubble text limit uses about two thirds of available line width', () => {
  const buddy = {
    id: 'duck-1',
    seed: 1,
    createdAt: new Date().toISOString(),
    species: 'duck' as const,
    rarity: 'epic' as const,
    eye: '·' as const,
    hat: 'none' as const,
    shiny: true,
    stats: { DEBUGGING: 88, PATIENCE: 20, CHAOS: 40, WISDOM: 55, SNARK: 33 },
    name: 'Nova Duck',
    personality: 'cheerful',
    soulSource: 'fallback' as const,
  };
  const reserved = getBuddyDisplayWidth(buddy) + 1;
  const safety = 2;
  const narrowFit = Math.max(1, (80 - reserved) - '[  ]-'.length - safety);
  const wideFit = Math.max(1, (140 - reserved) - '[  ]-'.length - safety);
  const hugeFit = Math.max(1, (240 - reserved) - '[  ]-'.length - safety);
  const narrow = getBubbleTextCharLimit(80, buddy);
  const wide = getBubbleTextCharLimit(140, buddy);
  const huge = getBubbleTextCharLimit(240, buddy);
  assert.equal(narrow, Math.floor(narrowFit * 2 / 3));
  assert.equal(wide, Math.floor(wideFit * 2 / 3));
  assert.equal(huge, Math.floor(hugeFit * 2 / 3));
  assert.ok(narrow < wide);
  assert.ok(wide < huge);
});

test('sidecar builder renders compact and wide modes', () => {
  const state = createDefaultState();
  const buddy = {
    id: 'duck-1',
    seed: 1,
    createdAt: new Date().toISOString(),
    species: 'duck' as const,
    rarity: 'epic' as const,
    eye: '·' as const,
    hat: 'none' as const,
    shiny: true,
    stats: { DEBUGGING: 88, PATIENCE: 20, CHAOS: 40, WISDOM: 55, SNARK: 33 },
    name: 'Nova Duck',
    personality: 'cheerful',
    soulSource: 'fallback' as const,
  };
  const compact = buildSidecarLines(80, state, buddy, { animationState: 'idle', bubbleText: null, bubbleUntil: 0, heartsUntil: 0, tick: 0 });
  const wide = buildSidecarLines(120, state, buddy, { animationState: 'idle', bubbleText: 'Quack!', bubbleUntil: Date.now() + 1000, heartsUntil: Date.now() + 1000, tick: 0 });
  assert.equal(compact.width > 0, true);
  assert.equal(wide.lines.some((line) => line.includes('Nova Duck')), true);
});

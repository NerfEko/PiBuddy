import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBuddyCommand } from '../commands.ts';
import { createDefaultState } from '../state.ts';
import { buildSidecarLines } from '../sidecar.ts';

test('buddy command parser handles switch and default', () => {
  assert.deepEqual(parseBuddyCommand(''), { action: 'default' });
  assert.deepEqual(parseBuddyCommand('switch Nova Duck'), { action: 'switch', value: 'Nova Duck' });
  assert.deepEqual(parseBuddyCommand('pet'), { action: 'pet' });
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

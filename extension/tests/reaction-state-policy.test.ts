import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTurn, generateLocalReaction } from '../reaction-core.ts';
import { createDefaultState, migrateState } from '../state.ts';
import { canUseModelReaction } from '../token-policy.ts';

test('turn classification recognizes coding and debugging', () => {
  assert.equal(classifyTurn({ toolResults: [{ toolName: 'edit' }] }).turnKind, 'coding');
  assert.equal(
    classifyTurn({ toolResults: [{ toolName: 'bash', isError: true }] }).turnKind,
    'debugging',
  );
});

test('local reaction stays short', () => {
  const state = createDefaultState();
  const buddy = {
    ...state,
    id: 'duck-1',
    seed: 1,
    createdAt: new Date().toISOString(),
    species: 'duck' as const,
    rarity: 'rare' as const,
    eye: '·' as const,
    hat: 'none' as const,
    shiny: false,
    stats: { DEBUGGING: 90, PATIENCE: 10, CHAOS: 50, WISDOM: 60, SNARK: 30 },
    name: 'Spark Duck',
    personality: 'cheerful',
    soulSource: 'fallback' as const,
  };
  const text = generateLocalReaction(buddy, { turnKind: 'coding', assistantSummary: 'added files', noteworthy: true });
  assert.ok(text.length <= 90);
});

test('model reaction gate enforces cooldown and budgets', () => {
  const state = createDefaultState();
  assert.equal(
    canUseModelReaction({ state, completedTurns: 10, lastReactionTurn: 0, lastReactionAt: Date.now() - 700000, noteworthy: true }),
    true,
  );
  assert.equal(
    canUseModelReaction({ state, completedTurns: 0, lastReactionTurn: 0, lastReactionAt: Date.now(), noteworthy: true }),
    false,
  );
});

test('state migration fills defaults', () => {
  const migrated = migrateState({ buddies: [] });
  assert.equal(migrated.version, 1);
  assert.equal(migrated.settings.reactionMode, 'cheap-model');
  assert.equal(migrated.sessionUsage.buddyModelCalls, 0);
});

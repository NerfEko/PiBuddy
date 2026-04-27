import test from 'node:test';
import assert from 'node:assert/strict';
import { RARITY_FLOORS, STATS } from '../constants.ts';
import { rollBuddy } from '../roll.ts';

test('rollBuddy is deterministic per seed', () => {
  assert.deepEqual(rollBuddy(12345), rollBuddy(12345));
});

test('peak and dump stats are always different', () => {
  for (let seed = 1; seed <= 500; seed += 1) {
    const roll = rollBuddy(seed);
    assert.notEqual(roll.peakStat, roll.dumpStat);
  }
});

test('stat bounds honor rarity floors', () => {
  for (let seed = 1; seed <= 2000; seed += 1) {
    const roll = rollBuddy(seed);
    const floor = RARITY_FLOORS[roll.rarity];
    for (const stat of STATS) {
      const value = roll.stats[stat];
      assert.ok(value >= 1 && value <= 100);
      if (stat === roll.peakStat) assert.ok(value >= Math.min(100, floor + 50));
      else if (stat === roll.dumpStat) assert.ok(value >= Math.max(1, floor - 10));
      else assert.ok(value >= floor);
    }
  }
});

test('legendary peak always hits 100', () => {
  let foundLegendary = 0;
  for (let seed = 1; seed <= 50000; seed += 1) {
    const roll = rollBuddy(seed);
    if (roll.rarity === 'legendary') {
      foundLegendary += 1;
      assert.equal(roll.stats[roll.peakStat], 100);
    }
  }
  assert.ok(foundLegendary > 0);
});

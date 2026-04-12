import {
  EYES,
  HATS,
  RARITIES,
  RARITY_FLOORS,
  RARITY_WEIGHTS,
  SPECIES,
  STATS,
  type Eye,
  type Hat,
  type Rarity,
  type Species,
  type StatName,
} from './constants.ts';

export interface BuddyRoll {
  seed: number;
  species: Species;
  rarity: Rarity;
  eye: Eye;
  hat: Hat;
  shiny: boolean;
  stats: Record<StatName, number>;
  peakStat: StatName;
  dumpStat: StatName;
}

export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

function pickOne<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)]!;
}

function pickWeightedRarity(rng: () => number): Rarity {
  const total = Object.values(RARITY_WEIGHTS).reduce((sum, value) => sum + value, 0);
  let roll = rng() * total;
  for (const rarity of RARITIES) {
    roll -= RARITY_WEIGHTS[rarity];
    if (roll < 0) return rarity;
  }
  return 'legendary';
}

export function rollBuddy(seed: number): BuddyRoll {
  const rng = mulberry32(seed);
  const rarity = pickWeightedRarity(rng);
  const species = pickOne(SPECIES, rng);
  const eye = pickOne(EYES, rng);
  const hat = rarity === 'common' ? 'none' : pickOne(HATS, rng);
  const shiny = rng() < 0.01;
  const peakStat = pickOne(STATS, rng);
  const dumpCandidates = STATS.filter((stat) => stat !== peakStat);
  const dumpStat = pickOne(dumpCandidates, rng);
  const floor = RARITY_FLOORS[rarity];
  const stats = {} as Record<StatName, number>;

  for (const stat of STATS) {
    if (stat === peakStat) {
      stats[stat] = Math.min(100, floor + 50 + Math.floor(rng() * 30));
    } else if (stat === dumpStat) {
      stats[stat] = Math.max(1, floor - 10 + Math.floor(rng() * 15));
    } else {
      stats[stat] = floor + Math.floor(rng() * 40);
    }
  }

  return { seed, species, rarity, eye, hat, shiny, stats, peakStat, dumpStat };
}

export function getHighestStat(stats: Record<StatName, number>): { name: StatName; value: number } {
  return STATS.reduce(
    (best, stat) => (stats[stat] > best.value ? { name: stat, value: stats[stat] } : best),
    { name: STATS[0], value: stats[STATS[0]] },
  );
}

export function getLowestStat(stats: Record<StatName, number>): { name: StatName; value: number } {
  return STATS.reduce(
    (best, stat) => (stats[stat] < best.value ? { name: stat, value: stats[stat] } : best),
    { name: STATS[0], value: stats[STATS[0]] },
  );
}

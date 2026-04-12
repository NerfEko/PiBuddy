import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { BUDDY_STATE_VERSION, type Eye, type Hat, type Rarity, type Species, type StatName } from './constants.ts';

export interface BuddySettings {
  muted: boolean;
  hidden: boolean;
  reactionEnabled: boolean;
  compactMode: 'auto' | 'force-compact' | 'force-full';
  bubbleMode: 'auto' | 'inline' | 'overlay';
  soulMode: 'model' | 'fallback';
  reactionMode: 'local-only' | 'cheap-model' | 'off';
  maxBuddyModelCallsPerSession: number;
  maxReactionCallsPerSession: number;
}

export interface SessionUsage {
  buddyModelCalls: number;
  soulCalls: number;
  reactionCalls: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
}

export interface BuddyRecord {
  id: string;
  seed: number;
  createdAt: string;
  species: Species;
  rarity: Rarity;
  eye: Eye;
  hat: Hat;
  shiny: boolean;
  stats: Record<StatName, number>;
  name: string;
  personality: string;
  soulSource: 'model' | 'fallback';
  favorite?: boolean;
  archived?: boolean;
  lastSaid?: string;
  timesPetted?: number;
}

export interface BuddyState {
  version: number;
  settings: BuddySettings;
  activeBuddyId: string | null;
  sessionUsage: SessionUsage;
  buddies: BuddyRecord[];
}

export const DEFAULT_SETTINGS: BuddySettings = {
  muted: false,
  hidden: false,
  reactionEnabled: true,
  compactMode: 'auto',
  bubbleMode: 'auto',
  soulMode: 'model',
  reactionMode: 'cheap-model',
  maxBuddyModelCallsPerSession: 50,
  maxReactionCallsPerSession: 30,
};

export function createDefaultState(): BuddyState {
  return {
    version: BUDDY_STATE_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    activeBuddyId: null,
    sessionUsage: {
      buddyModelCalls: 0,
      soulCalls: 0,
      reactionCalls: 0,
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
    },
    buddies: [],
  };
}

export function migrateState(input: unknown): BuddyState {
  const state = createDefaultState();
  if (!input || typeof input !== 'object') return state;
  const raw = input as Record<string, any>;
  return {
    version: BUDDY_STATE_VERSION,
    settings: { ...state.settings, ...(raw.settings ?? {}) },
    activeBuddyId: typeof raw.activeBuddyId === 'string' ? raw.activeBuddyId : null,
    sessionUsage: { ...state.sessionUsage, ...(raw.sessionUsage ?? {}) },
    buddies: Array.isArray(raw.buddies) ? raw.buddies : [],
  };
}

export function getStatePath(cwd: string): string {
  return resolve(cwd, '.pi/pi-buddy/state.json');
}

export async function loadState(cwd: string): Promise<BuddyState> {
  const path = getStatePath(cwd);
  try {
    const text = await readFile(path, 'utf8');
    return migrateState(JSON.parse(text));
  } catch {
    return createDefaultState();
  }
}

export async function saveState(cwd: string, state: BuddyState): Promise<void> {
  const path = getStatePath(cwd);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function getActiveBuddy(state: BuddyState): BuddyRecord | undefined {
  return state.buddies.find((buddy) => buddy.id === state.activeBuddyId && !buddy.archived);
}

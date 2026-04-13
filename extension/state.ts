import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { homedir } from 'node:os';
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
  preferredModel?: string; // "provider/id" or undefined for auto-detect
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
  maxBuddyModelCallsPerSession: 100,
  maxReactionCallsPerSession: 80,
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
    sessionUsage: { ...state.sessionUsage },  // always reset on session load
    buddies: Array.isArray(raw.buddies) ? raw.buddies : [],
  };
}

export function getGlobalStatePath(): string {
  // Store buddy state globally so it persists across all projects
  const agentDir = process.env.PI_AGENT_DIR || join(homedir(), '.pi', 'agent');
  return join(agentDir, '..', 'pi-buddy', 'state.json');
}

/** @deprecated use getGlobalStatePath() */
export function getStatePath(_cwd: string): string {
  return getGlobalStatePath();
}

export async function loadState(_cwd?: string): Promise<BuddyState> {
  const path = getGlobalStatePath();
  try {
    const text = await readFile(path, 'utf8');
    return migrateState(JSON.parse(text));
  } catch {
    return createDefaultState();
  }
}

export async function saveState(_cwd?: string | BuddyState, state?: BuddyState): Promise<void> {
  // Handle both old signature saveState(cwd, state) and new saveState(state)
  const actualState: BuddyState = state ?? (_cwd as unknown as BuddyState);
  const path = getGlobalStatePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(actualState, null, 2)}\n`, 'utf8');
}

export function getActiveBuddy(state: BuddyState): BuddyRecord | undefined {
  return state.buddies.find((buddy) => buddy.id === state.activeBuddyId && !buddy.archived);
}

import { getHighestStat, getLowestStat } from './roll.ts';
import type { BuddyRecord } from './state.ts';

export type TurnKind = 'coding' | 'debugging' | 'planning' | 'quick-answer' | 'general';

export interface TurnSummary {
  turnKind: TurnKind;
  assistantSummary: string;
  noteworthy: boolean;
}

export function classifyTurn(input: { assistantText?: string; toolResults?: Array<{ toolName?: string; isError?: boolean; content?: any }>; }): TurnSummary {
  const assistantText = (input.assistantText || '').trim();
  const toolResults = input.toolResults ?? [];
  const toolNames = new Set(toolResults.map((result) => result.toolName));
  const hasWrite = toolNames.has('edit') || toolNames.has('write');
  const hasFailingBash = toolResults.some((result) => {
    if (result.toolName !== 'bash') return false;
    if (result.isError) return true;
    const text = Array.isArray(result.content)
      ? result.content.map((part: any) => (part?.text ? String(part.text) : '')).join(' ')
      : '';
    return /fail|error|exception|traceback|not ok/i.test(text);
  });

  let turnKind: TurnKind = 'general';
  if (hasWrite) turnKind = 'coding';
  else if (hasFailingBash) turnKind = 'debugging';
  else if (/plan|phase|step|roadmap/i.test(assistantText)) turnKind = 'planning';
  else if (assistantText.length > 0 && assistantText.length < 180) turnKind = 'quick-answer';

  return {
    turnKind,
    assistantSummary: assistantText.split(/\s+/).slice(0, 20).join(' '),
    noteworthy: hasWrite || hasFailingBash || /fix|implement|patched|added|updated/i.test(assistantText),
  };
}

const OPENERS: Record<TurnKind, string[]> = {
  coding: ['Nice patch.', 'That diff had good bones.', 'Clean move.'],
  debugging: ['Aha, that bug squeaked.', 'Found the gremlin.', 'That stack trace blinked first.'],
  planning: ['A tidy plan helps.', 'Good map, fewer swamps.', 'Roadmap acquired.'],
  'quick-answer': ['Short and sharp.', 'Tiny answer, big energy.', 'Straight to the point.'],
  general: ['Still with you.', 'Terminal vibes remain excellent.', 'I approve of this turn.'],
};

const PEAK_TAILS = {
  DEBUGGING: 'Your debugging aura is showing.',
  PATIENCE: 'Patient wins beat heroic rewrites.',
  CHAOS: 'Just enough chaos to stay interesting.',
  WISDOM: 'That had wise-bird energy.',
  SNARK: 'Respectfully: excellent sass-to-output ratio.',
} as const;

export function generateLocalReaction(buddy: BuddyRecord, summary: TurnSummary): string {
  const high = getHighestStat(buddy.stats);
  const low = getLowestStat(buddy.stats);
  const starters = OPENERS[summary.turnKind];
  const base = starters[(buddy.seed + summary.assistantSummary.length) % starters.length]!;
  const weakness = low.name === 'DEBUGGING' && summary.turnKind === 'debugging' ? ' Even heroes need logs.' : '';
  return `${base} ${PEAK_TAILS[high.name]}${weakness}`.slice(0, 90);
}

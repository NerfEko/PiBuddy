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

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

const OPENERS: Record<TurnKind, string[]> = {
  coding: [
    'Nice patch!', 'Clean diff.', 'That code looks solid.', 'Good edit.',
    'Shipped it.', 'Tidy work.', 'Love that refactor.', 'Another file conquered.',
    'Code flows nicely.', 'That function sparks joy.',
  ],
  debugging: [
    'Bug squashed!', 'Found the gremlin.', 'Stack trace blinked first.',
    'That error had it coming.', 'One less bug in the world.', 'Squish.',
    'The logs never lie.', 'Debugging wizard move.', 'Error go bye-bye.',
  ],
  planning: [
    'Good plan.', 'Roadmap acquired.', 'Smart strategy.', 'Nice breakdown.',
    'That outline has legs.', 'Planning pays off.', 'Clear thinking.',
  ],
  'quick-answer': [
    'Short and sharp.', 'Quick win.', 'Straight to the point.',
    'No wasted words.', 'Efficient.', 'Boom. Done.', 'Snappy.',
  ],
  general: [
    'Still here!', 'Vibes are good.', '*nods approvingly*',
    'Watching and learning.', 'Carry on!', 'I see you working.',
    '*blinks supportively*', 'Terminal energy is high.',
    'Doing great.', '*stretches*', 'Nice session.',
  ],
};

const TAILS: Record<string, string[]> = {
  DEBUGGING: ['Debug aura: strong.', 'Bug radar activated.', 'Logs are your friend.'],
  PATIENCE: ['Patience wins.', 'Slow and steady.', 'No rush needed.'],
  CHAOS: ['Chaos energy!', 'Embrace the entropy.', 'Controlled chaos.'],
  WISDOM: ['Wise move.', 'Big brain energy.', 'Owl-level wisdom.'],
  SNARK: ['*slow clap*', 'Sass approved.', 'Maximum snark achieved.'],
};

export function generateLocalReaction(buddy: BuddyRecord, summary: TurnSummary): string {
  const high = getHighestStat(buddy.stats);
  const opener = pick(OPENERS[summary.turnKind]);
  const tails = TAILS[high.name] ?? ['Nice.'];
  const tail = Math.random() < 0.5 ? ` ${pick(tails)}` : '';
  return `${opener}${tail}`.slice(0, 60);
}

import { getHighestStat, getLowestStat } from './roll.ts';
import type { BuddyRecord } from './state.ts';

export type TurnKind = 'coding' | 'debugging' | 'planning' | 'quick-answer' | 'general';

export interface TurnSummary {
  turnKind: TurnKind;
  assistantSummary: string;
  noteworthy: boolean;
  /** Files edited/written this turn */
  filesChanged: string[];
  /** Short error snippet if debugging */
  errorHint: string;
  /** Tools used */
  toolsUsed: string[];
}

function extractText(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((p: any) => p?.text ?? '').join(' ');
  return '';
}

export function classifyTurn(input: {
  assistantText?: string;
  toolResults?: Array<{ toolName?: string; isError?: boolean; content?: any; args?: any }>;
}): TurnSummary {
  const assistantText = (input.assistantText || '').trim();
  const toolResults = input.toolResults ?? [];
  const toolNames = new Set(toolResults.map((r) => r.toolName).filter(Boolean));
  const toolsUsed = [...toolNames] as string[];

  // Extract file paths from edit/write tool args
  const filesChanged: string[] = [];
  for (const r of toolResults) {
    if ((r.toolName === 'edit' || r.toolName === 'write') && r.args?.path) {
      const p = String(r.args.path).split('/').pop() || r.args.path;
      if (!filesChanged.includes(p)) filesChanged.push(p);
    }
  }

  const hasWrite = toolNames.has('edit') || toolNames.has('write');
  let errorHint = '';
  const hasFailingBash = toolResults.some((r) => {
    if (r.toolName !== 'bash') return false;
    if (r.isError) {
      const text = extractText(r.content);
      errorHint = text.split('\n').find(l => /error|fail|exception/i.test(l))?.trim().slice(0, 80) || '';
      return true;
    }
    const text = extractText(r.content);
    if (/fail|error|exception|traceback|not ok/i.test(text)) {
      errorHint = text.split('\n').find(l => /error|fail|exception/i.test(l))?.trim().slice(0, 80) || '';
      return true;
    }
    return false;
  });

  let turnKind: TurnKind = 'general';
  if (hasWrite) turnKind = 'coding';
  else if (hasFailingBash) turnKind = 'debugging';
  else if (/plan|phase|step|roadmap/i.test(assistantText)) turnKind = 'planning';
  else if (assistantText.length > 0 && assistantText.length < 180) turnKind = 'quick-answer';

  // Build a richer summary
  const firstSentence = assistantText.split(/[.!?\n]/).filter(Boolean)[0]?.trim().slice(0, 80) || '';
  const summary = firstSentence || assistantText.split(/\s+/).slice(0, 20).join(' ');

  return {
    turnKind,
    assistantSummary: summary,
    noteworthy: hasWrite || hasFailingBash || /fix|implement|patched|added|updated/i.test(assistantText),
    filesChanged,
    errorHint,
    toolsUsed,
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

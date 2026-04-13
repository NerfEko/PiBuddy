import { getHighestStat, getLowestStat } from './roll.ts';
import type { BuddyRecord } from './state.ts';

export type TurnKind = 'coding' | 'debugging' | 'planning' | 'quick-answer' | 'general';

export interface TurnSummary {
  turnKind: TurnKind;
  assistantSummary: string;
  /** Longer slice of assistant text for model reactions */
  assistantFull: string;
  noteworthy: boolean;
  filesChanged: string[];
  errorHint: string;
  toolsUsed: string[];
  /** Interesting output snippets (test results, compile output, etc.) */
  outputHints: string[];
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

  const filesChanged: string[] = [];
  const outputHints: string[] = [];
  let errorHint = '';

  for (const r of toolResults) {
    // Collect files changed
    if ((r.toolName === 'edit' || r.toolName === 'write') && r.args?.path) {
      const p = String(r.args.path).split('/').pop() || r.args.path;
      if (!filesChanged.includes(p)) filesChanged.push(p);
    }

    // Collect useful bash output snippets
    if (r.toolName === 'bash') {
      const text = extractText(r.content);
      // Test results
      const testMatch = text.match(/(\d+ passing|\d+ failing|\d+ tests?|all tests passed|tests? passed|tests? failed)/i);
      if (testMatch) outputHints.push(testMatch[0]);
      // Compile/build output
      const buildMatch = text.match(/(compiled|build success|build failed|error TS\d+|\d+ error|\d+ warning)/i);
      if (buildMatch) outputHints.push(buildMatch[0]);
      // Error extraction
      if (r.isError || /fail|error|exception|traceback/i.test(text)) {
        const errLine = text.split('\n').find(l => /error|fail|exception/i.test(l))?.trim();
        if (errLine) errorHint = errLine.slice(0, 100);
      }
    }
  }

  const hasWrite = toolNames.has('edit') || toolNames.has('write');
  const hasBash = toolNames.has('bash');
  const hasFailingBash = toolResults.some((r) => {
    if (r.toolName !== 'bash') return false;
    if (r.isError) return true;
    return /fail|error|exception|traceback|not ok/i.test(extractText(r.content));
  });

  let turnKind: TurnKind = 'general';
  if (hasWrite) turnKind = 'coding';
  else if (hasFailingBash) turnKind = 'debugging';
  else if (/plan|phase|step|roadmap/i.test(assistantText)) turnKind = 'planning';
  else if (assistantText.length > 0 && assistantText.length < 180) turnKind = 'quick-answer';

  const firstSentence = assistantText.split(/[.!?\n]/).filter(Boolean)[0]?.trim().slice(0, 100) || '';
  const summary = firstSentence || assistantText.split(/\s+/).slice(0, 20).join(' ');
  // Longer slice for model to read — first ~400 chars
  const assistantFull = assistantText.slice(0, 400);

  // noteworthy = any turn where there was actual work or a real response
  const noteworthy = hasWrite || hasFailingBash || hasBash || assistantText.length > 30;

  return {
    turnKind,
    assistantSummary: summary,
    assistantFull,
    noteworthy,
    filesChanged,
    errorHint,
    toolsUsed,
    outputHints,
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

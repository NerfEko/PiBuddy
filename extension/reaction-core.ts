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
  filesRead: string[];
  editDetails: string[];
  writeDetails: string[];
  commandsRun: string[];
  commandOutputs: string[];
  errorHint: string;
  toolsUsed: string[];
  /** Interesting output snippets (test results, compile output, etc.) */
  outputHints: string[];
}

const ASSISTANT_CONTEXT_LIMIT = 1800;
const TOOL_BLOCK_LIMIT = 1400;
const TOOL_LINE_LIMIT = 220;
const MAX_EDIT_DETAILS = 8;
const MAX_WRITE_DETAILS = 4;
const MAX_COMMAND_OUTPUTS = 4;

function extractText(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((p: any) => p?.text ?? '').join(' ');
  return '';
}

function pushUnique(target: string[], value: string): void {
  if (!value || target.includes(value)) return;
  target.push(value);
}

function cleanBlock(text: unknown): string {
  return String(text ?? '').replace(/\r/g, '').trim();
}

function truncateBlock(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

function truncateLine(text: unknown, maxChars = TOOL_LINE_LIMIT): string {
  const cleaned = cleanBlock(text).replace(/\s+/g, ' ');
  return truncateBlock(cleaned, maxChars);
}

function normalizePath(path: unknown): string {
  return cleanBlock(path);
}

function formatEditDetail(path: string, edit: any, index: number): string {
  const oldText = truncateBlock(cleanBlock(edit?.oldText), TOOL_BLOCK_LIMIT);
  const newText = truncateBlock(cleanBlock(edit?.newText), TOOL_BLOCK_LIMIT);
  const parts = [`Edit ${index + 1} in ${path}`];
  if (oldText) parts.push(`OLD:\n${oldText}`);
  if (newText) parts.push(`NEW:\n${newText}`);
  return parts.join('\n');
}

function formatWriteDetail(path: string, content: unknown): string {
  const body = truncateBlock(cleanBlock(content), TOOL_BLOCK_LIMIT);
  return body ? `Wrote ${path}:\n${body}` : `Wrote ${path}.`;
}

function formatCommandOutput(command: string, content: unknown): string {
  const output = truncateBlock(cleanBlock(extractText(content)), TOOL_BLOCK_LIMIT);
  if (!output) return '';
  return `Command output for \`${truncateLine(command, 120)}\`:\n${output}`;
}

function collectEdits(args: any): Array<{ oldText?: string; newText?: string }> {
  if (Array.isArray(args?.edits)) return args.edits;
  if (typeof args?.oldText === 'string' || typeof args?.newText === 'string') {
    return [{ oldText: args?.oldText, newText: args?.newText }];
  }
  return [];
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
  const filesRead: string[] = [];
  const editDetails: string[] = [];
  const writeDetails: string[] = [];
  const commandsRun: string[] = [];
  const commandOutputs: string[] = [];
  const outputHints: string[] = [];
  let errorHint = '';

  for (const r of toolResults) {
    const args = r.args ?? {};

    if (r.toolName === 'read') {
      pushUnique(filesRead, normalizePath(args.path));
    }

    if (r.toolName === 'edit') {
      const path = normalizePath(args.path);
      if (path) pushUnique(filesChanged, path);
      const edits = collectEdits(args);
      for (const [index, edit] of edits.slice(0, MAX_EDIT_DETAILS).entries()) {
        editDetails.push(formatEditDetail(path || 'unknown file', edit, index));
      }
      if (edits.length > MAX_EDIT_DETAILS) {
        editDetails.push(`(${edits.length - MAX_EDIT_DETAILS} more edits in ${path || 'unknown file'} omitted)`);
      }
    }

    if (r.toolName === 'write') {
      const path = normalizePath(args.path);
      if (path) pushUnique(filesChanged, path);
      if (writeDetails.length < MAX_WRITE_DETAILS) {
        writeDetails.push(formatWriteDetail(path || 'unknown file', args.content));
      }
    }

    if (r.toolName === 'bash') {
      const command = cleanBlock(args.command);
      if (command) commandsRun.push(truncateBlock(command, TOOL_BLOCK_LIMIT));
      const formattedOutput = formatCommandOutput(command, r.content);
      if (formattedOutput && commandOutputs.length < MAX_COMMAND_OUTPUTS) {
        commandOutputs.push(formattedOutput);
      }

      const text = extractText(r.content);
      const testMatch = text.match(/(\d+ passing|\d+ failing|\d+ tests?|all tests passed|tests? passed|tests? failed)/i);
      if (testMatch) outputHints.push(testMatch[0]);
      const buildMatch = text.match(/(compiled|build success|build failed|error TS\d+|\d+ error|\d+ warning)/i);
      if (buildMatch) outputHints.push(buildMatch[0]);
      if (r.isError || /fail|error|exception|traceback/i.test(text)) {
        const errLine = text.split('\n').find((line) => /error|fail|exception/i.test(line))?.trim();
        if (errLine) errorHint = errLine.slice(0, 240);
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
  const assistantFull = assistantText.slice(0, ASSISTANT_CONTEXT_LIMIT);
  const noteworthy = hasWrite || hasFailingBash || hasBash || assistantText.length > 30;

  return {
    turnKind,
    assistantSummary: summary,
    assistantFull,
    noteworthy,
    filesChanged,
    filesRead,
    editDetails,
    writeDetails,
    commandsRun,
    commandOutputs,
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

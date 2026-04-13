import { complete, type UserMessage } from '@mariozechner/pi-ai';
import type { ExtensionContext } from '@mariozechner/pi-coding-agent';
import { findCheapModel } from './cheap-model.ts';
import { getHighestStat, getLowestStat } from './roll.ts';
import { canUseModelReaction, recordModelUsage, TOKEN_POLICY } from './token-policy.ts';
import type { BuddyRecord, BuddyState } from './state.ts';
import { classifyTurn, type TurnSummary } from './reaction-core.ts';

export { classifyTurn } from './reaction-core.ts';

export type BuddyModelReactionTestResult =
  | { ok: true; text: string; modelKey: string }
  | { ok: false; reason: 'no-model' | 'aborted' | 'error' | 'empty'; modelKey?: string; error?: string };

function buildReactionPrompts(buddy: BuddyRecord, summary: TurnSummary, maxChars = 90): { prompt: string; sysPrompt: string } {
  const high = getHighestStat(buddy.stats);
  const low = getLowestStat(buddy.stats);
  const contextParts = [
    `You are ${buddy.name}, a ${buddy.rarity} ${buddy.species} companion.`,
    `Personality: ${buddy.personality}`,
    `Stats — strongest: ${high.name} (${high.value}), weakest: ${low.name} (${low.value}).`,
  ];
  if (summary.filesChanged.length > 0)
    contextParts.push(`Files changed: ${summary.filesChanged.slice(0, 4).join(', ')}.`);
  if (summary.errorHint)
    contextParts.push(`Error encountered: ${summary.errorHint}.`);
  if (summary.outputHints.length > 0)
    contextParts.push(`Output: ${summary.outputHints.join(', ')}.`);
  if (summary.assistantFull)
    contextParts.push(`What the AI just did/said:\n${summary.assistantFull}`);
  if (buddy.lastSaid)
    contextParts.push(`Your last reaction was: "${buddy.lastSaid}" — don't repeat it.`);
  contextParts.push(
    `React as ${buddy.name} in one short line. Be specific to what just happened — mention files, errors, or results if relevant. Stay in character. Max ${maxChars} chars. No quotes. No markdown.`
  );
  return {
    prompt: contextParts.join('\n'),
    sysPrompt: `You are ${buddy.name}, a ${buddy.species} companion watching a developer work. Personality: ${buddy.personality} React with a single short in-character comment about what just happened. Be specific, not generic.`,
  };
}

async function generateModelReaction(
  ctx: ExtensionContext,
  state: BuddyState,
  buddy: BuddyRecord,
  summary: TurnSummary,
  maxChars = 90,
): Promise<BuddyModelReactionTestResult> {
  const cheap = await findCheapModel(ctx, state);
  if (!cheap) return { ok: false, reason: 'no-model' };

  const { prompt, sysPrompt } = buildReactionPrompts(buddy, summary, maxChars);
  const modelKey = `${cheap.model.provider}/${cheap.model.id}`;
  const userMessage: UserMessage = {
    role: 'user',
    content: [{ type: 'text', text: prompt }],
    timestamp: Date.now(),
  };

  try {
    const response = await complete(
      cheap.model,
      { systemPrompt: sysPrompt, messages: [userMessage] },
      { apiKey: cheap.apiKey, headers: cheap.headers, signal: ctx.signal, maxTokens: TOKEN_POLICY.reactionOutputHardCap },
    );

    if (response.stopReason === 'aborted') return { ok: false, reason: 'aborted', modelKey };
    if (response.stopReason === 'error') return { ok: false, reason: 'error', modelKey, error: 'model returned error stopReason' };

    const text = response.content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join(' ')
      .trim()
      .slice(0, Math.max(1, maxChars));

    recordModelUsage(state, response.usage.input || 0, response.usage.output || 0, 'reaction');
    return text ? { ok: true, text, modelKey } : { ok: false, reason: 'empty', modelKey };
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      modelKey,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function testBuddyModelReaction(
  ctx: ExtensionContext,
  state: BuddyState,
  buddy: BuddyRecord,
  scenario?: string,
  maxChars = 90,
): Promise<BuddyModelReactionTestResult> {
  const summary = classifyTurn({
    assistantText: scenario?.trim() || 'Updated extension/reaction.ts, removed fallback reactions, and tests passed.',
    toolResults: [
      { toolName: 'edit', args: { path: 'extension/reaction.ts' } },
      { toolName: 'bash', content: '13 tests passed' },
    ],
  });
  return generateModelReaction(ctx, state, buddy, summary, maxChars);
}

export async function maybeGenerateReaction(
  ctx: ExtensionContext,
  state: BuddyState,
  buddy: BuddyRecord,
  summary: TurnSummary,
  completedTurns: number,
  lastReactionTurn: number,
  lastReactionAt: number,
  maxChars = 90,
): Promise<{ text: string; source: 'local' | 'model' } | null> {
  if (state.settings.hidden || state.settings.muted || !state.settings.reactionEnabled) return null;
  if (state.settings.reactionMode === 'off' || state.settings.reactionMode !== 'cheap-model') return null;

  if (
    !canUseModelReaction({
      state,
      completedTurns,
      lastReactionTurn,
      lastReactionAt,
      noteworthy: summary.noteworthy,
    })
  ) {
    return null;
  }
  if (Math.random() >= 0.85) return null;  // skip ~15% to avoid every single turn

  const result = await generateModelReaction(ctx, state, buddy, summary, maxChars);
  return result.ok ? { text: result.text, source: 'model' } : null;
}

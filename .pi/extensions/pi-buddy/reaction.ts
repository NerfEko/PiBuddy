import { complete, type UserMessage } from '@mariozechner/pi-ai';
import type { ExtensionContext } from '@mariozechner/pi-coding-agent';
import { getHighestStat, getLowestStat } from './roll.ts';
import { canUseModelReaction, recordModelUsage, TOKEN_POLICY } from './token-policy.ts';
import type { BuddyRecord, BuddyState } from './state.ts';
import { classifyTurn, generateLocalReaction, type TurnSummary } from './reaction-core.ts';

export { classifyTurn, generateLocalReaction } from './reaction-core.ts';

export async function maybeGenerateReaction(
  ctx: ExtensionContext,
  state: BuddyState,
  buddy: BuddyRecord,
  summary: TurnSummary,
  completedTurns: number,
  lastReactionTurn: number,
  lastReactionAt: number,
): Promise<{ text: string; source: 'local' | 'model' } | null> {
  if (state.settings.hidden || state.settings.muted || !state.settings.reactionEnabled) return null;
  if (state.settings.reactionMode === 'off') return null;

  const local = generateLocalReaction(buddy, summary);
  if (state.settings.reactionMode !== 'cheap-model' || !ctx.model) {
    return Math.random() < 0.3 ? { text: local, source: 'local' } : null;
  }

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
  if (!auth.ok || !auth.apiKey) return Math.random() < 0.3 ? { text: local, source: 'local' } : null;
  if (
    !canUseModelReaction({
      state,
      completedTurns,
      lastReactionTurn,
      lastReactionAt,
      noteworthy: summary.noteworthy,
    })
  ) {
    return Math.random() < 0.3 ? { text: local, source: 'local' } : null;
  }
  if (Math.random() >= 0.1) return null;

  try {
    const high = getHighestStat(buddy.stats);
    const low = getLowestStat(buddy.stats);
    const prompt = [
      `species=${buddy.species} rarity=${buddy.rarity} shiny=${buddy.shiny ? 'yes' : 'no'}`,
      `peak=${high.name} low=${low.name}`,
      `turnKind=${summary.turnKind}`,
      `assistantSummary=${summary.assistantSummary}`,
      'Write exactly one playful line under 90 chars. No quotes. No explanation.',
    ].join('\n');

    const userMessage: UserMessage = {
      role: 'user',
      content: [{ type: 'text', text: prompt }],
      timestamp: Date.now(),
    };

    const response = await complete(
      ctx.model,
      { systemPrompt: 'You are a tiny coding buddy reacting with one short line.', messages: [userMessage] },
      { apiKey: auth.apiKey, headers: auth.headers, signal: ctx.signal, maxTokens: TOKEN_POLICY.reactionOutputHardCap },
    );

    if (response.stopReason === 'aborted' || response.stopReason === 'error') return { text: local, source: 'local' };
    const text = response.content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join(' ')
      .trim()
      .slice(0, 90);
    recordModelUsage(state, response.usage.input || 0, response.usage.output || 0, 'reaction');
    return text ? { text, source: 'model' } : { text: local, source: 'local' };
  } catch {
    return { text: local, source: 'local' };
  }
}

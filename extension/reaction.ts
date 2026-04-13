import { complete, type UserMessage } from '@mariozechner/pi-ai';
import type { ExtensionContext } from '@mariozechner/pi-coding-agent';
import { findCheapModel } from './cheap-model.ts';
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
  if (state.settings.reactionMode !== 'cheap-model') {
    return Math.random() < 0.3 ? { text: local, source: 'local' } : null;
  }

  const cheap = await findCheapModel(ctx, state);
  if (!cheap) return Math.random() < 0.3 ? { text: local, source: 'local' } : null;
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
  if (Math.random() >= 0.7) return null;

  try {
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
      `React as ${buddy.name} in one short line. Be specific to what just happened — mention files, errors, or results if relevant. Stay in character. Max 90 chars. No quotes. No markdown.`
    );
    const prompt = contextParts.join('\n');
    const sysPrompt = `You are ${buddy.name}, a ${buddy.species} companion watching a developer work. Personality: ${buddy.personality} React with a single short in-character comment about what just happened. Be specific, not generic.`;

    const userMessage: UserMessage = {
      role: 'user',
      content: [{ type: 'text', text: prompt }],
      timestamp: Date.now(),
    };

    const response = await complete(
      cheap.model,
      { systemPrompt: sysPrompt, messages: [userMessage] },
      { apiKey: cheap.apiKey, headers: cheap.headers, signal: ctx.signal, maxTokens: TOKEN_POLICY.reactionOutputHardCap },
    );

    if (response.stopReason === 'aborted' || response.stopReason === 'error') return { text: local, source: 'local' };
    const text = response.content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join(' ')
      .trim()
      .slice(0, 120);
    recordModelUsage(state, response.usage.input || 0, response.usage.output || 0, 'reaction');
    return text ? { text, source: 'model' } : { text: local, source: 'local' };
  } catch {
    return { text: local, source: 'local' };
  }
}

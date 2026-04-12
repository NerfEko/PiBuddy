import { complete, type UserMessage } from '@mariozechner/pi-ai';
import type { ExtensionContext } from '@mariozechner/pi-coding-agent';
import { FALLBACK_PERSONALITIES } from './personalities.ts';
import { getHighestStat, getLowestStat } from './roll.ts';
import { canUseModelSoul, recordModelUsage, TOKEN_POLICY } from './token-policy.ts';
import type { BuddyRecord, BuddyState } from './state.ts';

function fallbackNameForBuddy(buddy: Pick<BuddyRecord, 'species' | 'rarity' | 'shiny'>): string {
  const rarityWord: Record<BuddyRecord['rarity'], string> = {
    common: 'Pal',
    uncommon: 'Scout',
    rare: 'Spark',
    epic: 'Nova',
    legendary: 'Myth',
  };
  const species = buddy.species[0]!.toUpperCase() + buddy.species.slice(1);
  const shiny = buddy.shiny ? 'Glimmer' : rarityWord[buddy.rarity];
  return `${shiny} ${species}`;
}

export function generateFallbackSoul(buddy: Pick<BuddyRecord, 'species' | 'rarity' | 'shiny' | 'stats'>) {
  return {
    name: fallbackNameForBuddy(buddy),
    personality: FALLBACK_PERSONALITIES[buddy.species],
    soulSource: 'fallback' as const,
  };
}

export async function generateSoul(
  ctx: ExtensionContext,
  state: BuddyState,
  buddy: Pick<BuddyRecord, 'species' | 'rarity' | 'shiny' | 'stats'>,
): Promise<{ name: string; personality: string; soulSource: 'model' | 'fallback' }> {
  const fallback = generateFallbackSoul(buddy);
  if (!ctx.model) return fallback;

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
  const hasModel = auth.ok && !!auth.apiKey;
  if (!canUseModelSoul(state, hasModel)) return fallback;

  try {
    const high = getHighestStat(buddy.stats);
    const low = getLowestStat(buddy.stats);
    const prompt = [
      `species=${buddy.species}`,
      `rarity=${buddy.rarity}`,
      `shiny=${buddy.shiny ? 'yes' : 'no'}`,
      `highest=${high.name}`,
      `lowest=${low.name}`,
      `seedPersonality=${fallback.personality}`,
      'Return exactly two lines:',
      'name: <short name>',
      'personality: <1-2 sentences under 180 chars>',
      'No markdown. No extra text.',
    ].join('\n');

    const userMessage: UserMessage = {
      role: 'user',
      content: [{ type: 'text', text: prompt }],
      timestamp: Date.now(),
    };

    const response = await complete(
      ctx.model,
      {
        systemPrompt: 'You create tiny pet companion identities. Be concise and playful.',
        messages: [userMessage],
      },
      {
        apiKey: auth.apiKey!,
        headers: auth.headers,
        signal: ctx.signal,
        maxTokens: TOKEN_POLICY.soulGenerationHardCap,
      },
    );

    if (response.stopReason === 'aborted' || response.stopReason === 'error') return fallback;

    const text = response.content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
      .trim();

    const nameMatch = text.match(/name\s*:\s*(.+)/i);
    const personalityMatch = text.match(/personality\s*:\s*(.+)/i);
    const name = nameMatch?.[1]?.trim() || fallback.name;
    const personality = personalityMatch?.[1]?.trim() || fallback.personality;
    recordModelUsage(state, response.usage.input || 0, response.usage.output || 0, 'soul');
    return { name, personality, soulSource: 'model' };
  } catch {
    return fallback;
  }
}

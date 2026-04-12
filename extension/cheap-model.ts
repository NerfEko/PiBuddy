import { type Model, type Api } from '@mariozechner/pi-ai';
import type { ExtensionContext } from '@mariozechner/pi-coding-agent';
import type { BuddyState } from './state.ts';

/**
 * Ordered list of cheap/fast models to try for buddy AI calls.
 * Covers GitHub Copilot, Anthropic, Google, OpenAI, and OpenRouter.
 * First one with a valid API key wins.
 */
export const BUDDY_CHEAP_MODELS = [
  // GitHub Copilot (free for subscribers) — try fastest first
  ['github-copilot', 'claude-haiku-4.5'],
  ['github-copilot', 'gpt-4o'],
  ['github-copilot', 'gemini-3-flash-preview'],
  ['github-copilot', 'gpt-5-mini'],
  // Direct Anthropic
  ['anthropic', 'claude-haiku-4-20240307'],
  ['anthropic', 'claude-haiku-4-5'],
  // Direct Google
  ['google', 'gemini-2.0-flash'],
  ['google', 'gemini-1.5-flash'],
  // Direct OpenAI
  ['openai', 'gpt-4o-mini'],
  ['openai', 'gpt-4o'],
] as const;

export async function findCheapModel(
  ctx: ExtensionContext,
  state?: BuddyState,
): Promise<{ model: Model<Api>; apiKey: string; headers?: Record<string, string> } | null> {
  // Check user's preferred model first
  if (state?.settings.preferredModel) {
    const [provider, ...idParts] = state.settings.preferredModel.split('/');
    const id = idParts.join('/');
    if (provider && id) {
      const model = ctx.modelRegistry.find(provider, id);
      if (model) {
        const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
        if (auth.ok && auth.apiKey) return { model, apiKey: auth.apiKey, headers: auth.headers };
      }
    }
  }
  for (const [provider, id] of BUDDY_CHEAP_MODELS) {
    const model = ctx.modelRegistry.find(provider, id);
    if (!model) continue;
    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (auth.ok && auth.apiKey) return { model, apiKey: auth.apiKey, headers: auth.headers };
  }
  // Fall back to whatever model is active
  if (ctx.model) {
    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
    if (auth.ok && auth.apiKey) return { model: ctx.model, apiKey: auth.apiKey, headers: auth.headers };
  }
  return null;
}

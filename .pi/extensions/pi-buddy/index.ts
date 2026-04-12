import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import { showBuddyCard, showRosterBrowser } from './card.ts';
import { registerBuddyCommands } from './commands.ts';
import { installBuddyWidget, clearBuddyWidget, type BuddyVisualState } from './editor.ts';
import { generateSoul } from './soul.ts';
import { maybeGenerateReaction, classifyTurn } from './reaction.ts';
import { randomSeed, rollBuddy } from './roll.ts';
import { getActiveBuddy, loadState, saveState, type BuddyRecord, type BuddyState } from './state.ts';

function makeBuddyId(seed: number, species: string): string {
  return `${species}-${seed.toString(16)}-${Date.now().toString(36)}`;
}

function defaultVisualState(): BuddyVisualState {
  return {
    animationState: 'idle',
    bubbleText: null,
    bubbleUntil: 0,
    heartsUntil: 0,
    tick: 0,
  };
}

export default function (pi: ExtensionAPI) {
  let state: BuddyState;
  let visual = defaultVisualState();
  let timer: ReturnType<typeof setInterval> | undefined;
  let completedTurns = 0;
  let lastReactionTurn = -999;
  let lastReactionAt = 0;
  let currentCtx: ExtensionContext | null = null;

  const requestRender = () => {
    // Widget auto-updates on its timer; nothing to do here
  };

  const save = async () => {
    if (!state) return;
    await saveState(process.cwd(), state);
  };

  const activeBuddy = () => getActiveBuddy(state);

  const syncStatus = (ctx: ExtensionContext) => {
    const buddy = activeBuddy();
    const text = buddy && !state.settings.hidden ? `${buddy.name} ${buddy.rarity}${buddy.shiny ? ' ✨' : ''}` : '';
    ctx.ui.setStatus?.('pi-buddy', text);
    requestRender();
  };

  const hatch = async (ctx: ExtensionContext) => {
    try {
      const roll = rollBuddy(randomSeed());
      const baseBuddy: BuddyRecord = {
      id: makeBuddyId(roll.seed, roll.species),
      seed: roll.seed,
      createdAt: new Date().toISOString(),
      species: roll.species,
      rarity: roll.rarity,
      eye: roll.eye,
      hat: roll.hat,
      shiny: roll.shiny,
      stats: roll.stats,
      name: '',
      personality: '',
      soulSource: 'fallback',
      timesPetted: 0,
    };
    const soul = await generateSoul(ctx, state, baseBuddy);
    const buddy: BuddyRecord = { ...baseBuddy, ...soul };
    state.buddies.push(buddy);
    state.activeBuddyId = buddy.id;
    await save();
    syncStatus(ctx);
    ctx.ui.notify(`Hatched ${buddy.name} the ${buddy.species}!`, 'success');
    } catch (err: any) {
      ctx.ui.notify(`Hatch error: ${err?.message || err}`, 'error');
    }
  };

  const switchBuddy = async (ctx: ExtensionContext, query: string) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      ctx.ui.notify('Usage: /buddy switch <name|id>', 'error');
      return;
    }
    const buddy = state.buddies.find((item) => !item.archived && (item.id.toLowerCase() === normalized || item.name.toLowerCase() === normalized || item.name.toLowerCase().includes(normalized)));
    if (!buddy) {
      ctx.ui.notify(`No buddy matched '${query}'.`, 'error');
      return;
    }
    state.activeBuddyId = buddy.id;
    await save();
    syncStatus(ctx);
    ctx.ui.notify(`Switched to ${buddy.name}.`, 'success');
  };

  registerBuddyCommands(pi, {
    async openDefault(ctx) {
      try {
        if (!state || state.buddies.length === 0) {
          ctx.ui.notify('No buddies yet — hatching one...', 'info');
          return hatch(ctx);
        }
        const buddy = activeBuddy();
        if (!buddy) {
          ctx.ui.notify('No active buddy found. Hatching...', 'info');
          return hatch(ctx);
        }
        ctx.ui.notify(`Showing card for ${buddy.name}`, 'info');
        return this.card(ctx);
      } catch (err: any) {
        ctx.ui.notify(`/buddy error: ${err?.message || err}`, 'error');
      }
    },
    hatch,
    async list(ctx) {
      const selected = await showRosterBrowser(ctx, state);
      if (selected) {
        state.activeBuddyId = selected;
        await save();
        syncStatus(ctx);
      }
    },
    async switchBuddy(ctx, query) {
      await switchBuddy(ctx, query);
    },
    async card(ctx) {
      const buddy = activeBuddy();
      if (!buddy) {
        ctx.ui.notify('No active buddy yet. Use /buddy hatch.', 'info');
        return;
      }
      try {
        await showBuddyCard(ctx, buddy, state);
      } catch (err: any) {
        ctx.ui.notify(`Card error: ${err?.message || err}`, 'error');
      }
    },
    async pet(ctx) {
      const buddy = activeBuddy();
      if (!buddy) {
        ctx.ui.notify('No buddy to pet yet.', 'info');
        return;
      }
      try {
        buddy.timesPetted = (buddy.timesPetted || 0) + 1;
        visual.animationState = 'petted';
        visual.heartsUntil = Date.now() + 2500;
        const reaction = buddy.lastSaid || `*${buddy.name} looks delighted*`;
        visual.bubbleText = reaction;
        visual.bubbleUntil = Date.now() + 4000;
        await save();
        requestRender();
        ctx.ui.notify(`${buddy.name} loved that! (petted ${buddy.timesPetted}x)`, 'success');
      } catch (err: any) {
        ctx.ui.notify(`Pet error: ${err?.message || err}`, 'error');
      }
    },
    async mute(ctx) {
      state.settings.muted = true;
      await save();
      syncStatus(ctx);
      ctx.ui.notify('Buddy muted.', 'info');
    },
    async unmute(ctx) {
      state.settings.muted = false;
      await save();
      syncStatus(ctx);
      ctx.ui.notify('Buddy unmuted.', 'success');
    },
    async off(ctx) {
      state.settings.hidden = true;
      await save();
      syncStatus(ctx);
      ctx.ui.notify('Buddy hidden.', 'info');
    },
    async on(ctx) {
      state.settings.hidden = false;
      await save();
      syncStatus(ctx);
      ctx.ui.notify('Buddy visible.', 'success');
    },
    async reroll(ctx) {
      await hatch(ctx);
    },
  });

  pi.on('session_start', async (_event, ctx) => {
    state = await loadState(process.cwd());
    currentCtx = ctx;

    installBuddyWidget(pi, ctx, {
      getState: () => state,
      getActiveBuddy: () => activeBuddy(),
      getVisualState: () => visual,
    });

    clearInterval(timer);
    timer = setInterval(() => {
      visual.tick += 1;
      if (visual.bubbleUntil && Date.now() > visual.bubbleUntil) visual.bubbleText = null;
      if (visual.animationState === 'petted' && Date.now() > visual.heartsUntil) visual.animationState = 'idle';
    }, 500);

    syncStatus(ctx);
  });

  pi.on('turn_start', async () => {
    visual.animationState = 'thinking';
    requestRender();
  });

  pi.on('message_update', async () => {
    visual.animationState = 'speaking';
    requestRender();
  });

  pi.on('turn_end', async (event: any, ctx) => {
    completedTurns += 1;
    visual.animationState = 'idle';
    const buddy = activeBuddy();
    if (!buddy || state.settings.hidden) {
      requestRender();
      return;
    }
    const assistantText = Array.isArray(event.message?.content)
      ? event.message.content.filter((part: any) => part.type === 'text').map((part: any) => part.text).join(' ')
      : '';
    const summary = classifyTurn({ assistantText, toolResults: event.toolResults ?? [] });
    const reaction = await maybeGenerateReaction(ctx, state, buddy, summary, completedTurns, lastReactionTurn, lastReactionAt);
    if (reaction) {
      buddy.lastSaid = reaction.text;
      visual.bubbleText = reaction.text;
      visual.bubbleUntil = Date.now() + 10000;
      lastReactionAt = Date.now();
      lastReactionTurn = completedTurns;
      await save();
    }
    requestRender();
  });

  pi.on('agent_end', async () => {
    visual.animationState = 'idle';
    requestRender();
  });

  pi.on('session_shutdown', async (_event, ctx) => {
    if (timer) clearInterval(timer);
    clearBuddyWidget(ctx);
    await save();
  });
}

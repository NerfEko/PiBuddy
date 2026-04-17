import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import { getBubbleTextCharLimit } from './bubble.ts';
import { showBuddyCard, showRosterBrowser } from './card.ts';
import { registerBuddyCommands } from './commands.ts';
import { installBuddyEditor, clearBuddyEditor, requestOverlayRender, type BuddyVisualState } from './editor.ts';
import { generateSoul } from './soul.ts';
import { maybeGenerateReaction, classifyTurn, testBuddyModelReaction } from './reaction.ts';
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
    lastEditorWidth: 80,
  };
}

export default function (pi: ExtensionAPI) {
  let state: BuddyState;
  let visual = defaultVisualState();
  let completedTurns = 0;
  let lastReactionTurn = -999;
  let lastReactionAt = 0;
  let buddyRuntime: import('./editor.ts').BuddyEditorRuntime | null = null;
    let animInterval: ReturnType<typeof setInterval> | undefined;
  const requestRender = () => { requestOverlayRender(); };

  const save = async () => {
    if (!state) return;
    await saveState(state);
  };

  const activeBuddy = () => getActiveBuddy(state);
  const bubbleCharLimit = (buddy: BuddyRecord) =>
    getBubbleTextCharLimit(visual.lastEditorWidth || 80, buddy);

  let lastInstalledBuddyId: string | null | undefined = undefined;

  const syncStatus = (ctx: ExtensionContext) => {
    requestRender();
    // Re-install the editor overlay when the active buddy changes
    // so the overlay width always matches the new buddy's name/sprite
    const currentId = state.activeBuddyId;
    if (ctx.hasUI && currentId !== lastInstalledBuddyId && buddyRuntime) {
      lastInstalledBuddyId = currentId;
      installBuddyEditor(pi, ctx, buddyRuntime);
    }
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
        const petLines = [
          `*${buddy.name} purrs*`, `*happy wiggles*`, `*nuzzles your cursor*`,
          `*does a little dance*`, `*chirps contentedly*`, `Thanks, needed that!`,
          `*tail wag*`, `Best human ever.`, `*blushes in ASCII*`,
          `*vibrates with joy*`, `More pets please!`, `*sparkles*`,
        ];
        const reaction = petLines[Math.floor(Math.random() * petLines.length)]!;
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
    async spawn(ctx, query) {
      const species = query.trim().toLowerCase();
      const { SPECIES } = await import('./constants.ts');
      if (!species || !(SPECIES as readonly string[]).includes(species)) {
        ctx.ui.notify(`Unknown species. Options: ${SPECIES.join(', ')}`, 'error');
        return;
      }
      try {
        const seed = randomSeed();
        const roll = rollBuddy(seed);
        // Override species with the requested one
        const baseBuddy: BuddyRecord = {
          id: makeBuddyId(seed, species),
          seed,
          createdAt: new Date().toISOString(),
          species: species as any,
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
        ctx.ui.notify(`Spawned ${buddy.name} the ${species}!`, 'success');
      } catch (err: any) {
        ctx.ui.notify(`Spawn error: ${err?.message || err}`, 'error');
      }
    },
    async rename(ctx, query) {
      const buddy = activeBuddy();
      if (!buddy) {
        ctx.ui.notify('No active buddy to rename.', 'error');
        return;
      }
      const newName = query.trim();
      if (!newName) {
        ctx.ui.notify('Usage: /buddy rename <new name>', 'error');
        return;
      }
      const oldName = buddy.name;
      buddy.name = newName;
      await save();
      syncStatus(ctx);
      ctx.ui.notify(`Renamed ${oldName} → ${newName}`, 'success');
    },
    async deleteBuddy(ctx) {
      const buddy = activeBuddy();
      if (!buddy) {
        ctx.ui.notify('No active buddy to delete.', 'error');
        return;
      }
      const ok = await ctx.ui.confirm('Delete buddy', `Delete ${buddy.name} forever?`);
      if (!ok) return;
      state.buddies = state.buddies.filter(b => b.id !== buddy.id);
      state.activeBuddyId = state.buddies.length > 0 ? state.buddies[state.buddies.length - 1]!.id : null;
      await save();
      syncStatus(ctx);
      ctx.ui.notify(`${buddy.name} has been released into the wild.`, 'info');
    },
    async model(ctx) {
      const available = ctx.modelRegistry.getAvailable();
      if (!available || available.length === 0) {
        ctx.ui.notify('No models available.', 'error');
        return;
      }
      const current = state.settings.preferredModel;
      const autoLabel = `Auto-detect${!current ? ' (current)' : ''}`;
      const modelLabels = available.map((m: any) => {
        const key = `${m.provider}/${m.id}`;
        return `${key}${current === key ? ' (current)' : ''}`;
      });
      const choices = [autoLabel, ...modelLabels];
      const selected = await ctx.ui.select('Buddy model', choices);
      if (selected == null) return;
      if (selected === autoLabel) {
        state.settings.preferredModel = undefined;
        await save();
        ctx.ui.notify('Buddy model: auto-detect', 'success');
      } else {
        const key = selected.replace(' (current)', '');
        state.settings.preferredModel = key;
        await save();
        ctx.ui.notify(`Buddy model: ${key}`, 'success');
      }
    },
    async test(ctx, query) {
      const buddy = activeBuddy();
      if (!buddy) {
        ctx.ui.notify('No active buddy yet. Use /buddy hatch.', 'info');
        return;
      }
      visual.animationState = 'thinking';
      visual.bubbleText = '...';
      visual.bubbleUntil = Date.now() + 15000;
      requestRender();

      const result = await testBuddyModelReaction(ctx, state, buddy, query, bubbleCharLimit(buddy));
      visual.animationState = 'idle';

      if (result.ok) {
        buddy.lastSaid = result.text;
        visual.bubbleText = result.text;
        visual.bubbleUntil = Date.now() + 10000;
        await save();
        requestRender();
        ctx.ui.notify(`Buddy AI test passed via ${result.modelKey}`, 'success');
        return;
      }

      const failureText = result.reason === 'no-model'
        ? 'No AI model available.'
        : result.reason === 'empty'
          ? 'AI returned no text.'
          : result.reason === 'aborted'
            ? 'AI test was aborted.'
            : `AI test failed${result.modelKey ? ` via ${result.modelKey}` : ''}.`;
      visual.bubbleText = null;
      visual.bubbleUntil = 0;
      requestRender();
      ctx.ui.notify(result.error ? `${failureText} ${result.error}` : failureText, 'error');
    },
  });

  pi.registerShortcut('ctrl+shift+b', {
    description: 'Toggle buddy visibility',
    handler: async (ctx) => {
      if (!state) return;
      state.settings.hidden = !state.settings.hidden;
      await save();
      syncStatus(ctx);
      ctx.ui.notify(state.settings.hidden ? 'Buddy hidden.' : 'Buddy visible.', 'info');
    },
  });

  pi.on('session_start', async (_event, ctx) => {
    state = await loadState();

    buddyRuntime = {
      getState: () => state,
      getActiveBuddy: () => activeBuddy(),
      getVisualState: () => visual,
    };

    lastInstalledBuddyId = state.activeBuddyId;
    installBuddyEditor(pi, ctx, buddyRuntime);

    // Animation loop: advance sprite frame, expire bubble/hearts
    if (animInterval) clearInterval(animInterval);
    animInterval = setInterval(() => {
      visual.tick += 1;
      if (visual.bubbleUntil && Date.now() > visual.bubbleUntil) visual.bubbleText = null;
      if (visual.animationState === 'petted' && Date.now() > visual.heartsUntil) visual.animationState = 'idle';
      requestRender();
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
    // Extract tool args from the assistant message's tool calls
    const toolCalls = Array.isArray(event.message?.content)
      ? event.message.content.filter((part: any) => part.type === 'toolCall')
      : [];
    const toolResultsWithArgs = (event.toolResults ?? []).map((tr: any) => {
      const call = toolCalls.find((tc: any) => tc.id === tr.toolCallId);
      return { ...tr, args: call?.arguments };
    });
    const summary = classifyTurn({ assistantText, toolResults: toolResultsWithArgs });
    const reaction = await maybeGenerateReaction(ctx, state, buddy, summary, completedTurns, lastReactionTurn, lastReactionAt, bubbleCharLimit(buddy));
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
    if (animInterval) { clearInterval(animInterval); animInterval = undefined; }
    clearBuddyEditor(ctx);
    await save();
  });
}

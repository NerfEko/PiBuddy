import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import { COMPACT_FACES, renderCompactFace } from './faces.ts';
import { IDLE_SEQUENCE } from './constants.ts';
import { renderHearts, renderReactionBubble } from './bubble.ts';
import { renderSprite } from './sprites.ts';
import { getHighestStat, getLowestStat } from './roll.ts';
import { getSidecarMode, SIDECAR_WIDTHS, starsForRarity } from './theme.ts';
import type { BuddyRecord, BuddyState } from './state.ts';

export { type BuddyVisualState } from './sidecar.ts';

export interface BuddyEditorRuntime {
  getState(): BuddyState;
  getActiveBuddy(): BuddyRecord | undefined;
  getVisualState(): import('./sidecar.ts').BuddyVisualState;
}

function buildWidgetLines(state: BuddyState, buddy: BuddyRecord | undefined, visual: import('./sidecar.ts').BuddyVisualState): string[] {
  if (state.settings.hidden || !buddy) return [];

  const now = Date.now();
  const frameToken = visual.animationState === 'idle'
    ? IDLE_SEQUENCE[visual.tick % IDLE_SEQUENCE.length]!
    : visual.animationState === 'speaking' ? 2 : 1;
  const blink = frameToken === -1;
  const frame = frameToken < 0 ? 0 : frameToken;

  const lines: string[] = [];

  if (visual.heartsUntil > now) lines.push(...renderHearts());

  const sprite = renderSprite(buddy.species, frame, buddy.eye, buddy.hat, blink);
  lines.push(...sprite);
  lines.push(`${buddy.name}${buddy.shiny ? ' ✨' : ''} ${starsForRarity(buddy.rarity)}`);

  const high = getHighestStat(buddy.stats);
  const low = getLowestStat(buddy.stats);
  lines.push(`↑ ${high.name}  ↓ ${low.name}`);

  if (visual.bubbleText && visual.bubbleUntil > now) {
    lines.push(`💬 ${visual.bubbleText}`);
  }

  return lines;
}

let widgetTimer: ReturnType<typeof setInterval> | undefined;

export function installBuddyWidget(pi: ExtensionAPI, ctx: ExtensionContext, runtime: BuddyEditorRuntime): void {
  if (!ctx.hasUI) return;

  const update = () => {
    const state = runtime.getState();
    const buddy = runtime.getActiveBuddy();
    const visual = runtime.getVisualState();
    const lines = buildWidgetLines(state, buddy, visual);
    if (lines.length > 0) {
      ctx.ui.setWidget('pi-buddy-sidecar', lines, { placement: 'belowEditor' });
    } else {
      ctx.ui.setWidget('pi-buddy-sidecar', undefined);
    }
  };

  // Clear any previous timer
  if (widgetTimer) clearInterval(widgetTimer);

  // Update on every animation tick
  widgetTimer = setInterval(update, 500);

  // Initial render
  update();
}

export function clearBuddyWidget(ctx: ExtensionContext): void {
  if (widgetTimer) {
    clearInterval(widgetTimer);
    widgetTimer = undefined;
  }
  if (ctx.hasUI) {
    ctx.ui.setWidget('pi-buddy-sidecar', undefined);
  }
}

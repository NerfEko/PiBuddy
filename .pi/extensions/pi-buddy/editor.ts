import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import { IDLE_SEQUENCE } from './constants.ts';
import { renderSprite } from './sprites.ts';
import { starsForRarity } from './theme.ts';
import type { BuddyRecord, BuddyState } from './state.ts';

export interface BuddyVisualState {
  animationState: 'idle' | 'thinking' | 'speaking' | 'petted';
  bubbleText: string | null;
  bubbleUntil: number;
  heartsUntil: number;
  tick: number;
}

export interface BuddyEditorRuntime {
  getState(): BuddyState;
  getActiveBuddy(): BuddyRecord | undefined;
  getVisualState(): BuddyVisualState;
}

/** Build a speech bubble above the sprite */
function buildBubbleLines(text: string, maxWidth: number): string[] {
  if (!text || maxWidth < 8) return [];
  const innerW = Math.max(4, maxWidth - 4);
  const words = text.split(/\s+/);
  const wrapped: string[] = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > innerW && cur) {
      wrapped.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) wrapped.push(cur);
  const lines = wrapped.slice(0, 3);
  const w = Math.max(...lines.map(l => l.length));
  return [
    `.-${'-'.repeat(w)}-.`,
    ...lines.map(l => `| ${l.padEnd(w)} |`),
    `'-${'-'.repeat(w)}-'`,
    `  \\`,
  ];
}

function buildWidgetLines(state: BuddyState, buddy: BuddyRecord, visual: BuddyVisualState): string[] {
  const now = Date.now();
  const frameToken = visual.animationState === 'idle'
    ? IDLE_SEQUENCE[visual.tick % IDLE_SEQUENCE.length]!
    : visual.animationState === 'speaking' ? 2 : 1;
  const blink = frameToken === -1;
  const frame = frameToken < 0 ? 0 : frameToken;

  const lines: string[] = [];

  // Bubble above sprite
  if (visual.bubbleText && visual.bubbleUntil > now) {
    lines.push(...buildBubbleLines(visual.bubbleText, 30));
  }

  // Hearts
  if (visual.heartsUntil > now) lines.push('♥  ♥  ♥');

  // Sprite
  const sprite = renderSprite(buddy.species, frame, buddy.eye, buddy.hat, blink);
  lines.push(...sprite);

  // Name line
  lines.push(`${buddy.name}${buddy.shiny ? ' ✨' : ''} ${starsForRarity(buddy.rarity)}`);

  return lines;
}

let widgetTimer: ReturnType<typeof setInterval> | undefined;

export function installBuddyWidget(pi: ExtensionAPI, ctx: ExtensionContext, runtime: BuddyEditorRuntime): void {
  if (!ctx.hasUI) return;

  const update = () => {
    const state = runtime.getState();
    const buddy = runtime.getActiveBuddy();
    const visual = runtime.getVisualState();

    // Tick animation
    visual.tick += 1;
    if (visual.bubbleUntil && Date.now() > visual.bubbleUntil) visual.bubbleText = null;
    if (visual.animationState === 'petted' && Date.now() > visual.heartsUntil) visual.animationState = 'idle';

    if (buddy && !state.settings.hidden) {
      const lines = buildWidgetLines(state, buddy, visual);
      // Right-align each line by padding with spaces on the left
      ctx.ui.setWidget('pi-buddy-sidecar', (_tui: any, _theme: any) => ({
        render(width: number) {
          return lines.map(line => {
            const pad = Math.max(0, width - line.length);
            return ' '.repeat(pad) + line;
          });
        },
        invalidate() {},
      }), { placement: 'belowEditor' });
    } else {
      ctx.ui.setWidget('pi-buddy-sidecar', undefined);
    }
  };

  if (widgetTimer) clearInterval(widgetTimer);
  widgetTimer = setInterval(update, 500);
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

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

/** Build a speech bubble */
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

let overlayHandle: any = null;
let animTimer: ReturnType<typeof setInterval> | undefined;

export function installBuddyOverlay(pi: ExtensionAPI, ctx: ExtensionContext, runtime: BuddyEditorRuntime): void {
  if (!ctx.hasUI) return;

  // Close any existing overlay
  if (overlayHandle) {
    try { overlayHandle.hide(); } catch {}
    overlayHandle = null;
  }
  if (animTimer) clearInterval(animTimer);

  // Create a persistent non-capturing overlay anchored bottom-right
  ctx.ui.custom<void>(
    (tui, _theme, _kb, _done) => {
      const component = {
        render(width: number): string[] {
          const state = runtime.getState();
          const buddy = runtime.getActiveBuddy();
          const visual = runtime.getVisualState();

          if (!buddy || state.settings.hidden) return [''];

          const now = Date.now();
          const frameToken = visual.animationState === 'idle'
            ? IDLE_SEQUENCE[visual.tick % IDLE_SEQUENCE.length]!
            : visual.animationState === 'speaking' ? 2 : 1;
          const blink = frameToken === -1;
          const frame = frameToken < 0 ? 0 : frameToken;

          const lines: string[] = [];

          // Bubble above sprite
          if (visual.bubbleText && visual.bubbleUntil > now) {
            lines.push(...buildBubbleLines(visual.bubbleText, width));
          }

          // Hearts
          if (visual.heartsUntil > now) lines.push('♥  ♥  ♥');

          // Sprite
          const sprite = renderSprite(buddy.species, frame, buddy.eye, buddy.hat, blink);
          lines.push(...sprite);

          // Name
          lines.push(`${buddy.name}${buddy.shiny ? ' ✨' : ''} ${starsForRarity(buddy.rarity)}`);

          return lines;
        },
        invalidate() {},
      };

      // Start animation timer
      animTimer = setInterval(() => {
        const visual = runtime.getVisualState();
        visual.tick += 1;
        if (visual.bubbleUntil && Date.now() > visual.bubbleUntil) visual.bubbleText = null;
        if (visual.animationState === 'petted' && Date.now() > visual.heartsUntil) visual.animationState = 'idle';
        tui.requestRender();
      }, 500);

      return component;
    },
    {
      overlay: true,
      overlayOptions: {
        anchor: 'bottom-right',
        width: 22,
        maxHeight: '40%',
        margin: { bottom: 5, right: 2, top: 0, left: 0 },
        nonCapturing: true,
      },
      onHandle: (handle: any) => {
        overlayHandle = handle;
      },
    },
  );
}

export function clearBuddyOverlay(ctx: ExtensionContext): void {
  if (animTimer) {
    clearInterval(animTimer);
    animTimer = undefined;
  }
  if (overlayHandle) {
    try { overlayHandle.hide(); } catch {}
    overlayHandle = null;
  }
}

export function requestBuddyRender(): void {
  // Overlay re-renders on its own timer
}

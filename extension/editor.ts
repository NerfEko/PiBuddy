import { CustomEditor, type ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { visibleWidth, type OverlayHandle } from '@mariozechner/pi-tui';
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

let buddyOverlayHandle: OverlayHandle | undefined;

function rpad(str: string, width: number): string {
  const vw = visibleWidth(str);
  if (vw >= width) return str;
  return str + ' '.repeat(width - vw);
}

function widest(lines: string[]): number {
  return lines.length > 0 ? Math.max(...lines.map((l) => visibleWidth(l))) : 0;
}

function getSpriteDisplay(runtime: BuddyEditorRuntime): {
  visible: boolean;
  spriteWidth: number;
  lines: string[];
} {
  const state = runtime.getState();
  const buddy = runtime.getActiveBuddy();
  const visual = runtime.getVisualState();

  if (!buddy || state.settings.hidden) {
    return { visible: false, spriteWidth: 0, lines: [] };
  }

  const now = Date.now();
  const frameToken = visual.animationState === 'idle'
    ? IDLE_SEQUENCE[visual.tick % IDLE_SEQUENCE.length]!
    : visual.animationState === 'speaking' ? 2 : 1;
  const blink = frameToken === -1;
  const frame = frameToken < 0 ? 0 : frameToken;

  const sprite = renderSprite(buddy.species, frame, buddy.eye, buddy.hat, blink);
  const nameLine = `${buddy.name}${buddy.shiny ? ' ✨' : ''} ${starsForRarity(buddy.rarity)}`;
  const spriteWidth = Math.max(widest(sprite), visibleWidth(nameLine));

  const showHearts = visual.heartsUntil > now;
  const heartsStr = showHearts ? '  ♥  ♥  ♥  '.slice(0, spriteWidth) : '';
  const spriteLines = [...sprite];
  let heartsInlined = false;
  if (heartsStr && spriteLines[0]?.trim() === '') {
    spriteLines[0] = heartsStr.padEnd(spriteWidth);
    heartsInlined = true;
  }

  const lines = [
    ...(!heartsInlined && heartsStr ? [heartsStr.padEnd(spriteWidth)] : []),
    ...spriteLines.map((l) => l.padEnd(spriteWidth)),
    nameLine.padEnd(spriteWidth),
  ];

  return { visible: true, spriteWidth, lines };
}

/** Overlay component: sprite + name only, no bubble */
class BuddySpriteOverlay {
  constructor(private runtime: BuddyEditorRuntime) {}

  render(width: number): string[] {
    const display = getSpriteDisplay(this.runtime);
    if (!display.visible) return [];
    return display.lines;
  }

  invalidate(): void {}
  dispose(): void {}
}

/** Editor: reserves horizontal space for sprite, renders bubble as extra line */
export class BuddyEditor extends CustomEditor {
  private runtime: BuddyEditorRuntime;
  private animTimer: ReturnType<typeof setInterval> | undefined;

  constructor(tui: any, theme: any, keybindings: any, runtime: BuddyEditorRuntime) {
    super(tui, theme, keybindings);
    this.runtime = runtime;
    this.animTimer = setInterval(() => {
      const visual = this.runtime.getVisualState();
      visual.tick += 1;
      if (visual.bubbleUntil && Date.now() > visual.bubbleUntil) visual.bubbleText = null;
      if (visual.animationState === 'petted' && Date.now() > visual.heartsUntil) visual.animationState = 'idle';
      this.tui.requestRender();
    }, 500);
  }

  render(width: number): string[] {
    const state = this.runtime.getState();
    const buddy = this.runtime.getActiveBuddy();
    const visual = this.runtime.getVisualState();

    if (!buddy || state.settings.hidden || width < 60) {
      return super.render(width);
    }

    const display = getSpriteDisplay(this.runtime);
    const reservedWidth = display.spriteWidth + 2;
    const editorWidth = Math.max(30, width - reservedWidth);
    const editorLines = super.render(editorWidth);
    const result = editorLines.map((l) => rpad(l, width));

    // If bubble is active, prepend a single | text | line above the editor
    const now = Date.now();
    const showBubble = visual.bubbleText && visual.bubbleUntil > now;
    if (showBubble) {
      const maxBubbleLen = width - reservedWidth - 4; // room for "| " and " |"
      let text = visual.bubbleText!;
      if (text.length > maxBubbleLen) text = text.slice(0, Math.max(1, maxBubbleLen - 1)) + '…';
      const bubbleLine = `| ${text} |`;
      // Right-align the bubble line to sit just left of the sprite area
      const padded = rpad(' '.repeat(Math.max(0, width - reservedWidth - visibleWidth(bubbleLine))) + bubbleLine, width);
      result.unshift(padded);
    }

    return result;
  }

  dispose(): void {
    if (this.animTimer) clearInterval(this.animTimer);
  }
}

function hideBuddyOverlay(): void {
  buddyOverlayHandle?.hide();
  buddyOverlayHandle = undefined;
}

export function installBuddyEditor(_pi: ExtensionAPI, ctx: any, runtime: BuddyEditorRuntime): void {
  if (!ctx.hasUI) return;

  hideBuddyOverlay();

  // Sprite-only overlay (small, fixed width, no bubble)
  void ctx.ui.custom<void>(
    (_tui: any, _theme: any, _keybindings: any, _done: (result: void) => void) => new BuddySpriteOverlay(runtime),
    {
      overlay: true,
      overlayOptions: {
        anchor: 'bottom-right' as const,
        width: 14,
        margin: { right: 1, bottom: 2 },
        nonCapturing: true,
        visible: (termWidth: number) => termWidth >= 60 && getSpriteDisplay(runtime).visible,
      },
      onHandle: (handle) => {
        buddyOverlayHandle = handle;
      },
    },
  );

  ctx.ui.setEditorComponent((tui: any, theme: any, keybindings: any) =>
    new BuddyEditor(tui, theme, keybindings, runtime),
  );
}

export function clearBuddyEditor(ctx: any): void {
  hideBuddyOverlay();
  if (ctx.hasUI) {
    ctx.ui.setEditorComponent(undefined);
  }
}

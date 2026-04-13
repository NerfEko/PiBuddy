import { CustomEditor, type ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { visibleWidth, type OverlayHandle } from '@mariozechner/pi-tui';
import { getBuddyDisplayWidth } from './bubble.ts';
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
  lastEditorWidth: number;
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

function clampBubbleTextToWidth(text: string, maxTextWidth: number): string {
  if (maxTextWidth <= 0) return '…';
  if (visibleWidth(text) <= maxTextWidth) return text;
  let out = text;
  while (out.length > 0 && visibleWidth(out + '…') > maxTextWidth) {
    out = out.slice(0, -1);
  }
  return out.length > 0 ? `${out}…` : '…';
}

function getSpriteDisplay(runtime: BuddyEditorRuntime): {
  visible: boolean;
  displayWidth: number;
  lines: string[];
} {
  const state = runtime.getState();
  const buddy = runtime.getActiveBuddy();
  const visual = runtime.getVisualState();

  if (!buddy || state.settings.hidden) {
    return { visible: false, displayWidth: 0, lines: [] };
  }

  const now = Date.now();
  const frameToken = visual.animationState === 'idle'
    ? IDLE_SEQUENCE[visual.tick % IDLE_SEQUENCE.length]!
    : visual.animationState === 'speaking' ? 2 : 1;
  const blink = frameToken === -1;
  const frame = frameToken < 0 ? 0 : frameToken;

  const sprite = renderSprite(buddy.species, frame, buddy.eye, buddy.hat, blink);
  const nameLine = `${buddy.name}${buddy.shiny ? ' ✨' : ''} ${starsForRarity(buddy.rarity)}`;
  const nameVW = visibleWidth(nameLine);

  // Find the minimum left indent of non-blank sprite lines (strip internal padding)
  const nonBlank = sprite.filter(l => l.trim().length > 0);
  const leftIndent = nonBlank.length > 0
    ? Math.min(...nonBlank.map(l => l.length - l.trimStart().length))
    : 0;
  const trimmedLines = sprite.map(l => l.slice(leftIndent).trimEnd());
  const visualSpriteWidth = Math.max(...trimmedLines.map(l => visibleWidth(l)), 1);

  // Display width = wider of trimmed sprite visual or name
  const displayWidth = Math.max(visualSpriteWidth, nameVW);
  // Center the visual sprite content over the name
  const spriteLeftPad = Math.max(0, Math.floor((displayWidth - visualSpriteWidth) / 2));

  const showHearts = visual.heartsUntil > now;
  const heartsStr = showHearts ? '  ♥  ♥  ♥  '.slice(0, displayWidth) : '';

  const spriteLines = [...sprite];
  let heartsInlined = false;
  if (heartsStr && spriteLines[0]?.trim() === '') {
    spriteLines[0] = heartsStr.padEnd(displayWidth);
    heartsInlined = true;
  }

  const lines = [
    ...(!heartsInlined && heartsStr ? [heartsStr.padEnd(displayWidth)] : []),
    ...trimmedLines.map((l) => (' '.repeat(spriteLeftPad) + l).padEnd(displayWidth)),
    nameLine,  // left-aligned
  ];

  return { visible: true, displayWidth, lines };
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

    visual.lastEditorWidth = width;

    const display = getSpriteDisplay(this.runtime);
    const reservedWidth = display.displayWidth + 1;
    const editorWidth = Math.max(30, width - reservedWidth);
    const editorLines = super.render(editorWidth);
    const result = editorLines.map((l) => rpad(l, width));

    // Always include a bubble line above the editor (empty when idle)
    // so the layout never shifts when buddy talks
    const now = Date.now();
    const showBubble = visual.bubbleText && visual.bubbleUntil > now;
    if (showBubble) {
      const bubbleChromeWidth = visibleWidth('[  ]-');
      const bubbleEndSafetyGutter = 2;
      const fullFitTextWidth = Math.max(1, width - reservedWidth - bubbleChromeWidth - bubbleEndSafetyGutter);
      const maxTextWidth = Math.max(1, Math.floor(fullFitTextWidth * (2 / 3)));
      const text = clampBubbleTextToWidth(visual.bubbleText!, maxTextWidth);
      const bubbleLine = `[ ${text} ]-`;
      const padded = rpad(' '.repeat(Math.max(0, width - reservedWidth - visibleWidth(bubbleLine))) + bubbleLine, width);
      result.unshift(padded);
    } else {
      result.unshift(rpad('', width));
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
        width: runtime.getActiveBuddy() ? getBuddyDisplayWidth(runtime.getActiveBuddy()!) : 0,
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

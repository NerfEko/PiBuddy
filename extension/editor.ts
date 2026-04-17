import { CustomEditor, type ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { visibleWidth, type OverlayHandle } from '@mariozechner/pi-tui';
import { getBuddyDisplayWidth, getBubbleTextCharLimit } from './bubble.ts';
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
let bubbleSpeechHandle: OverlayHandle | undefined;
let overlayTui: any = null;

export function requestOverlayRender(): void {
  overlayTui?.requestRender();
}

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

const BUDDY_TEXT_COLOR = "\x1b[38;5;225m";
const RESET_COLOR = "\x1b[0m";

function colorBuddyText(text: string): string {
  return `${BUDDY_TEXT_COLOR}${text}${RESET_COLOR}`;
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

  // Find the minimum left indent of non-blank sprite lines (strip internal padding)
  const nonBlank = sprite.filter(l => l.trim().length > 0);
  const leftIndent = nonBlank.length > 0
    ? Math.min(...nonBlank.map(l => l.length - l.trimStart().length))
    : 0;
  const trimmedLines = sprite.map(l => l.slice(leftIndent).trimEnd());
  const visualSpriteWidth = Math.max(...trimmedLines.map(l => visibleWidth(l)), 1);

  // Keep editor reservation in sync with the fixed overlay width.
  const displayWidth = getBuddyDisplayWidth(buddy);
  // Center the visual sprite content over the fixed display width.
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

/** Speech bubble overlay — top-left of the sprite */
class BubbleSpeechOverlay {
  constructor(private runtime: BuddyEditorRuntime) {}

  render(width: number): string[] {
    const visual = this.runtime.getVisualState();
    const state = this.runtime.getState();
    const buddy = this.runtime.getActiveBuddy();
    if (!visual.bubbleText || Date.now() >= visual.bubbleUntil || !buddy || state.settings.hidden) {
      return [];
    }

    const innerWidth = Math.max(1, width - 4); // "│ " + " │"
    const words = visual.bubbleText.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (visibleWidth(test) <= innerWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        current = word.slice(0, innerWidth);
      }
    }
    if (current) lines.push(current);
    if (lines.length === 0) return [];

    const bar = '─'.repeat(width - 2);
    return [
      `╭${bar}╮`,
      ...lines.map(l => `│ ${l.padEnd(innerWidth)} │`),
      `╰${bar}╯`,
      `${'  '.repeat(Math.floor((width - 2) / 2))}╲`,
    ];
  }

  invalidate(): void {}
  dispose(): void {}
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

    // Always reserve one bubble row so layout stays stable.
    const now = Date.now();
    const showBubble = visual.bubbleText && visual.bubbleUntil > now;
    const bubbleAreaWidth = Math.max(1, width - reservedWidth);
    if (showBubble) {
      const maxTextWidth = getBubbleTextCharLimit(width, buddy);
      const text = clampBubbleTextToWidth(visual.bubbleText!, maxTextWidth);
      const bubbleLine = `[ ${colorBuddyText(text)} ]-`;
      const padded = rpad(' '.repeat(Math.max(0, bubbleAreaWidth - visibleWidth(bubbleLine))) + bubbleLine, width);
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
  bubbleSpeechHandle?.hide();
  bubbleSpeechHandle = undefined;
}

export function installBuddyEditor(_pi: ExtensionAPI, ctx: any, runtime: BuddyEditorRuntime): void {
  if (!ctx.hasUI) return;

  hideBuddyOverlay();

  const spriteWidth = runtime.getActiveBuddy() ? getBuddyDisplayWidth(runtime.getActiveBuddy()!) : 20;
  const bubbleWidth = 32;

  // Speech bubble overlay — positioned top-left of the sprite
  void ctx.ui.custom<void>(
    (_tui: any, _theme: any, _keybindings: any, _done: (result: void) => void) => new BubbleSpeechOverlay(runtime),
    {
      overlay: true,
      overlayOptions: {
        anchor: 'bottom-right' as const,
        width: bubbleWidth,
        margin: { right: spriteWidth + 3, bottom: 6 },
        nonCapturing: true,
        visible: (termWidth: number) => {
          const v = runtime.getVisualState();
          return termWidth >= 80 && !!runtime.getActiveBuddy() &&
            !runtime.getState().settings.hidden &&
            !!v.bubbleText && Date.now() < v.bubbleUntil;
        },
      },
      onHandle: (handle) => { bubbleSpeechHandle = handle; },
    },
  );

  // Sprite-only overlay (small, fixed width, no bubble)
  void ctx.ui.custom<void>(
    (_tui: any, _theme: any, _keybindings: any, _done: (result: void) => void) => {
      overlayTui = _tui;
      return new BuddySpriteOverlay(runtime);
    },
    {
      overlay: true,
      overlayOptions: {
        anchor: 'bottom-right' as const,
        width: runtime.getActiveBuddy() ? getBuddyDisplayWidth(runtime.getActiveBuddy()!) : 0,
        margin: { right: 2, bottom: 2 },
        nonCapturing: true,
        visible: (termWidth: number) => termWidth >= 60 && getSpriteDisplay(runtime).visible,
      },
      onHandle: (handle) => {
        buddyOverlayHandle = handle;
      },
    },
  );
}

export function clearBuddyEditor(ctx: any): void {
  hideBuddyOverlay();
}

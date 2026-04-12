import { CustomEditor, type ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { ExtensionContext } from '@mariozechner/pi-coding-agent';
import { visibleWidth } from '@mariozechner/pi-tui';
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

/** Build a single-line speech bubble */
function buildBubbleLine(text: string): string {
  if (!text) return '';
  return `< ${text} >`;
}

/** Right-pad a string that may have ANSI to a visible width */
function rpad(str: string, width: number): string {
  const vw = visibleWidth(str);
  if (vw >= width) return str;
  return str + ' '.repeat(width - vw);
}

/** Overwrite a region of a line with plain text at a given column offset from right */
function overlayRight(baseLine: string, overlayStr: string, totalWidth: number, rightOffset: number): string {
  const overlayLen = overlayStr.length;
  const startCol = totalWidth - overlayLen - rightOffset;
  if (startCol <= 0) return baseLine;

  const padded = rpad(baseLine, totalWidth);

  // Walk the string tracking visible char positions to find cut point
  let visCount = 0;
  let cutIndex = 0;
  let inEsc = false;
  for (let i = 0; i < padded.length; i++) {
    if (padded[i] === '\x1b') inEsc = true;
    if (!inEsc) {
      if (visCount >= startCol) {
        cutIndex = i;
        break;
      }
      visCount++;
    }
    if (inEsc && padded[i] === 'm') inEsc = false;
    cutIndex = i + 1;
  }
  return padded.slice(0, cutIndex) + '\x1b[0m' + overlayStr;
}

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

    const now = Date.now();
    const frameToken = visual.animationState === 'idle'
      ? IDLE_SEQUENCE[visual.tick % IDLE_SEQUENCE.length]!
      : visual.animationState === 'speaking' ? 2 : 1;
    const blink = frameToken === -1;
    const frame = frameToken < 0 ? 0 : frameToken;

    // Build sprite + name
    const sprite = renderSprite(buddy.species, frame, buddy.eye, buddy.hat, blink);
    const nameLine = `${buddy.name}${buddy.shiny ? ' ✨' : ''} ${starsForRarity(buddy.rarity)}`;
    const spriteWidth = Math.max(...sprite.map(l => l.length));
    const hearts = visual.heartsUntil > now ? '  ♥  ♥  ♥  '.slice(0, spriteWidth) : '';

    // Buddy panel lines (hearts on top, then sprite, then name)
    const panelLines = [...(hearts ? [hearts.padEnd(spriteWidth)] : []), ...sprite, nameLine.padEnd(spriteWidth)];

    // Render editor at reduced width so text wraps before hitting the buddy
    const buddyReserved = spriteWidth + 2;
    const editorWidth = Math.max(30, width - buddyReserved);
    const editorLines = super.render(editorWidth);

    // Pad editor lines back to full width for overlaying
    const result = editorLines.map(l => rpad(l, width));
    const rightOffset = 0;

    // How many panel lines fit in the editor
    const fitsInEditor = Math.min(panelLines.length, result.length);
    // Lines that overflow above the editor
    const overflowCount = panelLines.length - fitsInEditor;

    // Paint what fits into editor lines (bottom-aligned)
    for (let i = 0; i < fitsInEditor; i++) {
      const panelIdx = overflowCount + i;
      const lineIdx = result.length - fitsInEditor + i;
      if (lineIdx >= 0 && lineIdx < result.length) {
        result[lineIdx] = overlayRight(result[lineIdx]!, panelLines[panelIdx]!, width, rightOffset);
      }
    }

    // Prepend overflow lines above the editor
    const aboveLines: string[] = [];

    // Build single-line bubble if active — goes on its own line above everything
    const showBubble = visual.bubbleText && visual.bubbleUntil > now;
    if (showBubble) {
      const bubbleLine = buildBubbleLine(visual.bubbleText!);
      // Right-align it so it ends just before the sprite area
      const spriteStart = width - spriteWidth - rightOffset;
      const bubblePos = Math.max(0, spriteStart - bubbleLine.length - 1);
      aboveLines.push(' '.repeat(bubblePos) + bubbleLine);
    }

    // Sprite overflow lines
    for (let i = 0; i < overflowCount; i++) {
      const spritePart = panelLines[i]!;
      const pad = Math.max(0, width - spritePart.length - rightOffset);
      aboveLines.push(' '.repeat(pad) + spritePart);
    }

    if (aboveLines.length > 0) {
      return [...aboveLines, ...result];
    }

    return result;
  }
}

export function installBuddyEditor(pi: ExtensionAPI, ctx: any, runtime: BuddyEditorRuntime): void {
  if (!ctx.hasUI) return;
  ctx.ui.setEditorComponent((tui: any, theme: any, keybindings: any) =>
    new BuddyEditor(tui, theme, keybindings, runtime),
  );
}

export function clearBuddyEditor(ctx: any): void {
  if (ctx.hasUI) {
    ctx.ui.setEditorComponent(undefined);
  }
  dismissBubble();
}

let bubbleHandle: any = null;
let bubbleTimer: ReturnType<typeof setInterval> | undefined;

function dismissBubble(): void {
  if (bubbleHandle) {
    try { bubbleHandle.hide(); } catch {}
    bubbleHandle = null;
  }
  if (bubbleTimer) {
    clearInterval(bubbleTimer);
    bubbleTimer = undefined;
  }
}

export function showBubbleOverlay(ctx: ExtensionContext, runtime: BuddyEditorRuntime): void {
  if (!ctx.hasUI) return;
  dismissBubble();

  ctx.ui.custom<void>(
    (tui, _theme, _kb, _done) => {
      const component = {
        render(width: number): string[] {
          const visual = runtime.getVisualState();
          if (!visual.bubbleText || visual.bubbleUntil <= Date.now()) return [''];
          const lines = buildBubbleLines(visual.bubbleText, Math.min(width, 34));
          // Right-align within the overlay
          return lines.map(l => {
            const pad = Math.max(0, width - l.length);
            return ' '.repeat(pad) + l;
          });
        },
        invalidate() {},
      };
      bubbleTimer = setInterval(() => {
        const visual = runtime.getVisualState();
        if (!visual.bubbleText || visual.bubbleUntil <= Date.now()) {
          dismissBubble();
          return;
        }
        tui.requestRender();
      }, 500);
      return component;
    },
    {
      overlay: true,
      overlayOptions: {
        anchor: 'bottom-right',
        width: 36,
        maxHeight: '20%',
        margin: { bottom: 8, right: 0, top: 0, left: 0 },
        nonCapturing: true,
      },
      onHandle: (handle: any) => {
        bubbleHandle = handle;
      },
    },
  );
}

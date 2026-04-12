import { CustomEditor, type ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { ExtensionContext } from '@mariozechner/pi-coding-agent';
import { visibleWidth } from '@mariozechner/pi-tui';
import { IDLE_SEQUENCE, SPRITES } from './constants.ts';
import { renderSprite, substituteEyes } from './sprites.ts';
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
function buildBubbleLine(text: string): string {
  if (!text) return '';
  return `| ${text} |`;
}

function buildBubbleTop(text: string): string {
  return `.-${'-'.repeat(text.length + 2)}-.`;
}

function buildBubbleBot(text: string): string {
  return `'-${'-'.repeat(text.length + 2)}-'`;
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
    const showBubble = visual.bubbleText && visual.bubbleUntil > now;
    const showHearts = visual.heartsUntil > now;
    const heartsStr = showHearts ? '  ♥  ♥  ♥  '.slice(0, spriteWidth) : '';

    // If hearts active and first sprite line is blank, replace it with hearts
    // Otherwise add hearts as a separate line above
    const spriteLines = [...sprite];
    let heartsInlined = false;
    if (heartsStr && spriteLines[0]?.trim() === '') {
      spriteLines[0] = heartsStr.padEnd(spriteWidth);
      heartsInlined = true;
    }

    const panelLines = [
      ...(!heartsInlined && heartsStr ? [heartsStr.padEnd(spriteWidth)] : []),
      ...spriteLines.map(line => line.padEnd(spriteWidth)),
      nameLine.padEnd(spriteWidth),
    ];

    // Render editor at reduced width so text wraps before hitting the buddy
    const buddyReserved = spriteWidth + 2;
    const editorWidth = Math.max(30, width - buddyReserved);
    const editorLines = super.render(editorWidth);

    // Pad editor lines back to full width for overlaying
    const result = editorLines.map(l => rpad(l, width));
    const rightOffset = 0;

    // Pre-compute max non-blank overflow across all frames so layout is stable during animation
    const allFrames = SPRITES[buddy.species];
    let maxStableOverflow = 0;
    for (const fr of allFrames) {
      const frLines = [...fr.map(l => substituteEyes(l, buddy.eye))];
      // Hearts may replace blank line 0
      let start = 0;
      while (start < frLines.length && frLines[start]!.trim() === '') start++;
      const overflow = Math.max(0, (frLines.length + 1) - result.length); // +1 for name line
      const nonBlankOverflow = overflow - start;
      if (nonBlankOverflow > maxStableOverflow) maxStableOverflow = nonBlankOverflow;
    }

    // How many panel lines fit in the editor
    const fitsInEditor = Math.min(panelLines.length, result.length);
    const rawOverflow = panelLines.length - fitsInEditor;

    // Skip blank sprite lines at the top of overflow
    let overflowStart = 0;
    while (overflowStart < rawOverflow && panelLines[overflowStart]!.trim() === '') {
      overflowStart++;
    }
    const trimmedOverflow = rawOverflow - overflowStart;
    // Use the stable max so layout doesn't shift between animation frames
    const overflowCount = showBubble ? Math.min(maxStableOverflow, 3) : maxStableOverflow;
    const panelShift = rawOverflow - Math.min(overflowCount, trimmedOverflow) - Math.max(0, overflowCount - trimmedOverflow);
    const actualOverflow = Math.min(overflowCount, trimmedOverflow);

    // Paint what fits into editor lines (bottom-aligned), skipping top lines if capped
    for (let i = 0; i < fitsInEditor; i++) {
      const panelIdx = actualOverflow + panelShift + i;
      const lineIdx = result.length - fitsInEditor + i;
      if (lineIdx >= 0 && lineIdx < result.length) {
        result[lineIdx] = overlayRight(result[lineIdx]!, panelLines[panelIdx]!, width, rightOffset);
      }
    }

    // Bubble
    const bubbleText = showBubble ? visual.bubbleText! : '';
    const bubbleContent = bubbleText ? buildBubbleLine(bubbleText) : '';
    const bubbleTopLine = bubbleText ? buildBubbleTop(bubbleText) : '';
    const bubbleBotLine = bubbleText ? buildBubbleBot(bubbleText) : '';

    // (bubble borders are rendered in the overflow lines above the editor)

    // Prepend overflow lines above the editor
    const aboveLines: string[] = [];

    // Overflow lines: bubble (left) + sprite head (right)
    for (let i = 0; i < actualOverflow; i++) {
      const spritePart = panelLines[panelShift + i]!;
      const pad = Math.max(0, width - spritePart.length - rightOffset);
      const available = pad - 1;

      let bubblePart = '';
      if (bubbleContent && actualOverflow >= 3) {
        if (i === 0) bubblePart = bubbleTopLine;
        else if (i === 1) bubblePart = bubbleContent;
        else if (i === 2) bubblePart = bubbleBotLine;
      } else if (bubbleContent && i === actualOverflow - 1) {
        // Only put bubble on the last overflow line when not enough room for full box
        bubblePart = bubbleContent;
      }

      if (bubblePart && available > bubblePart.length) {
        const bPad = available - bubblePart.length;
        aboveLines.push(' '.repeat(bPad) + bubblePart + ' ' + spritePart.padEnd(spriteWidth));
      } else if (bubblePart) {
        aboveLines.push(bubblePart.slice(0, Math.max(0, available)) + ' ' + spritePart.padEnd(spriteWidth));
      } else {
        aboveLines.push(' '.repeat(pad) + spritePart);
      }
    }

    // If no overflow lines but bubble is active, put bubble on the first editor line
    if (actualOverflow === 0 && bubbleText) {
      const firstEditorLine = result[0] ?? '';
      const spriteStart = width - spriteWidth - rightOffset;
      const available = spriteStart - 1;
      if (available > bubbleText.length) {
        const bPad = available - bubbleText.length;
        result[0] = overlayRight(' '.repeat(bPad) + bubbleText + ' '.repeat(spriteWidth + 1), result[0]!, width, rightOffset);
      }
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
}

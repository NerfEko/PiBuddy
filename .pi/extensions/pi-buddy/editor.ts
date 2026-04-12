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

    // Render editor at FULL width — no squishing
    const editorLines = super.render(width);

    if (!buddy || state.settings.hidden || width < 60) {
      return editorLines;
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

    // Build bubble to the LEFT of the sprite if active
    const showBubble = visual.bubbleText && visual.bubbleUntil > now;
    const bubbleMaxW = Math.min(34, width - spriteWidth - 4);
    const bubble = showBubble ? buildBubbleLines(visual.bubbleText!, bubbleMaxW) : [];
    const bubbleWidth = bubble.length > 0 ? Math.max(...bubble.map(l => l.length)) : 0;

    // Build sprite column (hearts on top, sprite, name)
    const spriteCol = [...(hearts ? [hearts.padEnd(spriteWidth)] : []), ...sprite, nameLine.padEnd(spriteWidth)];

    // Merge bubble and sprite side by side, bottom-aligned to sprite
    const mergedHeight = Math.max(spriteCol.length, bubble.length);
    const bubbleOffset = mergedHeight - bubble.length;
    const gapW = bubble.length > 0 ? 1 : 0;
    const panelLines: string[] = [];
    for (let i = 0; i < mergedHeight; i++) {
      const sLine = (spriteCol[i] ?? '').padEnd(spriteWidth);
      const bIdx = i - bubbleOffset;
      if (bubble.length > 0) {
        const bLine = bIdx >= 0 && bIdx < bubble.length ? bubble[bIdx]!.padEnd(bubbleWidth) : ' '.repeat(bubbleWidth);
        panelLines.push(bLine + ' '.repeat(gapW) + sLine);
      } else {
        panelLines.push(sLine);
      }
    }

    // Overlay the buddy panel onto the editor lines
    // Name line sits on the last editor line. Sprite extends ABOVE if needed.
    const result = [...editorLines];
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

    // Prepend overflow lines above the editor (just sprite top, NO bubble here)
    const aboveLines: string[] = [];

    // Sprite overflow lines only
    for (let i = 0; i < overflowCount; i++) {
      const pad = Math.max(0, width - panelLines[i]!.length - rightOffset);
      aboveLines.push(' '.repeat(pad) + panelLines[i]!);
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

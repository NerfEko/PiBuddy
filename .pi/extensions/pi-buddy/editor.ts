import { CustomEditor, type ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { truncateToWidth, visibleWidth } from '@mariozechner/pi-tui';
import { COMPACT_FACES, renderCompactFace } from './faces.ts';
import { IDLE_SEQUENCE } from './constants.ts';
import { renderSprite } from './sprites.ts';
import { getHighestStat, getLowestStat } from './roll.ts';
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

/** Pad a string (possibly with ANSI) to exact visible width */
function padToWidth(str: string, width: number): string {
  const vw = visibleWidth(str);
  if (vw >= width) return truncateToWidth(str, width);
  return str + ' '.repeat(width - vw);
}

/** Build a small ASCII speech bubble to the right of the sprite */
function buildBubbleLines(text: string, maxWidth: number): string[] {
  if (!text || maxWidth < 8) return [];
  const innerW = Math.min(maxWidth - 4, text.length);
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > innerW && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  const wrapped = lines.slice(0, 3);
  const w = Math.max(...wrapped.map(l => l.length));
  return [
    `.-${'-'.repeat(w)}-.`,
    ...wrapped.map(l => `| ${l.padEnd(w)} |`),
    `'-${'-'.repeat(w)}-'`,
  ];
}

/** Build the right-side buddy panel lines */
function buildBuddyPanel(buddy: BuddyRecord, visual: BuddyVisualState, panelWidth: number): string[] {
  const now = Date.now();
  const frameToken = visual.animationState === 'idle'
    ? IDLE_SEQUENCE[visual.tick % IDLE_SEQUENCE.length]!
    : visual.animationState === 'speaking' ? 2 : 1;
  const blink = frameToken === -1;
  const frame = frameToken < 0 ? 0 : frameToken;

  const sprite = renderSprite(buddy.species, frame, buddy.eye, buddy.hat, blink);
  const spriteWidth = Math.max(...sprite.map(l => l.length));

  // Build bubble if active
  const showBubble = visual.bubbleText && visual.bubbleUntil > now;
  const bubbleMaxW = panelWidth - spriteWidth - 1;
  const bubble = showBubble ? buildBubbleLines(visual.bubbleText!, bubbleMaxW) : [];

  // Hearts
  const showHearts = visual.heartsUntil > now;

  const lines: string[] = [];
  if (showHearts) lines.push('♥  ♥  ♥');

  // Merge sprite + bubble side by side
  const mergedHeight = Math.max(sprite.length, bubble.length);
  for (let i = 0; i < mergedHeight; i++) {
    const sLine = sprite[i] ?? '';
    const bLine = bubble[i] ?? '';
    const padded = sLine.padEnd(spriteWidth);
    const combined = bLine ? `${padded} ${bLine}` : padded;
    lines.push(combined);
  }

  // Name + info line
  const info = `${buddy.name}${buddy.shiny ? ' ✨' : ''} ${starsForRarity(buddy.rarity)}`;
  lines.push(info);

  return lines;
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

    // No buddy or hidden: render editor normally
    if (!buddy || state.settings.hidden || width < 60) {
      return super.render(width);
    }

    // Calculate panel width — give most space to editor
    const panelWidth = Math.min(36, Math.max(16, Math.floor(width * 0.25)));
    const gap = 1;
    const editorWidth = width - panelWidth - gap;

    // Render editor at reduced width
    const editorLines = super.render(editorWidth);

    // Build buddy panel
    const panelLines = buildBuddyPanel(buddy, visual, panelWidth);

    // Merge: editor on left, buddy on right
    // Buddy panel is bottom-aligned with the editor
    const totalLines = Math.max(editorLines.length, panelLines.length);
    const panelOffset = totalLines - panelLines.length;
    const merged: string[] = [];

    for (let i = 0; i < totalLines; i++) {
      const left = padToWidth(editorLines[i] ?? '', editorWidth);
      const panelIdx = i - panelOffset;
      const right = panelIdx >= 0 && panelIdx < panelLines.length
        ? truncateToWidth(panelLines[panelIdx]!, panelWidth)
        : '';
      merged.push(truncateToWidth(`${left}${' '.repeat(gap)}${right}`, width));
    }

    return merged;
  }
}

export function installBuddyEditor(pi: ExtensionAPI, ctx: any, runtime: BuddyEditorRuntime): void {
  if (!ctx.hasUI) return;
  ctx.ui.setEditorComponent((tui: any, theme: any, keybindings: any) =>
    new BuddyEditor(tui, theme, keybindings, runtime),
  );
}

export function clearBuddyWidget(ctx: any): void {
  if (ctx.hasUI) {
    ctx.ui.setEditorComponent(undefined);
  }
}

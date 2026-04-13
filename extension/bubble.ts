import { renderSprite } from './sprites.ts';
import type { BuddyRecord } from './state.ts';
import { starsForRarity } from './theme.ts';

const visibleWidth = (text: string) => text.length;
const BUBBLE_CHROME_WIDTH = visibleWidth('[  ]-');
const BUDDY_OVERLAY_RIGHT_MARGIN = 1;
const MAX_BUBBLE_TEXT_CHARS = 360;
const BUBBLE_TEXT_USAGE_RATIO = 2 / 3;

export function wrapText(text: string, width: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function renderReactionBubble(text: string, width = 22): string[] {
  const content = wrapText(text, Math.max(8, width - 4)).slice(0, 3);
  if (content.length === 0) return [];
  const innerWidth = Math.max(...content.map((line) => line.length));
  const top = `.${'-'.repeat(innerWidth + 2)}.`;
  const body = content.map((line) => `| ${line.padEnd(innerWidth)} |`);
  return [top, ...body, `'${'-'.repeat(innerWidth + 2)}'`];
}

export function renderHearts(): string[] {
  return ['  ♥  ♥  ♥  '];
}

export function getBuddyDisplayWidth(buddy: BuddyRecord): number {
  const sprite = renderSprite(buddy.species, 0, buddy.eye, buddy.hat, false);
  const nameLine = `${buddy.name}${buddy.shiny ? ' ✨' : ''} ${starsForRarity(buddy.rarity)}`;
  const nameVW = visibleWidth(nameLine);
  const nonBlank = sprite.filter((l) => l.trim().length > 0);
  const leftIndent = nonBlank.length > 0
    ? Math.min(...nonBlank.map((l) => l.length - l.trimStart().length))
    : 0;
  const trimmedLines = sprite.map((l) => l.slice(leftIndent).trimEnd());
  const visualSpriteWidth = Math.max(...trimmedLines.map((l) => visibleWidth(l)), 1);
  return Math.max(visualSpriteWidth, nameVW);
}

export function getBubbleTextCharLimit(termWidth: number, buddy: BuddyRecord, hardCap = MAX_BUBBLE_TEXT_CHARS): number {
  const reservedWidth = getBuddyDisplayWidth(buddy) + BUDDY_OVERLAY_RIGHT_MARGIN;
  const availableWidth = Math.max(0, termWidth - reservedWidth);
  const fitLimit = Math.max(1, availableWidth - BUBBLE_CHROME_WIDTH);
  const preferredLimit = Math.max(1, Math.floor(fitLimit * BUBBLE_TEXT_USAGE_RATIO));
  return Math.max(1, Math.min(hardCap, preferredLimit));
}

export function clampBubbleTextToTerminal(text: string, termWidth: number, buddy: BuddyRecord, hardCap = MAX_BUBBLE_TEXT_CHARS): string {
  const limit = getBubbleTextCharLimit(termWidth, buddy, hardCap);
  if (text.length <= limit) return text;
  return text.slice(0, Math.max(1, limit - 1)) + '…';
}

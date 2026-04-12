import { COMPACT_FACES, renderCompactFace } from './faces.ts';
import { IDLE_SEQUENCE } from './constants.ts';
import { renderHearts, renderReactionBubble } from './bubble.ts';
import { renderSprite } from './sprites.ts';
import { getHighestStat, getLowestStat } from './roll.ts';
import { getSidecarMode, SIDECAR_WIDTHS, starsForRarity } from './theme.ts';
import type { BuddyRecord, BuddyState } from './state.ts';
export interface BuddyVisualState {
  animationState: 'idle' | 'thinking' | 'speaking' | 'petted';
  bubbleText: string | null;
  bubbleUntil: number;
  heartsUntil: number;
  tick: number;
}

function truncate(line: string, width: number): string {
  return line.length <= width ? line : line.slice(0, width);
}

export function buildSidecarLines(totalWidth: number, state: BuddyState, buddy: BuddyRecord | undefined, visual: BuddyVisualState): { width: number; lines: string[] } {
  const mode = getSidecarMode(totalWidth, state.settings.compactMode);
  if (mode === 'hidden' || state.settings.hidden || !buddy) return { width: 0, lines: [] };

  const now = Date.now();
  const sidecarWidth = mode === 'wide' ? SIDECAR_WIDTHS.wide : mode === 'medium' ? SIDECAR_WIDTHS.medium : SIDECAR_WIDTHS.compact;
  const frameToken = visual.animationState === 'idle' ? IDLE_SEQUENCE[visual.tick % IDLE_SEQUENCE.length]! : visual.animationState === 'speaking' ? 2 : 1;
  const blink = frameToken === -1;
  const frame = frameToken < 0 ? 0 : frameToken;
  const lines: string[] = [];

  if (visual.heartsUntil > now) lines.push(...renderHearts());
  if (visual.bubbleText && visual.bubbleUntil > now && mode !== 'compact') {
    lines.push(...renderReactionBubble(visual.bubbleText, sidecarWidth));
  }

  if (mode === 'compact') {
    lines.push(truncate(`${renderCompactFace(COMPACT_FACES[buddy.species], buddy.eye)} ${buddy.name}`, sidecarWidth));
    lines.push(truncate(starsForRarity(buddy.rarity), sidecarWidth));
    return { width: sidecarWidth, lines };
  }

  const sprite = renderSprite(buddy.species, frame, buddy.eye, buddy.hat, blink);
  lines.push(...sprite.map((line) => truncate(line, sidecarWidth)));
  lines.push(truncate(`${buddy.name}${buddy.shiny ? ' ✨' : ''}`, sidecarWidth));
  lines.push(truncate(starsForRarity(buddy.rarity), sidecarWidth));

  if (mode === 'wide') {
    const high = getHighestStat(buddy.stats);
    const low = getLowestStat(buddy.stats);
    lines.push(truncate(`↑ ${high.name}`, sidecarWidth));
    lines.push(truncate(`↓ ${low.name}`, sidecarWidth));
  }

  return { width: sidecarWidth, lines };
}

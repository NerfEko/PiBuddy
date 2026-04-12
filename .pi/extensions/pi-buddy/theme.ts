import { RARITY_STARS, type Rarity } from './constants.ts';

export const SIDECAR_WIDTHS = {
  wide: 26,
  medium: 18,
  compact: 12,
} as const;

export function getSidecarMode(totalWidth: number, compactMode: 'auto' | 'force-compact' | 'force-full') {
  if (compactMode === 'force-compact') return totalWidth >= 60 ? 'compact' : 'hidden';
  if (compactMode === 'force-full') {
    if (totalWidth >= 110) return 'wide';
    if (totalWidth >= 90) return 'medium';
    return totalWidth >= 75 ? 'compact' : 'hidden';
  }
  if (totalWidth >= 110) return 'wide';
  if (totalWidth >= 90) return 'medium';
  if (totalWidth >= 75) return 'compact';
  return 'hidden';
}

export function starsForRarity(rarity: Rarity): string {
  return RARITY_STARS[rarity];
}

export function statBar(value: number, width = 12): string {
  const filled = Math.max(0, Math.min(width, Math.round((value / 100) * width)));
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}

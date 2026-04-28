import { visibleWidth } from "@mariozechner/pi-tui";
import { renderSprite } from "./sprites.ts";
import type { BuddyRecord } from "./state.ts";
import { starsForRarity } from "./theme.ts";

const BUBBLE_CHROME_WIDTH = visibleWidth("[  ]-");
const BUDDY_OVERLAY_RIGHT_MARGIN = 1;
const MAX_BUBBLE_TEXT_CHARS = 360;

function getBubbleSizing(
	termWidth: number,
	buddy: BuddyRecord,
): { fitLimit: number; preferredLimit: number } {
	const reservedWidth =
		getBuddyDisplayWidth(buddy) + BUDDY_OVERLAY_RIGHT_MARGIN;
	const availableWidth = Math.max(0, termWidth - reservedWidth);
	const baseFitLimit = Math.max(1, availableWidth - BUBBLE_CHROME_WIDTH);

	// Small terminals need extra safety room or the last characters still get visually clipped.
	const safetyGutter =
		baseFitLimit < 70 ? 8 : baseFitLimit < 100 ? 6 : baseFitLimit < 140 ? 4 : 2;
	const fitLimit = Math.max(1, baseFitLimit - safetyGutter);

	// Aim for at most two wrapped lines on narrow terminals, growing with space.
	const usageRatio =
		fitLimit < 70 ? 1.6 : fitLimit < 100 ? 1.75 : fitLimit < 140 ? 1.9 : 2.0;
	const preferredLimit = Math.max(1, Math.floor(fitLimit * usageRatio));
	return { fitLimit, preferredLimit };
}

export function getBuddyDisplayWidth(buddy: BuddyRecord): number {
	const sprite = renderSprite(buddy.species, 0, buddy.eye, buddy.hat, false);
	const nameLine = `${buddy.name}${buddy.shiny ? " ✨" : ""} ${starsForRarity(buddy.rarity)}`;
	const nameVW = visibleWidth(nameLine);
	const nonBlank = sprite.filter((l) => l.trim().length > 0);
	const leftIndent =
		nonBlank.length > 0
			? Math.min(...nonBlank.map((l) => l.length - l.trimStart().length))
			: 0;
	const trimmedLines = sprite.map((l) => l.slice(leftIndent).trimEnd());
	const visualSpriteWidth = Math.max(
		...trimmedLines.map((l) => visibleWidth(l)),
		1,
	);
	return Math.max(visualSpriteWidth, nameVW);
}

export function getBubbleFitLimit(
	termWidth: number,
	buddy: BuddyRecord,
): number {
	const { fitLimit } = getBubbleSizing(termWidth, buddy);
	return fitLimit;
}

export function getBubbleTextCharLimit(
	termWidth: number,
	buddy: BuddyRecord,
	hardCap = MAX_BUBBLE_TEXT_CHARS,
): number {
	const { preferredLimit } = getBubbleSizing(termWidth, buddy);
	return Math.max(1, Math.min(hardCap, preferredLimit));
}

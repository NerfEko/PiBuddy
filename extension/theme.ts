import { RARITY_STARS, type Rarity } from "./constants.ts";

export function starsForRarity(rarity: Rarity): string {
	return RARITY_STARS[rarity];
}

export function statBar(value: number, width = 12): string {
	const filled = Math.max(
		0,
		Math.min(width, Math.round((value / 100) * width)),
	);
	return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

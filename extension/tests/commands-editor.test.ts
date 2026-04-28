import assert from "node:assert/strict";
import test from "node:test";
import { getBubbleTextCharLimit, getBuddyDisplayWidth } from "../bubble.ts";
import { parseBuddyCommand } from "../commands.ts";

test("buddy command parser handles switch, pet, and default", () => {
	assert.deepEqual(parseBuddyCommand(""), { action: "default" });
	assert.deepEqual(parseBuddyCommand("switch Nova Duck"), {
		action: "switch",
		value: "Nova Duck",
	});
	assert.deepEqual(parseBuddyCommand("pet"), { action: "pet" });
	assert.deepEqual(parseBuddyCommand("enablefallbacks"), { action: "enablefallbacks" });
	assert.deepEqual(parseBuddyCommand("disablefallbacks"), { action: "disablefallbacks" });
});

test("bubble text limit scales with terminal width for wrapped bubble lines", () => {
	const buddy = {
		id: "duck-1",
		seed: 1,
		createdAt: new Date().toISOString(),
		species: "duck" as const,
		rarity: "epic" as const,
		eye: "·" as const,
		hat: "none" as const,
		shiny: true,
		stats: { DEBUGGING: 88, PATIENCE: 20, CHAOS: 40, WISDOM: 55, SNARK: 33 },
		name: "Nova Duck",
		personality: "cheerful",
		soulSource: "fallback" as const,
	};
	const reserved = getBuddyDisplayWidth(buddy) + 1;
	const narrow = getBubbleTextCharLimit(80, buddy);
	const medium = getBubbleTextCharLimit(120, buddy);
	const wide = getBubbleTextCharLimit(160, buddy);
	const huge = getBubbleTextCharLimit(240, buddy);
	assert.ok(narrow < medium);
	assert.ok(medium < wide);
	assert.ok(wide < huge);

	const narrowLineFit = Math.max(1, 80 - reserved - "[  ]-".length);
	const hugeLineFit = Math.max(1, 240 - reserved - "[  ]-".length);
	assert.ok(narrow > narrowLineFit);
	assert.ok(huge > hugeLineFit);
});

import { complete, type UserMessage } from "@mariozechner/pi-ai";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { findCheapModel } from "./cheap-model.ts";
import { FALLBACK_PERSONALITIES } from "./personalities.ts";
import { getHighestStat, getLowestStat } from "./roll.ts";
import type { BuddyRecord, BuddyState } from "./state.ts";
import {
	canUseModelSoul,
	recordModelUsage,
	TOKEN_POLICY,
} from "./token-policy.ts";

function fallbackNameForBuddy(
	buddy: Pick<BuddyRecord, "species" | "rarity" | "shiny">,
): string {
	const rarityWord: Record<BuddyRecord["rarity"], string> = {
		common: "Pal",
		uncommon: "Scout",
		rare: "Spark",
		epic: "Nova",
		legendary: "Myth",
	};
	const species = buddy.species[0]!.toUpperCase() + buddy.species.slice(1);
	const shiny = buddy.shiny ? "Glimmer" : rarityWord[buddy.rarity];
	return `${shiny} ${species}`;
}

function generateFallbackSoul(
	buddy: Pick<BuddyRecord, "species" | "rarity" | "shiny" | "stats">,
) {
	return {
		name: fallbackNameForBuddy(buddy),
		personality: FALLBACK_PERSONALITIES[buddy.species],
		soulSource: "fallback" as const,
	};
}

export async function generateSoul(
	ctx: ExtensionContext,
	state: BuddyState,
	buddy: Pick<BuddyRecord, "species" | "rarity" | "shiny" | "stats">,
): Promise<{
	name: string;
	personality: string;
	soulSource: "model" | "fallback";
}> {
	const fallbacksEnabled = !!state.settings?.fallbacksEnabled;
	const fallback = generateFallbackSoul(buddy);
	const cheap = await findCheapModel(ctx, state);

	if (!canUseModelSoul(state, !!cheap)) {
		if (fallbacksEnabled) return fallback;
		if (!cheap) {
			throw new Error(
				"No buddy model available. Configure a model or run /buddy enablefallbacks.",
			);
		}
		throw new Error(
			"Buddy model calls are unavailable. Run /buddy enablefallbacks to allow local fallbacks.",
		);
	}

	try {
		const high = getHighestStat(buddy.stats);
		const low = getLowestStat(buddy.stats);
		const promptParts = [
			`species=${buddy.species}`,
			`rarity=${buddy.rarity}`,
			`shiny=${buddy.shiny ? "yes" : "no"}`,
			`highest stat = ${high.name} (${high.value}/100)`,
			`lowest stat = ${low.name} (${low.value}/100)`,
			"Stat meanings:",
			"- DEBUGGING: skill at finding/fixing bugs. High = eager bug-hunter, loves error traces. Low = avoids bugs, blames the compiler.",
			"- PATIENCE: tolerance for slow progress. High = zen mentor, never rushes. Low = impatient, wants results NOW.",
			"- CHAOS: embrace of disorder and surprises. High = thrives on merge conflicts and unpredictable output. Low = craves order, fears entropy.",
			"- WISDOM: deep insight and good advice. High = annoyingly perceptive, asks the right questions. Low = confidently wrong, gives terrible advice with conviction.",
			"- SNARK: sharp wit and sarcasm. High = biting commentary, roasts your life choices. Low = earnest encouragement, too nice to roast.",
			"",
			`Build a personality where the highest stat (${high.name}) DOMINATES their voice and the lowest stat (${low.name}) is their obvious weakness. The personality should make it clear which stat is sky-high and which is in the gutter without naming the stats directly. Use the seed personality below as a tone reference for the species, not a template.`,
			`seedPersonality=${fallback.personality}`,
			"",
			`Stats in plain English: ${high.name}=${high.value}/100 (very high), ${low.name}=${low.value}/100 (very low).`,
			"",
			"Return exactly two lines:",
			"name: <short creative name that hints at their dominant stat>",
			"personality: <1-2 vivid sentences under 180 chars — make the stat contrast obvious through behavior>",
			"No markdown. No extra text.",
		];
		const prompt = promptParts.join("\n");

		const userMessage: UserMessage = {
			role: "user",
			content: [{ type: "text", text: prompt }],
			timestamp: Date.now(),
		};

		const response = await complete(
			cheap!.model,
			{
				systemPrompt:
					'You create tiny pet companion identities for a developer. Stats define their personality: they have one dominant stat (80-100) that shapes their entire voice, and one dump stat (1-30) that is their embarrassing flaw. The personality must make the contrast obvious — a high-CHAOS/low-PATIENCE buddy should feel completely different from a high-PATIENCE/low-CHAOS one. Be vivid and specific. Give each buddy a distinct voice and a memorable quirk rooted in their stat extremes. No generic "helps with code." Make them weird, dramatic, or deeply flawed in a lovable way.',
				messages: [userMessage],
			},
			{
				apiKey: cheap!.apiKey,
				headers: cheap!.headers,
				signal: ctx.signal,
				maxTokens: TOKEN_POLICY.soulGenerationHardCap,
			},
		);

		if (response.stopReason === "aborted") {
			throw new Error("Buddy soul generation was aborted.");
		}
		if (response.stopReason === "error") {
			throw new Error("Buddy model returned an error while generating a soul.");
		}

		const text = response.content
			.filter(
				(part): part is { type: "text"; text: string } => part.type === "text",
			)
			.map((part) => part.text)
			.join("\n")
			.trim();

		const name = text.match(/name\s*:\s*(.+)/i)?.[1]?.trim() || "";
		const personality =
			text.match(/personality\s*:\s*(.+)/i)?.[1]?.trim() || "";

		if (!name || !personality) {
			if (fallbacksEnabled) return fallback;
			throw new Error(
				"Buddy model returned an incomplete soul. Run /buddy enablefallbacks to allow local fallbacks.",
			);
		}

		recordModelUsage(
			state,
			response.usage.input || 0,
			response.usage.output || 0,
			"soul",
		);
		return { name, personality, soulSource: "model" };
	} catch (err) {
		if (fallbacksEnabled) return fallback;
		throw err instanceof Error ? err : new Error(String(err));
	}
}

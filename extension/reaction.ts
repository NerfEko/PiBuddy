import { complete, type UserMessage } from "@mariozechner/pi-ai";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { findCheapModel } from "./cheap-model.ts";
import {
	classifyTurn,
	generateLocalReaction,
	type TurnSummary,
} from "./reaction-core.ts";
import { getHighestStat, getLowestStat } from "./roll.ts";
import type { BuddyRecord, BuddyState } from "./state.ts";
import {
	canUseModelReaction,
	recordModelUsage,
	TOKEN_POLICY,
} from "./token-policy.ts";

export { classifyTurn, generateLocalReaction } from "./reaction-core.ts";

export type BuddyModelReactionTestResult =
	| { ok: true; text: string; modelKey: string }
	| {
			ok: false;
			reason: "no-model" | "aborted" | "error" | "empty";
			modelKey?: string;
			error?: string;
	  };

export function shortenReactionText(rawText: string, maxChars: number): string {
	const cleaned = rawText
		.replace(/\s+/g, " ")
		.replace(/^['"`]+|['"`]+$/g, "")
		.trim();
	if (!cleaned) return "";

	const variants = [
		cleaned,
		cleaned.replace(/^\*[^*]{1,80}\*\s*/, "").trim(),
	].filter(Boolean);

	for (const variant of variants) {
		if (variant.length <= maxChars) return variant;
	}

	const candidateSet = new Set<string>();
	for (const variant of variants) {
		const sentence = variant.match(/^(.{1,200}?[.!?])(?:\s|$)/)?.[1]?.trim();
		if (sentence) candidateSet.add(sentence);

		for (const clause of variant.split(/[;,:]|\s[-–]\s|[—]/)) {
			const trimmed = clause.trim();
			if (trimmed) candidateSet.add(trimmed);
		}
	}

	const candidates = [...candidateSet].sort((a, b) => b.length - a.length);
	const fitting = candidates.find(
		(candidate) => candidate.length <= maxChars && candidate.length >= 6,
	);
	if (fitting) return fitting;

	const words = (variants[1] || variants[0] || "").split(/\s+/).filter(Boolean);
	let wholeWords = "";
	for (const word of words) {
		const next = wholeWords ? `${wholeWords} ${word}` : word;
		if (next.length > maxChars) break;
		wholeWords = next;
	}
	if (wholeWords) return wholeWords;

	const softTarget = Math.max(
		8,
		Math.min(maxChars, Math.floor(maxChars * 0.7)),
	);
	let shortened = (variants[1] || variants[0] || "")
		.slice(0, softTarget)
		.trim();
	const lastSpace = shortened.lastIndexOf(" ");
	if (lastSpace > Math.max(4, Math.floor(softTarget / 2))) {
		shortened = shortened.slice(0, lastSpace).trim();
	}
	while (shortened.length > 0 && `${shortened}…`.length > maxChars) {
		shortened = shortened.slice(0, -1).trim();
	}
	return shortened
		? `${shortened}…`
		: cleaned.slice(0, Math.max(1, maxChars - 1)).trim() + "…";
}

function buildReactionPrompts(
	buddy: BuddyRecord,
	summary: TurnSummary,
	maxChars = 90,
): { prompt: string; sysPrompt: string } {
	const high = getHighestStat(buddy.stats);
	const low = getLowestStat(buddy.stats);
	const personalityLine = buddy.personality
		? `Personality: ${buddy.personality}`
		: "Personality: infer tone from species and stats only.";
	const contextParts = [
		`You are ${buddy.name}, a ${buddy.rarity} ${buddy.species} companion.`,
		personalityLine,
		`Stats — strongest: ${high.name} (${high.value}), weakest: ${low.name} (${low.value}).`,
	];
	if (summary.filesRead.length > 0)
		contextParts.push(`Files inspected: ${summary.filesRead.join(", ")}.`);
	if (summary.filesChanged.length > 0)
		contextParts.push(`Files changed: ${summary.filesChanged.join(", ")}.`);
	if (summary.commandsRun.length > 0)
		contextParts.push(
			`Commands run:\n${summary.commandsRun.map((command) => `- ${command}`).join("\n")}`,
		);
	if (summary.editDetails.length > 0)
		contextParts.push(
			`Exact edits made this turn:\n${summary.editDetails.join("\n\n")}`,
		);
	if (summary.writeDetails.length > 0)
		contextParts.push(
			`Files written this turn:\n${summary.writeDetails.join("\n\n")}`,
		);
	if (summary.commandOutputs.length > 0)
		contextParts.push(
			`Command output:\n${summary.commandOutputs.join("\n\n")}`,
		);
	if (summary.errorHint)
		contextParts.push(`Error encountered: ${summary.errorHint}.`);
	if (summary.outputHints.length > 0)
		contextParts.push(`Output highlights: ${summary.outputHints.join(", ")}.`);
	if (summary.assistantFull)
		contextParts.push(`What the AI just did/said:\n${summary.assistantFull}`);
	if (buddy.lastSaid)
		contextParts.push(
			`Your last reaction was: "${buddy.lastSaid}" — don't repeat it.`,
		);
	contextParts.push(
		`React as ${buddy.name} in one short line that shows your personality — be sassy, dramatic, deadpan, enthusiastic, or weird depending on your character. Mention files, edits, errors, commands, or results if relevant. Hard limit: ${maxChars} chars. Prefer a punchy fragment over a full explanation. No setup, no narration, no markdown, no quotes.`,
	);
	return {
		prompt: contextParts.join("\n"),
		sysPrompt: `You are ${buddy.name}, a ${buddy.species} companion watching a developer work. ${buddy.personality ? `Personality: ${buddy.personality} ` : ""}React with one short in-character quip about what just happened. Let your personality shine — be playful, snarky, proud, or weird. Keep it under ${maxChars} chars. No markdown. No quotes.`,
	};
}

async function generateModelReaction(
	ctx: ExtensionContext,
	state: BuddyState,
	buddy: BuddyRecord,
	summary: TurnSummary,
	maxChars = 90,
): Promise<BuddyModelReactionTestResult> {
	const cheap = await findCheapModel(ctx, state);
	if (!cheap) return { ok: false, reason: "no-model" };

	const { prompt, sysPrompt } = buildReactionPrompts(buddy, summary, maxChars);
	const modelKey = `${cheap.model.provider}/${cheap.model.id}`;
	const userMessage: UserMessage = {
		role: "user",
		content: [{ type: "text", text: prompt }],
		timestamp: Date.now(),
	};

	try {
		const outputTokenCap = Math.max(
			16,
			Math.min(
				TOKEN_POLICY.reactionOutputHardCap,
				Math.ceil(maxChars / 3.5),
				TOKEN_POLICY.reactionOutputTarget,
			),
		);
		const response = await complete(
			cheap.model,
			{ systemPrompt: sysPrompt, messages: [userMessage] },
			{
				apiKey: cheap.apiKey,
				headers: cheap.headers,
				signal: ctx.signal,
				maxTokens: outputTokenCap,
			},
		);

		if (response.stopReason === "aborted")
			return { ok: false, reason: "aborted", modelKey };
		if (response.stopReason === "error")
			return {
				ok: false,
				reason: "error",
				modelKey,
				error: "model returned error stopReason",
			};

		const rawText = response.content
			.filter(
				(part): part is { type: "text"; text: string } => part.type === "text",
			)
			.map((part) => part.text)
			.join(" ")
			.trim();
		const text = shortenReactionText(rawText, Math.max(1, maxChars));

		recordModelUsage(
			state,
			response.usage.input || 0,
			response.usage.output || 0,
			"reaction",
		);
		return text
			? { ok: true, text, modelKey }
			: { ok: false, reason: "empty", modelKey };
	} catch (err) {
		return {
			ok: false,
			reason: "error",
			modelKey,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

export async function testBuddyModelReaction(
	ctx: ExtensionContext,
	state: BuddyState,
	buddy: BuddyRecord,
	scenario?: string,
	maxChars = 90,
): Promise<BuddyModelReactionTestResult> {
	const summary = classifyTurn({
		assistantText:
			scenario?.trim() ||
			"Updated extension/reaction.ts, removed fallback reactions, and tests passed.",
		toolResults: [
			{ toolName: "edit", args: { path: "extension/reaction.ts" } },
			{ toolName: "bash", content: "13 tests passed" },
		],
	});
	return generateModelReaction(ctx, state, buddy, summary, maxChars);
}

export async function maybeGenerateReaction(
	ctx: ExtensionContext,
	state: BuddyState,
	buddy: BuddyRecord,
	summary: TurnSummary,
	completedTurns: number,
	lastReactionTurn: number,
	lastReactionAt: number,
	maxChars = 90,
): Promise<{ text: string; source: "local" | "model" } | null> {
	if (
		state.settings.hidden ||
		state.settings.muted ||
		!state.settings.reactionEnabled
	)
		return null;
	if (state.settings.reactionMode === "off") return null;
	if (!summary.noteworthy) return null;

	const localReaction = state.settings.fallbacksEnabled
		? (() => {
				const localText = shortenReactionText(
					generateLocalReaction(buddy, summary),
					Math.max(1, maxChars),
				);
				return localText ? { text: localText, source: "local" as const } : null;
			})()
		: null;

	if (state.settings.reactionMode !== "cheap-model") {
		return localReaction;
	}

	if (
		!canUseModelReaction({
			state,
			completedTurns,
			lastReactionTurn,
			lastReactionAt,
			noteworthy: summary.noteworthy,
		})
	) {
		return localReaction;
	}
	if (Math.random() >= 0.85) return localReaction; // skip ~15% to avoid every single turn

	const result = await generateModelReaction(
		ctx,
		state,
		buddy,
		summary,
		maxChars,
	);
	return result.ok ? { text: result.text, source: "model" } : localReaction;
}

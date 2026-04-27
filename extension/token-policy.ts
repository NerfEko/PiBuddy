import type { BuddyState } from "./state.ts";

export const TOKEN_POLICY = {
	soulGenerationTargetOutput: 120,
	soulGenerationHardCap: 220,
	reactionOutputTarget: 80,
	reactionOutputHardCap: 160,
	reactionInputBudget: 160,
	maxBuddyModelCallsPerSession: 50,
	maxReactionCallsPerSession: 30,
	reactionTurnCooldown: 1,
	reactionTimeCooldownMs: 10 * 1000,
} as const;

export interface ReactionGateInput {
	state: BuddyState;
	completedTurns: number;
	lastReactionTurn: number;
	lastReactionAt: number;
	noteworthy: boolean;
	now?: number;
}

export function canUseModelSoul(state: BuddyState, hasModel: boolean): boolean {
	if (!hasModel) return false;
	if (state.settings.soulMode !== "model") return false;
	return (
		state.sessionUsage.buddyModelCalls <
		state.settings.maxBuddyModelCallsPerSession
	);
}

export function canUseModelReaction(input: ReactionGateInput): boolean {
	const now = input.now ?? Date.now();
	const { state } = input;
	if (!input.noteworthy) return false;
	if (
		!state.settings.reactionEnabled ||
		state.settings.hidden ||
		state.settings.muted
	)
		return false;
	if (state.settings.reactionMode !== "cheap-model") return false;
	if (
		state.sessionUsage.reactionCalls >=
		state.settings.maxReactionCallsPerSession
	)
		return false;
	if (
		state.sessionUsage.buddyModelCalls >=
		state.settings.maxBuddyModelCallsPerSession
	)
		return false;
	if (
		input.completedTurns - input.lastReactionTurn <
		TOKEN_POLICY.reactionTurnCooldown
	)
		return false;
	if (now - input.lastReactionAt < TOKEN_POLICY.reactionTimeCooldownMs)
		return false;
	return true;
}

export function recordModelUsage(
	state: BuddyState,
	inputTokens: number,
	outputTokens: number,
	kind: "soul" | "reaction",
): void {
	state.sessionUsage.buddyModelCalls += 1;
	state.sessionUsage.estimatedInputTokens += inputTokens;
	state.sessionUsage.estimatedOutputTokens += outputTokens;
	if (kind === "soul") state.sessionUsage.soulCalls += 1;
	if (kind === "reaction") state.sessionUsage.reactionCalls += 1;
}

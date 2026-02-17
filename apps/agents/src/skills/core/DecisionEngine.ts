/**
 * DecisionEngine Skill
 * Selects agent actions based on personality, state, and memory
 */

import type {
    ActionIntent,
    AgentState,
    ISkill,
    PersonalityThresholds,
    SkillContext,
} from "../../types.js";

export interface DecisionInput {
    agentState: AgentState;
    thresholds: PersonalityThresholds;
}

export class DecisionEngine implements ISkill<DecisionInput, ActionIntent> {
    name = "DecisionEngine";
    version = "1.0.0";

    /**
     * Analyzes agent state and personality to select the best action
     * Returns an intent, NEVER mutates world state directly
     */
    execute(input: DecisionInput, context: SkillContext): ActionIntent {
        const { agentState, thresholds } = input;
        const { memory } = context;

        // Check for action streaks that might influence decision
        const streak = this.getActionStreak(memory.recentActions);

        // Primary decision: Energy-based
        if (agentState.energy < thresholds.restThreshold) {
            return {
                action: "rest",
                reason: `Energy (${agentState.energy}) below threshold (${thresholds.restThreshold})`,
                confidence: 0.95,
                metadata: { streak },
            };
        }

        // Check if we've been resting too much
        if (streak.action === "rest" && streak.count >= 3) {
            return {
                action: "work",
                reason: `Breaking rest streak (${streak.count} consecutive rests)`,
                confidence: 0.7,
                metadata: { streak },
            };
        }

        // Check if we've been working too much (might need variety later)
        if (streak.action === "work" && streak.count >= 5 && agentState.energy < 50) {
            return {
                action: "rest",
                reason: `Long work streak (${streak.count}), preventive rest`,
                confidence: 0.6,
                metadata: { streak },
            };
        }

        // Default: Work
        return {
            action: "work",
            reason: `Energy sufficient (${agentState.energy}), work ethic bonus: ${thresholds.workBonus.toFixed(2)}x`,
            confidence: 0.85,
            metadata: {
                streak,
                estimatedReward: 5 * thresholds.workBonus,
            },
        };
    }

    /**
     * Calculate current action streak from memory
     */
    private getActionStreak(
        recentActions: { action: string }[]
    ): { action: string; count: number } {
        if (recentActions.length === 0) {
            return { action: "none", count: 0 };
        }

        const lastAction = recentActions[recentActions.length - 1].action;
        let count = 0;

        for (let i = recentActions.length - 1; i >= 0; i--) {
            if (recentActions[i].action === lastAction) {
                count++;
            } else {
                break;
            }
        }

        return { action: lastAction, count };
    }
}

// Export singleton instance
export const decisionEngine = new DecisionEngine();

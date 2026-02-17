/**
 * WorldActor Skill
 * Sends action intents to the World API
 */

import type {
    ActionIntent,
    ActionResult,
    ISkill,
    SkillContext,
    IntentTypeValue,
} from "../../types.js";
import { IntentType } from "../../types.js";

// Get base URL from environment or use default
const WORLD_API_BASE_URL = process.env.WORLD_API_BASE_URL || "http://localhost:3001";

export interface WorldActorConfig {
    worldUrl?: string;
}

export interface WorldActorInput {
    config: WorldActorConfig;
    intent: ActionIntent;
}

/**
 * Maps agent action types to backend IntentType values
 */
function mapActionToIntentType(action: string): IntentTypeValue {
    switch (action) {
        case "work":
            return IntentType.INTENT_WORK;
        case "rest":
            return IntentType.INTENT_IDLE; // MVP: rest = idle (no special handling)
        case "idle":
        default:
            return IntentType.INTENT_IDLE;
    }
}

export class WorldActor implements ISkill<WorldActorInput, ActionResult> {
    name = "WorldActor";
    version = "2.0.0";

    /**
     * Sends action intent to the World API
     * Converts agent intent to backend IntentType format
     */
    async execute(
        input: WorldActorInput,
        context: SkillContext
    ): Promise<ActionResult> {
        const { config, intent } = input;
        const baseUrl = config.worldUrl || WORLD_API_BASE_URL;

        try {
            const intentType = mapActionToIntentType(intent.action);

            const response = await fetch(`${baseUrl}/api/v1/intents`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    actorId: context.agentId,
                    type: intentType,
                    params: intent.metadata || {},
                }),
            });

            const data = await response.json() as { ok?: boolean; intent?: { id: string }; error?: string };

            if (response.ok && data.ok) {
                return {
                    success: true,
                    intentId: data.intent?.id,
                    agent: context.agentState, // Return last known state
                };
            }

            return {
                success: false,
                error: data.error || `HTTP ${response.status}`,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return {
                success: false,
                error: message,
            };
        }
    }
}

// Export singleton instance
export const worldActor = new WorldActor();

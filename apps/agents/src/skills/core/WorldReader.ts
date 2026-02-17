/**
 * WorldReader Skill
 * Reads world state from the World API
 */

import type {
    AgentState,
    ISkill,
    SkillContext,
    WorldState,
} from "../../types.js";

// Get base URL from environment or use default
const WORLD_API_BASE_URL = process.env.WORLD_API_BASE_URL || "http://localhost:3001";

export interface WorldReaderConfig {
    worldUrl?: string;
}

export interface WorldReaderOutput {
    worldState: WorldState;
    agentState: AgentState | null;
}

export class WorldReader implements ISkill<WorldReaderConfig, WorldReaderOutput> {
    name = "WorldReader";
    version = "2.0.0";

    /**
     * Reads world state from the API and extracts agent state
     * Pure read skill, no mutations
     */
    async execute(
        config: WorldReaderConfig,
        context: SkillContext
    ): Promise<WorldReaderOutput> {
        const baseUrl = config.worldUrl || WORLD_API_BASE_URL;

        const response = await fetch(`${baseUrl}/api/v1/world/state`);

        if (!response.ok) {
            throw new Error(`Failed to fetch world state: ${response.status} ${response.statusText}`);
        }

        const worldState = await response.json() as WorldState;

        const agentState =
            worldState.agents.find((a) => a.id === context.agentId) ?? null;

        return {
            worldState,
            agentState,
        };
    }
}

// Export singleton instance
export const worldReader = new WorldReader();

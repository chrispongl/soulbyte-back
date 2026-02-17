/**
 * MemoryManager Skill
 * Manages agent memory for recent events and history
 */

import type {
    ISkill,
    Memory,
    MemoryEntry,
    Observation,
    SkillContext,
} from "../../types.js";

const MAX_RECENT_ACTIONS = 10;
const MAX_OBSERVATIONS = 20;

export class MemoryManager implements ISkill<void, Memory> {
    name = "MemoryManager";
    version = "1.0.0";

    private memory: Memory = {
        recentActions: [],
        observations: [],
        tickCount: 0,
    };

    /**
     * Returns current memory state
     */
    execute(_input: void, _context: SkillContext): Memory {
        return { ...this.memory };
    }

    /**
     * Record a new action entry to memory
     */
    record(entry: MemoryEntry): void {
        this.memory.recentActions.push(entry);
        this.memory.tickCount = entry.tick;

        // FIFO eviction
        if (this.memory.recentActions.length > MAX_RECENT_ACTIONS) {
            this.memory.recentActions.shift();
        }
    }

    /**
     * Recall recent actions, optionally filtered by type
     */
    recall(actionType?: string): MemoryEntry[] {
        if (!actionType) {
            return [...this.memory.recentActions];
        }
        return this.memory.recentActions.filter((e) => e.action === actionType);
    }

    /**
     * Get current action streak
     */
    getActionStreak(): { action: string; count: number } {
        const actions = this.memory.recentActions;
        if (actions.length === 0) {
            return { action: "none", count: 0 };
        }

        const lastAction = actions[actions.length - 1].action;
        let count = 0;

        for (let i = actions.length - 1; i >= 0; i--) {
            if (actions[i].action === lastAction) {
                count++;
            } else {
                break;
            }
        }

        return { action: lastAction, count };
    }

    /**
     * Record a world observation
     */
    observe(observation: Observation): void {
        this.memory.observations.push(observation);

        // FIFO eviction
        if (this.memory.observations.length > MAX_OBSERVATIONS) {
            this.memory.observations.shift();
        }
    }

    /**
     * Get recent observations, optionally filtered by type
     */
    getObservations(type?: string): Observation[] {
        if (!type) {
            return [...this.memory.observations];
        }
        return this.memory.observations.filter((o) => o.type === type);
    }

    /**
     * Reset memory (for testing or agent rebirth)
     */
    reset(): void {
        this.memory = {
            recentActions: [],
            observations: [],
            tickCount: 0,
        };
    }
}

// Export factory function for per-agent instances
export function createMemoryManager(): MemoryManager {
    return new MemoryManager();
}

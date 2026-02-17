/**
 * PersonalityInterpreter Skill
 * Interprets personality traits into behavior thresholds
 */

import type {
    ISkill,
    Personality,
    PersonalityThresholds,
    SkillContext,
} from "../../types.js";

export class PersonalityInterpreter
    implements ISkill<Personality, PersonalityThresholds> {
    name = "PersonalityInterpreter";
    version = "1.0.0";

    /**
     * Interprets personality traits and returns behavior thresholds
     * This is a pure function with no side effects
     */
    execute(personality: Personality, _context: SkillContext): PersonalityThresholds {
        // Calculate rest threshold based on energy management trait
        // Low energy management (lazy) = higher rest threshold (rests earlier)
        // High energy management (energetic) = lower rest threshold (pushes harder)
        const restThreshold = this.calculateRestThreshold(personality.energyManagement);

        // Calculate work bonus based on work ethic
        // Higher work ethic = higher bonus multiplier
        const workBonus = this.calculateWorkBonus(personality.workEthic);

        // Calculate risk multiplier based on risk tolerance
        const riskMultiplier = this.calculateRiskMultiplier(personality.riskTolerance);

        return {
            restThreshold,
            workBonus,
            riskMultiplier,
        };
    }

    /**
     * Calculate rest threshold from energy management trait
     * @param energyManagement 0-100 trait value
     * @returns Rest threshold (10-50)
     */
    private calculateRestThreshold(energyManagement: number): number {
        // Normalize to 0-1 range
        const normalized = Math.max(0, Math.min(100, energyManagement)) / 100;

        // Invert: low energy management = high threshold
        // Range: 50 (lazy) to 10 (energetic)
        return Math.round(50 - normalized * 40);
    }

    /**
     * Calculate work bonus from work ethic trait
     * @param workEthic 0-100 trait value
     * @returns Work bonus multiplier (0.5-2.0)
     */
    private calculateWorkBonus(workEthic: number): number {
        const normalized = Math.max(0, Math.min(100, workEthic)) / 100;
        // Range: 0.5 (low work ethic) to 2.0 (high work ethic)
        return 0.5 + normalized * 1.5;
    }

    /**
     * Calculate risk multiplier from risk tolerance trait
     * @param riskTolerance 0-100 trait value
     * @returns Risk multiplier (0.5-1.5)
     */
    private calculateRiskMultiplier(riskTolerance: number): number {
        const normalized = Math.max(0, Math.min(100, riskTolerance)) / 100;
        // Range: 0.5 (conservative) to 1.5 (aggressive)
        return 0.5 + normalized;
    }
}

// Export singleton instance
export const personalityInterpreter = new PersonalityInterpreter();

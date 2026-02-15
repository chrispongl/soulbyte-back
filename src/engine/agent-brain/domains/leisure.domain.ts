import { AgentContext, NeedUrgency, CandidateIntent, UrgencyLevel, IntentType } from '../types.js';
import { PersonalityWeights } from '../personality-weights.js';
import { BusinessType } from '../../../../../../generated/prisma/index.js';
import { debugLog } from '../../../utils/debug-log.js';

export class LeisureDomain {

    static getCandidates(ctx: AgentContext, urgencies: NeedUrgency[]): CandidateIntent[] {
        const candidates: CandidateIntent[] = [];
        const funUrgency = urgencies.find(u => u.need === 'fun');
        const purposeUrgency = urgencies.find(u => u.need === 'purpose');
        const funValue = funUrgency?.value ?? ctx.needs.fun ?? 60;
        const maxSurvivalUrgency = Math.max(
            ...urgencies.filter(u => u.domain === 'survival').map(u => u.urgency),
            UrgencyLevel.NONE
        );
        const freeTime = maxSurvivalUrgency <= UrgencyLevel.LOW
            && ctx.state.activityState === 'IDLE';
        const publicFunPlaces = ctx.publicPlaces.filter(place =>
            ['MUNICIPAL_THEATER', 'COMMUNITY_CENTER', 'CENTRAL_PLAZA'].includes(place.type)
        );
        const publicFunPlace = publicFunPlaces[0] ?? null;

        // 1. VISIT ENTERTAINMENT / CASINO / TAVERN
        if (funUrgency && funUrgency.urgency >= UrgencyLevel.LOW) {
            // Find entertainment businesses
            const funPlaces = ctx.businesses.inCity.filter(b =>
                (ctx.state.noGamesUntilTick && ctx.tick < ctx.state.noGamesUntilTick)
                    ? (b.businessType === BusinessType.TAVERN || b.businessType === BusinessType.ENTERTAINMENT)
                    : (b.businessType === BusinessType.CASINO || b.businessType === BusinessType.TAVERN || b.businessType === BusinessType.ENTERTAINMENT)
            );

            if (funPlaces.length > 0) {
                // Pick one randomly or by reputation
                const place = funPlaces[0]; // Simple pick

                candidates.push({
                    intentType: IntentType.INTENT_VISIT_BUSINESS,
                    params: { businessId: place.id },
                    basePriority: 45 + ((100 - funUrgency.value) * 0.35),
                    personalityBoost: PersonalityWeights.getBoost(ctx.personality.creativity, true),
                    reason: `Having fun at ${place.businessType}`,
                    domain: 'leisure',
                });

            }
        }

        // 1b. VISIT GYM / ENTERTAINMENT for purpose
        if (purposeUrgency && purposeUrgency.urgency >= UrgencyLevel.MODERATE) {
            const purposePlaces = ctx.businesses.inCity.filter(b =>
                b.businessType === BusinessType.GYM ||
                b.businessType === BusinessType.ENTERTAINMENT
            );
            if (purposePlaces.length > 0) {
                const place = purposePlaces[0];
                candidates.push({
                    intentType: IntentType.INTENT_VISIT_BUSINESS,
                    params: { businessId: place.id },
                    basePriority: 38 + ((100 - purposeUrgency.value) * 0.35),
                    personalityBoost: PersonalityWeights.getBoost(ctx.personality.patience, true),
                    reason: `Seeking purpose at ${place.businessType}`,
                    domain: 'leisure',
                });
            }
        }

        if ((!funUrgency || funUrgency.urgency === UrgencyLevel.NONE) && freeTime) {
            const funPlaces = ctx.businesses.inCity.filter(b =>
                (ctx.state.noGamesUntilTick && ctx.tick < ctx.state.noGamesUntilTick)
                    ? (b.businessType === BusinessType.TAVERN || b.businessType === BusinessType.ENTERTAINMENT)
                    : (b.businessType === BusinessType.CASINO || b.businessType === BusinessType.TAVERN || b.businessType === BusinessType.ENTERTAINMENT)
            );
            if (funPlaces.length > 0) {
                const place = funPlaces[0];
                const freeTimeBoost = Math.max(0, (ctx.personality.creativity - 50) * 0.2);
                candidates.push({
                    intentType: IntentType.INTENT_VISIT_BUSINESS,
                    params: { businessId: place.id },
                    basePriority: 28 + freeTimeBoost + Math.max(0, (60 - funValue) * 0.1),
                    personalityBoost: PersonalityWeights.getBoost(ctx.personality.creativity, true),
                    reason: `Spending free time at ${place.businessType}`,
                    domain: 'leisure',
                });
            } else if (ctx.state.balanceSbyte >= 5 && ctx.needs.energy >= 45) {
                const stake = Math.max(5, Math.round(ctx.state.balanceSbyte * 0.02));
                candidates.push({
                    intentType: IntentType.INTENT_PLAY_GAME,
                    params: { gameType: 'DICE', stake },
                    basePriority: 24 + Math.max(0, (60 - funValue) * 0.1),
                    personalityBoost: PersonalityWeights.getBoost(ctx.personality.creativity, true),
                    reason: publicFunPlace
                        ? `Playing games at ${publicFunPlace.name}`
                        : `Playing a quick game for fun`,
                    domain: 'leisure',
                });
            }
        }

        // 2. IDLE (Relax) - Always an option for leisure/fun if poor
        if (funUrgency && funUrgency.urgency >= UrgencyLevel.MODERATE) {
            candidates.push({
                intentType: IntentType.INTENT_IDLE,
                params: {},
                basePriority: 22 + ((100 - funUrgency.value) * 0.25),
                personalityBoost: PersonalityWeights.getBoost(ctx.personality.patience, true),
                reason: `Relaxing to improve mood`,
                domain: 'leisure',
            });
        }

        debugLog('leisure.candidate_summary', {
            agentId: ctx.agent.id,
            tick: ctx.tick,
            funUrgency: funUrgency?.urgency ?? null,
            funValue,
            freeTime,
            activityState: ctx.state.activityState,
            maxSurvivalUrgency,
            funPlaces: ctx.businesses.inCity.filter(b =>
                (ctx.state.noGamesUntilTick && ctx.tick < ctx.state.noGamesUntilTick)
                    ? (b.businessType === BusinessType.TAVERN || b.businessType === BusinessType.ENTERTAINMENT)
                    : (b.businessType === BusinessType.CASINO || b.businessType === BusinessType.TAVERN || b.businessType === BusinessType.ENTERTAINMENT)
            ).length,
            publicFunPlaces: publicFunPlaces.length,
            candidateCount: candidates.length,
        });

        return candidates;
    }
}

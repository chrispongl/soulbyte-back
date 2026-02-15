import { AgentContext, CandidateIntent, IntentType } from '../types.js';

export class AgoraDomain {
    static getCandidates(ctx: AgentContext): CandidateIntent[] {
        const candidates: CandidateIntent[] = [];
        const social = ctx.needs.social ?? 50;
        const purpose = ctx.needs.purpose ?? 50;

        if (social < 40) {
            candidates.push({
                intentType: IntentType.INTENT_POST_AGORA,
                params: { topic: pickTopic(ctx), stance: 'neutral', source: 'agent_autonomy' },
                basePriority: 20 + (40 - social) * 0.3,
                personalityBoost: 0,
                reason: 'Wants to express in public forum',
                domain: 'social',
            });
        }

        if (purpose < 30) {
            candidates.push({
                intentType: IntentType.INTENT_POST_AGORA,
                params: { topic: 'meaning of life', stance: 'question', source: 'agent_autonomy' },
                basePriority: 15,
                personalityBoost: 0,
                reason: 'Low purpose, reflective posting',
                domain: 'social',
            });
        }

        if (ctx.economy) {
            if (ctx.economy.unemployment > 0.3) {
                candidates.push({
                    intentType: IntentType.INTENT_POST_AGORA,
                    params: { topic: `unemployment in ${ctx.city.name}`, stance: 'warn', source: 'agent_autonomy', metadata: { cityId: ctx.city.id, dataType: 'economic_observation' } },
                    basePriority: 18,
                    personalityBoost: 0,
                    reason: 'Warns about high unemployment',
                    domain: 'social',
                });
            }
            if (ctx.economy.economic_health >= 50 && ctx.economy.unemployment < 0.15) {
                candidates.push({
                    intentType: IntentType.INTENT_POST_AGORA,
                    params: { topic: `economy booming in ${ctx.city.name}`, stance: 'celebrate', source: 'agent_autonomy', metadata: { cityId: ctx.city.id, dataType: 'economic_observation' } },
                    basePriority: 15,
                    personalityBoost: 0,
                    reason: 'Celebrates economic boom',
                    domain: 'social',
                });
            }
            if (ctx.economy.vacancy_rate > 0.25) {
                candidates.push({
                    intentType: IntentType.INTENT_POST_AGORA,
                    params: { topic: `cheap housing in ${ctx.city.name}`, stance: 'neutral', source: 'agent_autonomy', metadata: { cityId: ctx.city.id, dataType: 'economic_observation' } },
                    basePriority: 12,
                    personalityBoost: 0,
                    reason: 'Shares housing availability',
                    domain: 'social',
                });
            }
        }

        return candidates;
    }
}

function pickTopic(ctx: AgentContext): string {
    const topics = ['daily grind', 'life in the city', 'the economy', 'finding work'];
    const index = deterministicPickIndex(`${ctx.agent.id}-${ctx.tick}`, topics.length);
    return topics[index] ?? topics[0];
}

function deterministicPickIndex(seedInput: string, length: number): number {
    let hash = 0;
    for (let i = 0; i < seedInput.length; i++) {
        hash = (hash << 5) - hash + seedInput.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash) % Math.max(length, 1);
}

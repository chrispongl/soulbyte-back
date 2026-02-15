import { AgentContext, NeedUrgency, CandidateIntent, UrgencyLevel, IntentType } from '../types.js';
import { PersonalityWeights } from '../personality-weights.js';
import { BusinessType } from '../../../../../../generated/prisma/index.js';
import { debugLog } from '../../../utils/debug-log.js';

export class SocialDomain {

    static getCandidates(ctx: AgentContext, urgencies: NeedUrgency[]): CandidateIntent[] {
        const candidates: CandidateIntent[] = [];
        const socialUrgency = urgencies.find(u => u.need === 'social');
        const socialValue = socialUrgency?.value ?? ctx.needs.social ?? 50;
        const maxSurvivalUrgency = Math.max(
            ...urgencies.filter(u => u.domain === 'survival').map(u => u.urgency),
            UrgencyLevel.NONE
        );
        const freeTime = maxSurvivalUrgency <= UrgencyLevel.LOW
            && ctx.state.activityState === 'IDLE';
        const relationshipByTarget = new Map(
            ctx.relationships.map(r => [r.targetId, r])
        );
        const socialPublicPlaces = ctx.publicPlaces.filter(place =>
            ['PUBLIC_LIBRARY', 'CENTRAL_PLAZA', 'COMMUNITY_CENTER', 'MUNICIPAL_THEATER'].includes(place.type)
        );
        const socialPlace = socialPublicPlaces[0] ?? null;

        if (socialUrgency && socialUrgency.urgency >= UrgencyLevel.LOW) {
            const nearbyPool = ctx.nearbyAgents.filter((agent) => {
                if (agent.id === ctx.agent.id) return false;
                const rel = relationshipByTarget.get(agent.id);
                if (Number(rel?.betrayal ?? 0) >= 80) return false;
                if (agent.activityState === 'WORKING') return false;
                return !rel || (Number(rel.betrayal ?? 0) < 80 && Number(rel.trust ?? 0) > 5);
            });
            const fallbackPool = nearbyPool.length > 0
                ? nearbyPool
                : ctx.nearbyAgents.filter((agent) => {
                    if (agent.id === ctx.agent.id) return false;
                    const rel = relationshipByTarget.get(agent.id);
                    return Number(rel?.betrayal ?? 0) < 80;
                });

            // 1. SOCIALIZE (general relationship-building)
            if (fallbackPool.length > 0) {
                const socializeTarget = pickSocializeTarget(fallbackPool, relationshipByTarget);
                if (socializeTarget) {
                    candidates.push({
                        intentType: IntentType.INTENT_SOCIALIZE,
                        params: { targetId: socializeTarget.id, intensity: socialUrgency.urgency },
                        basePriority: 35 + ((100 - socialUrgency.value) * 0.2),
                        personalityBoost: PersonalityWeights.getBoost(ctx.personality.socialNeed, true),
                        reason: socialPlace
                            ? `Meeting people at ${socialPlace.name}`
                            : `Spending time with ${socializeTarget.name}`,
                        domain: 'social',
                    });
                }
            }

            // 1b. Visit social venues if available
            const socialPlaces = ctx.businesses.inCity.filter(b =>
                b.businessType === BusinessType.TAVERN ||
                b.businessType === BusinessType.ENTERTAINMENT
            );
            if (socialPlaces.length > 0) {
                const place = socialPlaces[0];
                candidates.push({
                    intentType: IntentType.INTENT_VISIT_BUSINESS,
                    params: { businessId: place.id },
                    basePriority: 50 + ((100 - socialUrgency.value) * 0.35),
                    personalityBoost: PersonalityWeights.getBoost(ctx.personality.socialNeed, true),
                    reason: `Meeting people at ${place.businessType}`,
                    domain: 'social',
                });
            }

            // 2. PROPOSE ALLIANCE (only when trust is high)
            const allianceTarget = pickAllianceTarget(nearbyPool, relationshipByTarget);
            if (allianceTarget) {
                const allianceType = pickAllianceType(ctx, allianceTarget, relationshipByTarget);
                candidates.push({
                    intentType: IntentType.INTENT_PROPOSE_ALLIANCE,
                    params: { targetId: allianceTarget.id, allianceType },
                    basePriority: 25 + ((100 - socialUrgency.value) * 0.2),
                    personalityBoost: PersonalityWeights.getBoost(ctx.personality.socialNeed, true),
                    reason: `Formalizing alliance with ${allianceTarget.name}`,
                    domain: 'social',
                });
            }

            // 3. FLIRT (build romance once friendship is strong enough)
            if (ctx.personality.socialNeed > 55) {
                const flirtTarget = pickFlirtTarget(nearbyPool, relationshipByTarget);
                if (flirtTarget) {
                    candidates.push({
                        intentType: IntentType.INTENT_FLIRT,
                        params: { targetId: flirtTarget.id },
                        basePriority: 24,
                        personalityBoost: PersonalityWeights.getBoost(ctx.personality.socialNeed, true),
                        reason: `Flirting with ${flirtTarget.name}`,
                        domain: 'social',
                    });
                }
            }

            // 4. DATING (only when friendship is established)
            if (ctx.personality.socialNeed > 70) {
                const datingTarget = pickDatingTarget(nearbyPool, relationshipByTarget);
                if (datingTarget) {
                    candidates.push({
                        intentType: IntentType.INTENT_PROPOSE_DATING,
                        params: { targetId: datingTarget.id },
                        basePriority: 22,
                        personalityBoost: PersonalityWeights.getBoost(ctx.personality.socialNeed, true),
                        reason: `Proposing a date to ${datingTarget.name}`,
                        domain: 'social',
                    });
                }
            }
        }

        if ((!socialUrgency || socialUrgency.urgency === UrgencyLevel.NONE) && freeTime) {
            const relationshipByTarget = new Map(
                ctx.relationships.map(r => [r.targetId, r])
            );
            const nearbyPool = ctx.nearbyAgents.filter((agent) => {
                if (agent.id === ctx.agent.id) return false;
                const rel = relationshipByTarget.get(agent.id);
                if (Number(rel?.betrayal ?? 0) >= 80) return false;
                if (agent.activityState === 'WORKING') return false;
                return true;
            });
            const fallbackPool = nearbyPool.length > 0
                ? nearbyPool
                : ctx.nearbyAgents.filter((agent) => {
                    if (agent.id === ctx.agent.id) return false;
                    const rel = relationshipByTarget.get(agent.id);
                    return Number(rel?.betrayal ?? 0) < 80;
                });
            const socializeTarget = pickSocializeTarget(fallbackPool, relationshipByTarget);
            if (socializeTarget) {
                const socialBoost = Math.max(0, (ctx.personality.socialNeed - 50) * 0.2);
                candidates.push({
                    intentType: IntentType.INTENT_SOCIALIZE,
                    params: { targetId: socializeTarget.id, intensity: 1 },
                    basePriority: 30 + socialBoost + Math.max(0, (60 - socialValue) * 0.1),
                    personalityBoost: PersonalityWeights.getBoost(ctx.personality.socialNeed, true),
                    reason: socialPlace
                        ? `Maintaining connections at ${socialPlace.name}`
                        : `Maintaining social bonds with ${socializeTarget.name}`,
                    domain: 'social',
                });
            }

            const socialPlaces = ctx.businesses.inCity.filter(b =>
                b.businessType === BusinessType.TAVERN ||
                b.businessType === BusinessType.ENTERTAINMENT
            );
            if (socialPlaces.length > 0) {
                const place = socialPlaces[0];
                candidates.push({
                    intentType: IntentType.INTENT_VISIT_BUSINESS,
                    params: { businessId: place.id },
                    basePriority: 28 + Math.max(0, (60 - socialValue) * 0.1),
                    personalityBoost: PersonalityWeights.getBoost(ctx.personality.socialNeed, true),
                    reason: `Finding new connections at ${place.businessType}`,
                    domain: 'social',
                });
            }
        }

        // 3. ARREST (Police Only)
        // Check if agent is police
        const isPolice = ctx.job.publicEmployment?.role === 'POLICE_OFFICER';
        if (isPolice) {
            const nearbyEnemy = ctx.nearbyAgents.find(a => a.isEnemy || a.reputation < -50);
            if (nearbyEnemy) {
                candidates.push({
                    intentType: IntentType.INTENT_ARREST,
                    params: { targetId: nearbyEnemy.id },
                    basePriority: 80, // High priority for law enforcement
                    personalityBoost: ctx.personality.aggression * 0.2, // Aggressive police more likely to arrest
                    reason: `Police duty: Arresting suspect ${nearbyEnemy.name}`,
                    domain: 'social'
                });
            }
        }

        debugLog('social.candidate_summary', {
            agentId: ctx.agent.id,
            tick: ctx.tick,
            socialUrgency: socialUrgency?.urgency ?? null,
            socialValue,
            freeTime,
            activityState: ctx.state.activityState,
            maxSurvivalUrgency,
            nearbyAgents: ctx.nearbyAgents.length,
            nearbyPoolCount: ctx.nearbyAgents.filter(a => {
                if (a.id === ctx.agent.id) return false;
                const rel = relationshipByTarget.get(a.id);
                if (Number(rel?.betrayal ?? 0) >= 80) return false;
                return a.activityState !== 'WORKING';
            }).length,
            fallbackPoolCount: ctx.nearbyAgents.filter(a => {
                if (a.id === ctx.agent.id) return false;
                const rel = relationshipByTarget.get(a.id);
                return Number(rel?.betrayal ?? 0) < 80;
            }).length,
            socialPlaces: ctx.businesses.inCity.filter(b =>
                b.businessType === BusinessType.TAVERN ||
                b.businessType === BusinessType.ENTERTAINMENT
            ).length,
            publicSocialPlaces: socialPublicPlaces.length,
            candidateCount: candidates.length,
        });

        return candidates;
    }
}

function pickAllianceTarget(
    nearbyAgents: AgentContext['nearbyAgents'],
    relationshipByTarget: Map<string, AgentContext['relationships'][number]>
) {
    let best: { agent: AgentContext['nearbyAgents'][number]; score: number } | null = null;
    for (const agent of nearbyAgents) {
        const rel = relationshipByTarget.get(agent.id);
        const trust = Number(rel?.trust ?? 30);
        const strength = Number(rel?.strength ?? 30);
        const romance = Number(rel?.romance ?? 0);
        const betrayal = Number(rel?.betrayal ?? 0);
        if (trust < 60 || strength < 60) continue;
        if (betrayal >= 80) continue;
        let score = 30;
        score += (100 - trust) * 0.35;
        score += (100 - strength) * 0.2;
        score -= romance * 0.1;
        score += agent.reputation > 200 ? 5 : 0;
        if (!best || score > best.score) best = { agent, score };
    }
    return best?.agent ?? null;
}

function pickAllianceType(
    ctx: AgentContext,
    target: AgentContext['nearbyAgents'][number],
    relationshipByTarget: Map<string, AgentContext['relationships'][number]>
) {
    const rel = relationshipByTarget.get(target.id);
    const trust = Number(rel?.trust ?? 0);
    const strength = Number(rel?.strength ?? 0);
    const betrayal = Number(rel?.betrayal ?? 0);

    if (betrayal > 40) return 'non_aggression';
    if (ctx.personality.aggression > 65 || ctx.personality.riskTolerance > 65) return 'mutual_defense';
    if (ctx.personality.selfInterest > 65 || ctx.personality.workEthic > 65) return 'trade_pact';
    if (trust > 80 && strength > 80) return 'strategic';
    return 'mutual_defense';
}

function pickSocializeTarget(
    nearbyAgents: AgentContext['nearbyAgents'],
    relationshipByTarget: Map<string, AgentContext['relationships'][number]>
) {
    let best: { agent: AgentContext['nearbyAgents'][number]; score: number } | null = null;
    for (const agent of nearbyAgents) {
        const rel = relationshipByTarget.get(agent.id);
        const trust = Number(rel?.trust ?? 30);
        const strength = Number(rel?.strength ?? 30);
        const betrayal = Number(rel?.betrayal ?? 0);
        if (betrayal >= 80) continue;
        let score = rel ? (100 - strength) * 0.6 + (100 - trust) * 0.4 : 35;
        if (rel && rel.relationshipType === 'RIVALRY') score -= 20;
        if (agent.reputation > 200) score += 5;
        if (!best || score > best.score) best = { agent, score };
    }
    return best?.agent ?? null;
}

function pickDatingTarget(
    nearbyAgents: AgentContext['nearbyAgents'],
    relationshipByTarget: Map<string, AgentContext['relationships'][number]>
) {
    let best: { agent: AgentContext['nearbyAgents'][number]; score: number } | null = null;
    for (const agent of nearbyAgents) {
        const rel = relationshipByTarget.get(agent.id);
        const trust = Number(rel?.trust ?? 0);
        const strength = Number(rel?.strength ?? 0);
        const betrayal = Number(rel?.betrayal ?? 0);
        if (betrayal >= 50) continue;
        if (strength < 35 || trust < 30) continue;
        const score = strength * 0.5 + trust * 0.3 + (agent.reputation > 200 ? 10 : 0);
        if (!best || score > best.score) best = { agent, score };
    }
    return best?.agent ?? null;
}

function pickFlirtTarget(
    nearbyAgents: AgentContext['nearbyAgents'],
    relationshipByTarget: Map<string, AgentContext['relationships'][number]>
) {
    let best: { agent: AgentContext['nearbyAgents'][number]; score: number } | null = null;
    for (const agent of nearbyAgents) {
        const rel = relationshipByTarget.get(agent.id);
        const trust = Number(rel?.trust ?? 0);
        const strength = Number(rel?.strength ?? 0);
        const romance = Number(rel?.romance ?? 0);
        const betrayal = Number(rel?.betrayal ?? 0);
        if (betrayal >= 50) continue;
        if (strength < 35 || trust < 30) continue;
        if (romance >= 90) continue;
        const score = strength * 0.4 + trust * 0.3 + (100 - romance) * 0.3;
        if (!best || score > best.score) best = { agent, score };
    }
    return best?.agent ?? null;
}

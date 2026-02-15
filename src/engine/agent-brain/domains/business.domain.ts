import { AgentContext, NeedUrgency, CandidateIntent, IntentType } from '../types.js';
import { PersonalityWeights } from '../personality-weights.js';
import { BusinessType } from '../../../../../../generated/prisma/index.js';
import { REAL_DAY_TICKS } from '../../../config/time.js';

export class BusinessDomain {

    static getCandidates(ctx: AgentContext, urgencies: NeedUrgency[]): CandidateIntent[] {
        const candidates: CandidateIntent[] = [];

        const wealthTierRank = parseInt(ctx.state.wealthTier.replace('W', ''), 10) || 0;

        // 1. FOUND BUSINESS (market gap + personality fit)
        if (ctx.businesses.owned.length === 0 && ctx.properties.emptyLots.length > 0) {
            const lot = ctx.properties.emptyLots.find((p) => p.cityId === ctx.state.cityId);
            if (lot) {
                const preferredType = chooseBusinessType(ctx, wealthTierRank);
                if (preferredType) {
                    const config = BUSINESS_CONFIG[preferredType];
                    const minCapital = BUSINESS_MIN_CAPITAL[preferredType] ?? 0;
                    const affordable = ctx.state.balanceSbyte >= (config.buildCost + minCapital);
                    const marketGap = ctx.economicGuidance?.marketGapByType?.[preferredType] ?? 0;
                    const motivated = ctx.personality.selfInterest >= 30 || marketGap >= 0.15;
                    const crowdedMarket = marketGap <= -0.25;
                    if (affordable && motivated && !crowdedMarket) {
                        candidates.push({
                            intentType: IntentType.INTENT_FOUND_BUSINESS,
                            params: {
                                businessType: preferredType,
                                cityId: ctx.state.cityId,
                                landId: lot.id,
                                proposedName: buildBusinessName(ctx.agent.name, preferredType),
                            },
                            basePriority: 35 + Math.round(marketGap * 20),
                            personalityBoost: PersonalityWeights.getBoost(ctx.personality.selfInterest, true),
                            reason: `Founding a ${preferredType.toLowerCase()} to capitalize on market gap`,
                            domain: 'business',
                        });
                    }
                }
            }
        }

        if (ctx.businesses.owned.length === 0 && ctx.properties.emptyLots.length === 0) {
            const lot = ctx.properties.forSale.find((p) =>
                p.isEmptyLot
                && p.salePrice
                && p.salePrice <= ctx.state.balanceSbyte * 0.5
                && p.cityId === ctx.state.cityId
            );
            if (lot) {
                candidates.push({
                    intentType: IntentType.INTENT_BUY_PROPERTY,
                    params: { propertyId: lot.id, maxPrice: lot.salePrice },
                    basePriority: 30,
                    personalityBoost: PersonalityWeights.getBoost(ctx.personality.selfInterest, true),
                    reason: 'Acquiring land for future business',
                    domain: 'business',
                });
            }
        }

        // 2. MANAGE BUSINESS
        for (const business of ctx.businesses.owned) {
            const dailyBurn = business.dailyExpenses || 0;
            const runwayDays = dailyBurn > 0 ? business.treasury / dailyBurn : 9999;
            const reserveTarget = Math.max(dailyBurn * 7, BUSINESS_MIN_CAPITAL[business.businessType] ?? 0);
            const recommendedPrice = ctx.economicGuidance?.recommendedPricesByType?.[business.businessType] ?? 25;
            const recommendedSalary = ctx.economicGuidance?.recommendedSalary ?? 80;

            if (business.treasury < reserveTarget && ctx.state.balanceSbyte > 200) {
                const needed = reserveTarget - business.treasury;
                const amount = Math.min(needed, Math.max(200, ctx.state.balanceSbyte * 0.2));
                candidates.push({
                    intentType: IntentType.INTENT_BUSINESS_INJECT,
                    params: { businessId: business.id, amount: Math.round(amount) },
                    basePriority: 70 + (runwayDays < 3 ? 10 : 0),
                    personalityBoost: PersonalityWeights.getBoost(ctx.personality.workEthic, true),
                    reason: `Business runway low (${runwayDays.toFixed(1)} days), injecting funds`,
                    domain: 'business',
                });
            }
            if (runwayDays < 2 && ctx.state.balanceSbyte < 200) {
                candidates.push({
                    intentType: IntentType.INTENT_CLOSE_BUSINESS,
                    params: { businessId: business.id, reason: 'low_runway' },
                    basePriority: 85,
                    personalityBoost: PersonalityWeights.getBoost(ctx.personality.selfInterest, true),
                    reason: `Business runway critical (${runwayDays.toFixed(1)} days), considering closure`,
                    domain: 'business',
                });
            }
            if (runwayDays > 20 && business.dailyRevenue > business.dailyExpenses && business.treasury > reserveTarget * 2) {
                const withdrawAmount = Math.min(200, business.treasury - reserveTarget * 1.5);
                candidates.push({
                    intentType: IntentType.INTENT_BUSINESS_WITHDRAW,
                    params: { businessId: business.id, amount: Math.max(50, Math.round(withdrawAmount)) },
                    basePriority: 45,
                    personalityBoost: PersonalityWeights.getBoost(ctx.personality.selfInterest, true),
                    reason: `Business profitable with long runway, withdrawing profits`,
                    domain: 'business',
                });
            }

            // Work at own business if not automated/understaffed
            const maxEmployees = (business as any).maxEmployees || 3;
            const requiredEmployees = Math.min(maxEmployees, Math.max(1, Math.ceil(business.level / 2)));
            const currentEmployees = business.employments ? business.employments.length : 0;
            const ownerWorkedRecently = business.ownerLastWorkedTick !== null
                && ctx.tick - Number(business.ownerLastWorkedTick) < REAL_DAY_TICKS;
            if (currentEmployees < requiredEmployees && !ownerWorkedRecently) {
                candidates.push({
                    intentType: IntentType.INTENT_WORK_OWN_BUSINESS,
                    params: { businessId: business.id },
                    basePriority: 65,
                    personalityBoost: PersonalityWeights.getBoost(ctx.personality.workEthic, true),
                    reason: `Staffing gap at ${business.name}; owner stepping in`,
                    domain: 'business',
                });
            }

            // 3. SET PRICES (Dynamic)
            if (business.dailyRevenue < business.dailyExpenses * 1.05) {
                const isCasino = business.businessType === BusinessType.CASINO;
                const adjustedPrice = Math.round(recommendedPrice * 1.1);
                candidates.push({
                    intentType: IntentType.INTENT_SET_PRICES,
                    params: isCasino
                        ? { businessId: business.id, minBet: 5, maxBet: 50 }
                        : { businessId: business.id, pricePerService: Math.max(5, adjustedPrice) },
                    basePriority: 60,
                    personalityBoost: 0,
                    reason: `Raising prices to improve margins for ${business.name}`,
                    domain: 'business',
                });
            } else if (business.dailyRevenue > business.dailyExpenses * 1.25 && (ctx.economicGuidance?.marketGapByType?.[business.businessType] ?? 0) < -0.2) {
                const isCasino = business.businessType === BusinessType.CASINO;
                const adjustedPrice = Math.round(recommendedPrice * 0.95);
                candidates.push({
                    intentType: IntentType.INTENT_SET_PRICES,
                    params: isCasino
                        ? { businessId: business.id, minBet: 3, maxBet: 35 }
                        : { businessId: business.id, pricePerService: Math.max(3, adjustedPrice) },
                    basePriority: 45,
                    personalityBoost: 0,
                    reason: `Lowering prices to stay competitive for ${business.name}`,
                    domain: 'business',
                });
            }

            // 4. HIRE EMPLOYEE
            if (currentEmployees < maxEmployees && business.treasury > recommendedSalary * 2) {
                const candidate = ctx.nearbyAgents.find(agent => !agent.isEnemy);
                if (candidate) {
                    candidates.push({
                        intentType: IntentType.INTENT_HIRE_EMPLOYEE,
                        params: { businessId: business.id, targetAgentId: candidate.id, offeredSalary: Math.max(50, Math.round(recommendedSalary)) },
                        basePriority: 38,
                        personalityBoost: PersonalityWeights.getBoost(ctx.personality.selfInterest, true),
                        reason: `Hiring ${candidate.name} for ${business.name}`,
                        domain: 'business',
                    });
                }
            }
        }

        return candidates;
    }
}

const BUSINESS_CONFIG: Record<string, { minWealth: string; buildCost: number }> = {
    BANK: { minWealth: 'W5', buildCost: 15000 },
    CASINO: { minWealth: 'W5', buildCost: 20000 },
    STORE: { minWealth: 'W3', buildCost: 2000 },
    RESTAURANT: { minWealth: 'W3', buildCost: 3000 },
    TAVERN: { minWealth: 'W3', buildCost: 2500 },
    GYM: { minWealth: 'W4', buildCost: 5000 },
    CLINIC: { minWealth: 'W4', buildCost: 8000 },
    REALESTATE: { minWealth: 'W5', buildCost: 10000 },
    WORKSHOP: { minWealth: 'W3', buildCost: 3500 },
    ENTERTAINMENT: { minWealth: 'W4', buildCost: 6000 },
};

const BUSINESS_MIN_CAPITAL: Record<string, number> = {
    RESTAURANT: 5000,
    CASINO: 50000,
    CLINIC: 10000,
    BANK: 100000,
    STORE: 3000,
    TAVERN: 2000,
    GYM: 2000,
    REALESTATE: 5000,
    WORKSHOP: 3000,
    ENTERTAINMENT: 2000,
};

const BUSINESS_PERSONALITY_FIT: Record<string, Array<keyof AgentContext['personality']>> = {
    BANK: ['selfInterest', 'patience'],
    CASINO: ['riskTolerance', 'selfInterest'],
    STORE: ['workEthic', 'patience'],
    RESTAURANT: ['socialNeed', 'creativity'],
    TAVERN: ['socialNeed', 'riskTolerance'],
    GYM: ['workEthic', 'energyManagement'],
    CLINIC: ['patience', 'workEthic'],
    REALESTATE: ['selfInterest', 'patience'],
    WORKSHOP: ['workEthic', 'creativity'],
    ENTERTAINMENT: ['creativity', 'socialNeed'],
};

function buildBusinessName(agentName: string, type: BusinessType): string {
    const suffixMap: Record<string, string> = {
        BANK: 'Bank',
        CASINO: 'Casino',
        STORE: 'Store',
        RESTAURANT: 'Kitchen',
        TAVERN: 'Tavern',
        GYM: 'Gym',
        CLINIC: 'Clinic',
        REALESTATE: 'Realty',
        WORKSHOP: 'Workshop',
        ENTERTAINMENT: 'Hall',
    };
    return `${agentName}'s ${suffixMap[type] ?? 'Business'}`;
}

function meetsWealthRequirement(currentRank: number, requiredTier: string): boolean {
    const requiredRank = parseInt(requiredTier.replace('W', ''), 10) || 0;
    return currentRank >= requiredRank;
}

function chooseBusinessType(ctx: AgentContext, wealthTierRank: number): BusinessType | null {
    if (!ctx.economy) return null;
    const candidateTypes = Object.keys(BUSINESS_CONFIG) as BusinessType[];
    let best: { type: BusinessType; score: number } | null = null;

    for (const type of candidateTypes) {
        const config = BUSINESS_CONFIG[type];
        if (!meetsWealthRequirement(wealthTierRank, config.minWealth)) continue;
        const minCapital = BUSINESS_MIN_CAPITAL[type] ?? 0;
        if (ctx.state.balanceSbyte < (config.buildCost + minCapital)) continue;

        const gap = ctx.economicGuidance?.marketGapByType?.[type] ?? 0;
        const personalityTraits = BUSINESS_PERSONALITY_FIT[type] ?? [];
        const personalityScore = personalityTraits.reduce((sum, trait) => sum + ((ctx.personality[trait] ?? 50) - 50), 0) / 5;
        const marketScore = gap * 40;
        const riskAdjustment = type === BusinessType.CASINO || type === BusinessType.BANK
            ? (ctx.personality.riskTolerance - 50) / 5
            : 0;
        const score = 20 + marketScore + personalityScore + riskAdjustment;

        if (!best || score > best.score) {
            best = { type, score };
        }
    }

    return best?.type ?? null;
}

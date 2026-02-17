export type PersonalityTraits = {
    ambition: number;
    riskTolerance: number;
    sociability: number;
};

export type CityConstructionQuote = {
    source: 'city';
    price: number;
    depositRequired: number;
    estimatedTicks: number;
    qualityBonus: number;
    speed: number;
};

export type ConstructorQuote = {
    source: 'private';
    constructorId: string;
    price: number;
    depositRequired: number;
    depositPercent: number;
    estimatedTicks: number;
    qualityBonus: number;
    speed: number;
};

export type BuildDecision = {
    method: 'city' | 'private';
    selectedConstructor: string | null;
    quote: CityConstructionQuote | ConstructorQuote;
    reasoning: string;
};

export class BusinessFounder {
    decideBuildMethod(params: {
        personality: PersonalityTraits;
        cityQuote: CityConstructionQuote;
        privateQuotes: ConstructorQuote[];
        maxBudget: number;
    }): BuildDecision {
        const options = [
            { ...params.cityQuote, score: this.scoreOption(params.cityQuote, params.personality, params.maxBudget) },
            ...params.privateQuotes.map(q => ({ ...q, score: this.scoreOption(q, params.personality, params.maxBudget) }))
        ];
        const affordable = options.filter(o => o.depositRequired <= params.maxBudget);
        if (affordable.length === 0) {
            return {
                method: 'city',
                selectedConstructor: null,
                quote: params.cityQuote,
                reasoning: 'No private options affordable, using city construction'
            };
        }
        const best = affordable.sort((a, b) => b.score - a.score)[0];
        return {
            method: best.source === 'city' ? 'city' : 'private',
            selectedConstructor: best.source === 'city' ? null : best.constructorId,
            quote: best,
            reasoning: this.explainDecision(best.source, params.personality)
        };
    }

    private scoreOption(
        option: CityConstructionQuote | ConstructorQuote,
        personality: PersonalityTraits,
        maxBudget: number
    ): number {
        let score = 0;
        const priceFactor = 1 - (option.price / maxBudget);
        const ambitionWeight = personality.ambition / 100;
        score += priceFactor * 30;
        score += option.speed * ambitionWeight * 40;
        const qualityFactor = (option.qualityBonus + 50) / 100;
        score += qualityFactor * ambitionWeight * 30;
        if (option.source === 'city') {
            score += ((100 - personality.riskTolerance) / 100) * 20;
        }
        return score;
    }

    private explainDecision(source: 'city' | 'private', personality: PersonalityTraits): string {
        if (source === 'city') {
            return personality.riskTolerance < 40
                ? 'Selected city construction for safety and reliability'
                : 'Selected city construction for best value';
        }
        return 'Selected private constructor for speed/quality trade-off';
    }
}

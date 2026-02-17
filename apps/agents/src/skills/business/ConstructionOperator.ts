export type ConstructionQuoteDecision = {
    accept: boolean;
    quote: number;
    depositPercent: number;
    estimatedTicks: number;
    qualityBonus: number;
};

export class ConstructionOperator {
    getCityBaseline(buildCost: number) {
        return {
            price: buildCost * 1.1,
            speedMultiplier: 1.0,
            qualityBonus: 0
        };
    }

    evaluateBuildRequest(params: {
        baseCost: number;
        constructorReputation: number;
        demandRatio: number;
        buildingType: string;
    }): ConstructionQuoteDecision {
        const rep = params.constructorReputation;
        const reputationMultiplier = rep > 800 ? 1.3 : rep > 600 ? 1.1 : rep > 400 ? 1.0 : 0.9;
        const demandMultiplier = params.demandRatio > 0.8 ? 1.2 : params.demandRatio < 0.5 ? 0.9 : 1.0;
        const quote = params.baseCost * reputationMultiplier * demandMultiplier;

        const speedMultiplier = rep > 800 ? 2.0 : rep > 600 ? 1.5 : rep > 400 ? 1.0 : 0.75;
        const qualityBonus = rep > 800 ? 250 : rep > 600 ? 100 : rep > 400 ? 0 : -50;
        const baseTicks = this.getBaseConstructionTicks(params.buildingType);
        const estimatedTicks = Math.max(1, Math.floor(baseTicks / speedMultiplier));

        const depositPercent = rep < 400 ? 0.5 : 0.2;

        return {
            accept: true,
            quote,
            depositPercent,
            estimatedTicks,
            qualityBonus
        };
    }

    private getBaseConstructionTicks(buildingType: string): number {
        const times: Record<string, number> = {
            SLUM_ROOM: 50,
            APARTMENT: 100,
            CONDO: 200,
            HOUSE: 500,
            VILLA: 1000,
            ESTATE: 1500,
            PALACE: 3000,
            CITADEL: 5000,
            RESTAURANT: 200,
            CASINO: 500,
            CLINIC: 500,
            BANK: 1000,
            ENTERTAINMENT: 200
        };
        return times[buildingType] ?? 200;
    }
}

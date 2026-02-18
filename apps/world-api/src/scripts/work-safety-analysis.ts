import { WORK_SEGMENTS_PER_DAY } from '../config/work.js';
import { getWorkStatusCost } from '../engine/work.utils.js';

type Tier = 'low' | 'mid' | 'high';

const TIERS: Tier[] = ['low', 'mid', 'high'];

function analyzeTier(tier: Tier) {
    const cost = getWorkStatusCost(tier, [], false);
    const minEnergy = 100 - (cost.energy * WORK_SEGMENTS_PER_DAY);
    const minHunger = 100 - (cost.hunger * WORK_SEGMENTS_PER_DAY);
    const minHealth = 100 - (cost.health * WORK_SEGMENTS_PER_DAY);

    return {
        tier,
        perSegment: cost,
        minAfterDay: {
            energy: minEnergy,
            hunger: minHunger,
            health: minHealth
        },
        safe: minEnergy > 0 && minHunger > 0 && minHealth > 0
    };
}

const results = TIERS.map(analyzeTier);
const failed = results.filter((result) => !result.safe);

console.log('Work safety analysis (10 segments per day)');
for (const result of results) {
    console.log(`Tier ${result.tier}:`, result);
}

if (failed.length > 0) {
    console.error('Unsafe tiers detected:', failed.map((f) => f.tier));
    process.exit(1);
}

/**
 * Events Routes
 * GET /api/v1/events - Query world events
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db.js';

const CATEGORY_EVENT_TYPES: Record<string, string[]> = {
    economy: [
        'EVENT_RENT_PAID',
        'EVENT_HOUSING_CHANGED',
        'EVENT_TRADE_COMPLETED',
        'EVENT_LISTING_CREATED',
        'EVENT_LISTING_CANCELLED',
        'EVENT_ITEM_BOUGHT',
        'EVENT_PROPERTY_BOUGHT',
        'EVENT_PROPERTY_SOLD',
        'EVENT_PROPERTY_LISTED',
        'EVENT_RENT_ADJUSTED',
        'EVENT_EVICTION',
        'EVENT_PROPERTY_TAX_PAID',
        'EVENT_PROPERTY_TAX_MISSED',
        'EVENT_PROPERTY_SEIZED',
        'EVENT_PROPERTY_MAINTAINED',
        'EVENT_PROPERTY_CONDEMNED',
        'EVENT_TENANT_LEFT',
        'EVENT_TENANT_RATED_LANDLORD',
        'EVENT_LANDLORD_RATED_TENANT',
        'EVENT_PUBLIC_JOB_APPLIED',
        'EVENT_PUBLIC_JOB_RESIGNED',
        'EVENT_SHIFT_STARTED',
        'EVENT_SHIFT_ENDED',
        'EVENT_SALARY_COLLECTED',
        'EVENT_PUBLIC_JOB_TERMINATED',
        'EVENT_BUSINESS_FOUNDED',
        'EVENT_BUSINESS_OPENED',
        'EVENT_BUSINESS_UPGRADED',
        'EVENT_BUSINESS_SOLD',
        'EVENT_BUSINESS_DISSOLVED',
        'EVENT_BUSINESS_BANKRUPT',
        'EVENT_BUSINESS_PAYROLL_PAID',
        'EVENT_BUSINESS_PAYROLL_MISSED',
        'EVENT_BUSINESS_CRITICAL_FUNDS',
        'EVENT_BUSINESS_LOW_GAS',
        'EVENT_BUSINESS_CLOSED',
        'EVENT_BUSINESS_TAX_PAID',
        'EVENT_BUSINESS_TAX_MISSED',
        'EVENT_BUSINESS_MAINTENANCE_PAID',
        'EVENT_BUSINESS_QUALITY_DROP',
        'EVENT_BUSINESS_INJECT',
        'EVENT_BUSINESS_WITHDRAW',
        'EVENT_EMPLOYEE_HIRED',
        'EVENT_EMPLOYEE_FIRED',
        'EVENT_EMPLOYEE_QUIT',
        'EVENT_EMPLOYEE_QUIT_UNPAID',
        'EVENT_EMPLOYEE_SALARY_ADJUSTED',
        'EVENT_BUSINESS_REVENUE_EARNED',
        'EVENT_BUSINESS_CUSTOMER_VISIT',
        'EVENT_BUSINESS_OWNER_WORKED',
        'EVENT_ITEM_CRAFTED',
        'EVENT_ITEM_CONSUMED',
        'EVENT_FORAGED',
        'EVENT_CONSTRUCTION_STARTED',
        'EVENT_CONSTRUCTION_COMPLETED'
    ],
    social: [
        'EVENT_SOCIALIZED',
        'EVENT_FLIRTED',
        'EVENT_RELATIONSHIP_CHANGED',
        'EVENT_ALLIANCE_PROPOSED',
        'EVENT_ALLIANCE_RESOLVED',
        'EVENT_ALLIANCE_BETRAYED',
        'EVENT_DATING_PROPOSED',
        'EVENT_DATING_RESOLVED',
        'EVENT_DATING_ENDED',
        'EVENT_MARRIAGE_PROPOSED',
        'EVENT_MARRIAGE_RESOLVED',
        'EVENT_DIVORCE',
        'EVENT_HOUSEHOLD_TRANSFER',
        'EVENT_BLACKLIST_UPDATED',
        'EVENT_SPOUSE_MOVE_CONSENT',
        'EVENT_REPUTATION_UPDATED'
    ],
    crime: [
        'EVENT_CRIME_COMMITTED',
        'EVENT_ARREST',
        'EVENT_IMPRISONED',
        'EVENT_RELEASED',
        'EVENT_PATROL_LOGGED'
    ],
    governance: [
        'EVENT_PROPOSAL_SUBMITTED',
        'EVENT_PROPOSAL_APPROVED',
        'EVENT_PROPOSAL_REJECTED',
        'EVENT_VOTE_CAST',
        'EVENT_SPENDING_ALLOCATED',
        'EVENT_CITY_UPGRADED',
        'EVENT_CITY_TAX_CHANGED',
        'EVENT_CITY_AID_APPLIED',
        'EVENT_CITY_SECURITY_FUNDED',
        'EVENT_CITY_RECESSION_DETECTED',
        'EVENT_GOD_RECESSION_INTERVENTION'
    ],
    agora: [
        'EVENT_AGORA_POSTED',
        'EVENT_AGORA_POST_REJECTED',
        'EVENT_AGORA_VOTED',
        'EVENT_AGORA_REPORTED',
        'EVENT_AGORA_POST_DELETED',
        'EVENT_ANGEL_REPORT_GENERATED'
    ]
};

const normalizeCategory = (value?: string) => {
    if (!value) return null;
    const normalized = value.toLowerCase();
    return CATEGORY_EVENT_TYPES[normalized] ? normalized : null;
};

const BUSINESS_BUILDING_TYPES = new Set([
    'RESTAURANT',
    'CASINO',
    'CLINIC',
    'BANK',
    'ENTERTAINMENT',
    'STORE',
    'TAVERN',
    'GYM',
    'REALESTATE',
    'WORKSHOP',
    'CONSTRUCTION'
]);

const BUSINESS_EVENT_TYPES = new Set([
    'EVENT_BUSINESS_FOUNDED',
    'EVENT_BUSINESS_OPENED',
    'EVENT_BUSINESS_UPGRADED',
    'EVENT_BUSINESS_SOLD',
    'EVENT_BUSINESS_DISSOLVED',
    'EVENT_BUSINESS_BANKRUPT',
    'EVENT_BUSINESS_PAYROLL_PAID',
    'EVENT_BUSINESS_PAYROLL_MISSED',
    'EVENT_BUSINESS_CRITICAL_FUNDS',
    'EVENT_BUSINESS_LOW_GAS',
    'EVENT_BUSINESS_CLOSED',
    'EVENT_BUSINESS_TAX_PAID',
    'EVENT_BUSINESS_TAX_MISSED',
    'EVENT_BUSINESS_MAINTENANCE_PAID',
    'EVENT_BUSINESS_QUALITY_DROP',
    'EVENT_BUSINESS_INJECT',
    'EVENT_BUSINESS_WITHDRAW',
    'EVENT_EMPLOYEE_HIRED',
    'EVENT_EMPLOYEE_FIRED',
    'EVENT_EMPLOYEE_QUIT',
    'EVENT_EMPLOYEE_QUIT_UNPAID',
    'EVENT_EMPLOYEE_SALARY_ADJUSTED',
    'EVENT_BUSINESS_REVENUE_EARNED',
    'EVENT_BUSINESS_CUSTOMER_VISIT',
    'EVENT_BUSINESS_OWNER_WORKED'
]);

const CONTINUOUS_EVENT_TYPES = new Set([
    'EVENT_RESTED',
    'EVENT_SHIFT_STARTED',
    'EVENT_SHIFT_ENDED',
    'EVENT_WORK_COMPLETED',
    'EVENT_BUSINESS_OWNER_WORKED'
]);

const PROPERTY_EVENT_TYPES = new Set([
    'EVENT_PROPERTY_BOUGHT',
    'EVENT_PROPERTY_SOLD',
    'EVENT_PROPERTY_LISTED',
    'EVENT_RENT_PAID',
    'EVENT_RENT_ADJUSTED',
    'EVENT_PROPERTY_TAX_PAID',
    'EVENT_PROPERTY_TAX_MISSED',
    'EVENT_PROPERTY_SEIZED',
    'EVENT_PROPERTY_MAINTAINED',
    'EVENT_PROPERTY_CONDEMNED',
    'EVENT_TENANT_LEFT',
    'EVENT_TENANT_RATED_LANDLORD',
    'EVENT_LANDLORD_RATED_TENANT',
    'EVENT_EVICTION',
    'EVENT_HOUSING_CHANGED'
]);

const CONSTRUCTION_EVENT_TYPES = new Set([
    'EVENT_CONSTRUCTION_STARTED',
    'EVENT_CONSTRUCTION_COMPLETED',
    'EVENT_CONSTRUCTION_PROJECT_PAUSED'
]);

const mapEventType = (type: string, buildingType?: string | null) => {
    switch (type) {
        case 'EVENT_WORK_COMPLETED':
        case 'EVENT_SHIFT_STARTED':
        case 'EVENT_SHIFT_ENDED':
        case 'EVENT_PUBLIC_JOB_RESIGNED':
        case 'EVENT_PUBLIC_JOB_TERMINATED':
        case 'EVENT_BUSINESS_OWNER_WORKED':
            return 'worked';
        case 'EVENT_PUBLIC_JOB_APPLIED':
        case 'EVENT_PRIVATE_JOB_APPLIED':
            return 'job_search';
        case 'EVENT_PRIVATE_JOB_ACCEPTED':
            return 'job_accepted';
        case 'EVENT_REPUTATION_UPDATED':
            return 'reputation';
        case 'EVENT_SALARY_COLLECTED':
            return 'salary_collected';
        case 'EVENT_RESTED':
            return 'rest';
        case 'EVENT_ITEM_CONSUMED':
        case 'EVENT_FORAGED':
            return 'eat';
        case 'EVENT_RELATIONSHIP_CHANGED':
        case 'EVENT_SOCIALIZED':
        case 'EVENT_FLIRTED':
        case 'EVENT_ALLIANCE_PROPOSED':
        case 'EVENT_ALLIANCE_RESOLVED':
        case 'EVENT_ALLIANCE_BETRAYED':
        case 'EVENT_DATING_PROPOSED':
        case 'EVENT_DATING_RESOLVED':
        case 'EVENT_DATING_ENDED':
        case 'EVENT_MARRIAGE_PROPOSED':
        case 'EVENT_MARRIAGE_RESOLVED':
        case 'EVENT_DIVORCE':
        case 'EVENT_HOUSEHOLD_TRANSFER':
        case 'EVENT_BLACKLIST_UPDATED':
        case 'EVENT_SPOUSE_MOVE_CONSENT':
            return type === 'EVENT_FLIRTED' ? 'flirted' : 'socialize';
        case 'EVENT_CITY_MOVED':
            return 'move';
        case 'EVENT_RENT_PAID':
            return 'rent_paid';
        case 'EVENT_HOUSING_CHANGED':
            return 'housing_changed';
        case 'EVENT_RENT_ADJUSTED':
        case 'EVENT_PROPERTY_TAX_PAID':
        case 'EVENT_PROPERTY_TAX_MISSED':
        case 'EVENT_PROPERTY_SEIZED':
        case 'EVENT_PROPERTY_MAINTAINED':
        case 'EVENT_PROPERTY_CONDEMNED':
        case 'EVENT_TENANT_LEFT':
        case 'EVENT_TENANT_RATED_LANDLORD':
        case 'EVENT_LANDLORD_RATED_TENANT':
            return 'housing_changed';
        case 'EVENT_PROPERTY_BOUGHT':
            return 'property_purchased';
        case 'EVENT_PROPERTY_SOLD':
            return 'sold_property';
        case 'EVENT_PROPERTY_LISTED':
            return 'market_listed';
        case 'EVENT_HOUSING_CHANGED':
            return 'rented_property';
        case 'EVENT_ITEM_BOUGHT':
            return 'buy_item';
        case 'EVENT_LISTING_CREATED':
        case 'EVENT_LISTING_CANCELLED':
            return 'market_listed';
        case 'EVENT_TRADE_COMPLETED':
            return 'traded';
        case 'EVENT_ITEM_CRAFTED':
            return 'crafted';
        case 'EVENT_BUSINESS_FOUNDED':
            return 'founded_business';
        case 'EVENT_BUSINESS_OPENED':
            return 'business_opened';
        case 'EVENT_BUSINESS_SOLD':
            return 'business_purchased';
        case 'EVENT_CONSTRUCTION_STARTED':
            return 'property_construction_started';
        case 'EVENT_CONSTRUCTION_COMPLETED':
            return BUSINESS_BUILDING_TYPES.has(String(buildingType))
                ? 'business_constructed'
                : 'property_construction_completed';
        case 'EVENT_BUSINESS_UPGRADED':
        case 'EVENT_BUSINESS_DISSOLVED':
        case 'EVENT_BUSINESS_BANKRUPT':
        case 'EVENT_BUSINESS_PAYROLL_PAID':
        case 'EVENT_BUSINESS_PAYROLL_MISSED':
        case 'EVENT_BUSINESS_CRITICAL_FUNDS':
        case 'EVENT_BUSINESS_LOW_GAS':
        case 'EVENT_BUSINESS_CLOSED':
        case 'EVENT_BUSINESS_TAX_PAID':
        case 'EVENT_BUSINESS_TAX_MISSED':
        case 'EVENT_BUSINESS_MAINTENANCE_PAID':
        case 'EVENT_BUSINESS_QUALITY_DROP':
        case 'EVENT_BUSINESS_INJECT':
        case 'EVENT_BUSINESS_WITHDRAW':
        case 'EVENT_EMPLOYEE_HIRED':
        case 'EVENT_EMPLOYEE_FIRED':
        case 'EVENT_EMPLOYEE_QUIT':
        case 'EVENT_EMPLOYEE_QUIT_UNPAID':
        case 'EVENT_EMPLOYEE_SALARY_ADJUSTED':
        case 'EVENT_BUSINESS_REVENUE_EARNED':
        case 'EVENT_BUSINESS_CUSTOMER_VISIT':
            return 'business_founded';
        case 'EVENT_EVICTION':
            return 'eviction';
        case 'EVENT_VOTE_CAST':
            return 'vote';
        case 'EVENT_PROPOSAL_SUBMITTED':
            return 'propose';
        case 'EVENT_PROPOSAL_APPROVED':
        case 'EVENT_PROPOSAL_REJECTED':
        case 'EVENT_SPENDING_ALLOCATED':
        case 'EVENT_CITY_UPGRADED':
        case 'EVENT_CITY_TAX_CHANGED':
        case 'EVENT_CITY_AID_APPLIED':
        case 'EVENT_CITY_SECURITY_FUNDED':
        case 'EVENT_CITY_RECESSION_DETECTED':
        case 'EVENT_GOD_RECESSION_INTERVENTION':
            return 'propose';
        case 'EVENT_AGORA_POSTED':
            return 'agora_posted';
        case 'EVENT_LIFE_EVENT_FORTUNE':
            return 'fortune';
        case 'EVENT_LIFE_EVENT_MISFORTUNE':
            return 'misfortune';
        case 'EVENT_CRIME_COMMITTED':
            return 'crime';
        case 'EVENT_IMPRISONED':
            return 'imprisoned';
        case 'EVENT_FROZEN':
        case 'EVENT_UNFROZEN':
            return 'freeze_revived';
        case 'EVENT_COMBAT_RESULT':
            return 'battle';
        default:
            return 'action';
    }
};

const buildDescription = (
    eventType: string,
    event: { type: string; sideEffects?: any; outcome?: string },
    context: { targetName?: string | null; publicPlaceName?: string | null; role?: string | null; shiftHours?: number | null }
) => {
    const fx = event.sideEffects ?? {};
    const targetName = context.targetName ?? 'another agent';
    const publicPlaceName = context.publicPlaceName ?? fx.publicPlaceName ?? 'a public place';
    const roleName = context.role ?? fx.role ?? 'staff';
    const shiftHours = context.shiftHours ?? fx.shiftDurationHours ?? null;
    const formatTitle = (value: string) => value
        .toLowerCase()
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    const readableRole = typeof roleName === 'string' ? formatTitle(roleName) : roleName;
    const formatSbyte = (value?: string | number) => {
        if (value === undefined || value === null) return 'Unknown SBYTE';
        const num = Number(value);
        if (Number.isNaN(num)) return `${value} SBYTE`;
        return `${num.toFixed(2)} SBYTE`;
    };
    const blockedReason = fx.reason ? ` (blocked: ${fx.reason})` : '';

    switch (event.type) {
        case 'EVENT_ALLIANCE_PROPOSED':
            return `Proposed an alliance with ${targetName}.${event.outcome === 'blocked' ? blockedReason : ''}`;
        case 'EVENT_ALLIANCE_RESOLVED':
            return `Alliance decision with ${targetName}: ${fx.action ?? 'resolved'}.${event.outcome === 'blocked' ? blockedReason : ''}`;
        case 'EVENT_ALLIANCE_BETRAYED':
            return `Betrayed an alliance with ${targetName}.${event.outcome === 'blocked' ? blockedReason : ''}`;
        case 'EVENT_DATING_PROPOSED':
            return `Proposed dating ${targetName}.${event.outcome === 'blocked' ? blockedReason : ''}`;
        case 'EVENT_DATING_RESOLVED':
            return `Dating decision with ${targetName}: ${fx.action ?? 'resolved'}.${event.outcome === 'blocked' ? blockedReason : ''}`;
        case 'EVENT_DATING_ENDED':
            return `Ended dating with ${targetName}.${event.outcome === 'blocked' ? blockedReason : ''}`;
        case 'EVENT_MARRIAGE_PROPOSED':
            return `Proposed marriage to ${targetName}.${event.outcome === 'blocked' ? blockedReason : ''}`;
        case 'EVENT_MARRIAGE_RESOLVED':
            return `Marriage decision with ${targetName}: ${fx.action ?? 'resolved'}.${event.outcome === 'blocked' ? blockedReason : ''}`;
        case 'EVENT_DIVORCE':
            return `Divorced ${targetName}.${event.outcome === 'blocked' ? blockedReason : ''}`;
        case 'EVENT_HOUSEHOLD_TRANSFER':
            return `Transferred ${formatSbyte(fx.amount)} to ${targetName}.${event.outcome === 'blocked' ? blockedReason : ''}`;
        case 'EVENT_BLACKLIST_UPDATED':
            return `${fx.action === 'remove' ? 'Removed' : 'Added'} ${targetName} ${fx.action === 'remove' ? 'from' : 'to'} blacklist.${event.outcome === 'blocked' ? blockedReason : ''}`;
        case 'EVENT_SOCIALIZED':
            return `Socialized with ${targetName}.${event.outcome === 'blocked' ? blockedReason : ''}`;
        case 'EVENT_FLIRTED':
            return `Flirted with ${targetName}.${event.outcome === 'blocked' ? blockedReason : ''}`;
        case 'EVENT_PUBLIC_JOB_APPLIED':
            return `Looking for work at ${publicPlaceName}.${event.outcome === 'blocked' ? blockedReason : ''}`;
        case 'EVENT_PRIVATE_JOB_APPLIED':
            return `Looking for work at ${fx.businessName ?? 'a local business'}.${event.outcome === 'blocked' ? blockedReason : ''}`;
        case 'EVENT_PRIVATE_JOB_ACCEPTED':
            return `Job offer accepted at ${fx.businessName ?? 'a local business'}.`;
        case 'EVENT_SHIFT_STARTED':
            if (event.outcome === 'blocked') {
                return `Shift start blocked at ${publicPlaceName}.${blockedReason}`;
            }
            return `Started a public shift at ${publicPlaceName} as ${readableRole} for ${shiftHours ?? '?'}h (sim).`;
        case 'EVENT_SHIFT_ENDED':
            return `Completed a shift at ${publicPlaceName} and will rest for ${fx.restDurationHours ?? '?'}h (sim).`;
        case 'EVENT_WORK_COMPLETED':
            if (event.outcome === 'blocked') {
                return `Work blocked.${blockedReason}`;
            }
            if (fx.segmentComplete) {
                return `Finished work segment ${fx.segmentIndex ?? '?'}/10 and completed a full workday.`;
            }
            return `Finished work segment ${fx.segmentIndex ?? '?'}/10; payment pending until the workday completes.`;
        case 'EVENT_REPUTATION_UPDATED':
            return `Reputation changed by ${fx.delta ?? 0}.`;
        case 'EVENT_SALARY_COLLECTED':
            if (event.outcome === 'blocked') {
                return `Salary collection blocked.${blockedReason}`;
            }
            return `Collected salary of ${formatSbyte(fx.netSalary ?? fx.grossSalary)} from ${fx.publicPlaceName ?? 'the public vault'}.`;
        case 'EVENT_BUSINESS_CUSTOMER_VISIT':
            return `Paid ${formatSbyte(fx.price ?? fx.totalCost ?? fx.amount)} for services at a business.`;
        case 'EVENT_BUSINESS_PAYROLL_PAID':
            return `Business payroll cleared: ${formatSbyte(fx.totalPayroll)} sent to employees.`;
        case 'EVENT_BUSINESS_PAYROLL_MISSED':
            return `Business payroll missed; employees were not paid on time.`;
        case 'EVENT_BUSINESS_OWNER_WORKED':
            return `Owner covered a shift (segment ${fx.segmentIndex ?? '?'}/10) to keep the business running.`;
        case 'EVENT_RESTED':
            return `Resting in ${fx.housingTier ?? 'housing'} for ${fx.restHours ?? '?'}h to recover.`;
        case 'EVENT_RENT_PAID':
            return `Paid rent of ${formatSbyte(fx.amount ?? fx.rent)} to stay housed.`;
        case 'EVENT_HOUSING_CHANGED':
            return `Changed housing to ${fx.newHousingTier ?? fx.housingTier ?? 'a new home'}.`;
        case 'EVENT_ITEM_CONSUMED':
            return `Consumed ${fx.itemName ?? 'a consumable'} to recover status.`;
        case 'EVENT_ITEM_BOUGHT':
            if (event.outcome === 'blocked') {
                return `Purchase blocked.${blockedReason}`;
            }
            return `Purchased ${fx.itemName ?? 'an item'} for ${formatSbyte(fx.price ?? fx.totalCost ?? fx.amount)}.`;
        case 'EVENT_ITEM_CRAFTED':
            return `Crafted ${fx.itemName ?? 'an item'} using local materials.`;
        case 'EVENT_PROPERTY_BOUGHT':
            return `Purchased property${fx.housingTier ? ` (${fx.housingTier})` : ''}.`;
        case 'EVENT_PROPERTY_SOLD':
            return `Sold property for ${formatSbyte(fx.salePrice ?? fx.amount)}.`;
        case 'EVENT_PROPERTY_LISTED':
            return `Listed property${fx.housingTier ? ` (${fx.housingTier})` : ''} for sale.`;
        case 'EVENT_AGORA_POSTED':
            return `Posted an opinion to Agora on ${fx.topic ?? 'a civic topic'}.`;
        case 'EVENT_LIFE_EVENT_FORTUNE':
            return `Fortune event: gained ${formatSbyte(fx.amount)}.`;
        case 'EVENT_LIFE_EVENT_MISFORTUNE':
            return `Misfortune event: lost ${formatSbyte(fx.amount)}.`;
        default:
            break;
    }

    if (eventType === 'worked') return 'Worked';
    if (eventType === 'salary_collected') return 'Collected salary';
    if (eventType === 'rest') return 'Rested';
    if (eventType === 'eat') return 'Ate food';
    if (eventType === 'socialize') return `Socialized with ${targetName}.`;
    if (eventType === 'move') return 'Moved city';
    if (eventType === 'property_purchased') return 'Purchased property';
    if (eventType === 'rented_property') return 'Rented property';
    if (eventType === 'sold_property') return 'Listed or sold property';
    if (eventType === 'buy_item') return 'Purchased item';
    if (eventType === 'traded') return 'Market activity';
    if (eventType === 'market_listed') return 'Created a market listing';
    if (eventType === 'founded_business') return 'Founded a business';
    if (eventType === 'business_opened') return 'Business opened';
    if (eventType === 'business_constructed') return 'Business constructed';
    if (eventType === 'property_construction_started') return 'Construction started';
    if (eventType === 'property_construction_completed') return 'Construction completed';
    if (eventType === 'business_purchased') return 'Purchased a business';
    if (eventType === 'crafted') return 'Crafted an item';
    if (eventType === 'rent_paid') return 'Paid rent';
    if (eventType === 'housing_changed') return 'Changed housing';
    if (eventType === 'eviction') return 'Evicted';
    if (eventType === 'agora_posted') return 'Posted to Agora';
    if (eventType === 'fortune') return 'Fortune event';
    if (eventType === 'misfortune') return 'Misfortune event';
    if (eventType === 'crime') return 'Crime committed';
    if (eventType === 'imprisoned') return 'Imprisoned';
    if (eventType === 'battle') return 'Battle result';
    if (eventType === 'vote') return 'Voted in election';
    if (eventType === 'propose') return 'Submitted proposal';
    return event.sideEffects?.reason ? String(event.sideEffects.reason) : event.type;
};

export async function eventsRoutes(app: FastifyInstance) {
    /**
     * GET /api/v1/events
     * Query events with optional filters
     * 
     * Query params:
     * - actorId: Filter by actor
     * - type: Filter by event type
     * - outcome: Filter by outcome (success/fail/blocked)
     * - fromTick: Events from this tick onwards
     * - toTick: Events up to this tick
     * - limit: Max results (default 50, max 200)
     */
    app.get('/api/v1/events', async (request: FastifyRequest, reply: FastifyReply) => {
        const {
            actorId,
            type,
            category,
            search,
            cityId,
            outcome,
            fromTick,
            toTick,
            offset = 0,
            limit = 50
        } = request.query as {
            actorId?: string;
            type?: string;
            category?: string;
            search?: string;
            cityId?: string;
            outcome?: string;
            fromTick?: string;
            toTick?: string;
            offset?: number;
            limit?: number;
        };

        try {
            const and: Record<string, unknown>[] = [];

            if (actorId) {
                and.push({ actorId });
            }

            const categoryKey = normalizeCategory(category) ?? normalizeCategory(type);
            if (categoryKey) {
                and.push({ type: { in: CATEGORY_EVENT_TYPES[categoryKey] } });
            } else if (type) {
                and.push({ type });
            }

            if (outcome) {
                and.push({ outcome });
            }

            if (fromTick || toTick) {
                const tickRange: Record<string, number> = {};
                if (fromTick) {
                    tickRange.gte = parseInt(fromTick, 10);
                }
                if (toTick) {
                    tickRange.lte = parseInt(toTick, 10);
                }
                and.push({ tick: tickRange });
            }

            if (search) {
                and.push({
                    actor: {
                        name: {
                            contains: search,
                            mode: 'insensitive'
                        }
                    }
                });
            }

            if (cityId) {
                and.push({
                    OR: [
                        { actor: { agentState: { cityId } } },
                        { targetIds: { has: cityId } }
                    ]
                });
            }

            // Hide system (God) events from public feeds
            and.push({
                NOT: { actor: { isGod: true } }
            });

            const where = and.length > 0 ? { AND: and } : {};

            let events = await prisma.event.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: Math.max(Number(offset), 0),
                take: Math.min(Number(limit), 200),
                include: {
                    actor: {
                        select: {
                            id: true,
                            name: true,
                            kind: true,
                            agentState: { select: { cityId: true, jobType: true } }
                        }
                    }
                }
            });
            events = events.filter((event) => {
                if (event.outcome !== 'blocked') return true;
                if (event.type !== 'EVENT_PUBLIC_JOB_APPLIED' && event.type !== 'EVENT_PRIVATE_JOB_APPLIED') {
                    return true;
                }
                const reason = (event.sideEffects as any)?.reason;
                return reason !== 'job_change_cooldown';
            });
            const seenContinuous = new Set<string>();
            events = events.filter((event) => {
                if (!CONTINUOUS_EVENT_TYPES.has(event.type)) return true;
                const key = `${event.actorId}|${event.type}`;
                if (seenContinuous.has(key)) return false;
                seenContinuous.add(key);
                return true;
            });

            const currentTick = await prisma.worldState.findFirst({ where: { id: 1 } });

            const missingActorIds = events
                .filter((event) => !event.actor?.name)
                .map((event) => event.actorId);
            const uniqueMissingActorIds = Array.from(new Set(missingActorIds));
            const fallbackActors = uniqueMissingActorIds.length > 0
                ? await prisma.actor.findMany({
                    where: { id: { in: uniqueMissingActorIds } },
                    select: { id: true, name: true }
                })
                : [];

            const allTargetActorIds = Array.from(new Set(events.flatMap((event) => event.targetIds || [])));
            const targetActors = allTargetActorIds.length > 0
                ? await prisma.actor.findMany({
                    where: { id: { in: allTargetActorIds } },
                    select: { id: true, name: true }
                })
                : [];

            const sideEffectValues = events.map((event) => event.sideEffects ?? {});
            const businessIds = new Set<string>();
            const propertyIds = new Set<string>();
            const itemDefIds = new Set<string>();
            const publicPlaceIds = new Set<string>();
            const constructionProjectIds = new Set<string>();
            const marketListingIds = new Set<string>();
            const privateEmploymentIds = new Set<string>();

            events.forEach((event, index) => {
                const sideEffects = sideEffectValues[index] as Record<string, any>;
                const businessId = sideEffects.businessId || sideEffects.business_id;
                const propertyId = sideEffects.propertyId || sideEffects.property_id || sideEffects.toPropertyId;
                const itemDefId = sideEffects.itemDefId || sideEffects.item_id || sideEffects.itemDef || sideEffects.outputItemId;
                const publicPlaceId = sideEffects.publicPlaceId;
                const constructionId = sideEffects.projectId;
                const listingId = sideEffects.listingId;
                const privateEmploymentId = sideEffects.privateEmploymentId;

                if (businessId) businessIds.add(businessId);
                if (propertyId) propertyIds.add(propertyId);
                if (itemDefId) itemDefIds.add(itemDefId);
                if (publicPlaceId) publicPlaceIds.add(publicPlaceId);
                if (constructionId) constructionProjectIds.add(constructionId);
                if (listingId) marketListingIds.add(listingId);
                if (privateEmploymentId) privateEmploymentIds.add(privateEmploymentId);

                if (BUSINESS_EVENT_TYPES.has(event.type)) {
                    event.targetIds?.forEach((id) => businessIds.add(id));
                }
                if (PROPERTY_EVENT_TYPES.has(event.type)) {
                    event.targetIds?.forEach((id) => propertyIds.add(id));
                }
                if (CONSTRUCTION_EVENT_TYPES.has(event.type)) {
                    event.targetIds?.forEach((id) => constructionProjectIds.add(id));
                }
                if (['EVENT_PUBLIC_JOB_APPLIED', 'EVENT_PUBLIC_JOB_RESIGNED', 'EVENT_SHIFT_STARTED', 'EVENT_SHIFT_ENDED', 'EVENT_PUBLIC_JOB_TERMINATED'].includes(event.type)) {
                    event.targetIds?.forEach((id) => publicPlaceIds.add(id));
                }
            });

            const [
                businesses,
                properties,
                itemDefs,
                publicPlaces,
                constructionProjects,
                marketListings,
                privateEmployments
            ] = await Promise.all([
                businessIds.size > 0
                    ? prisma.business.findMany({
                        where: { id: { in: Array.from(businessIds) } },
                        select: { id: true, name: true, businessType: true, ownerId: true, cityId: true, status: true, isOpen: true, treasury: true, landId: true }
                    })
                    : Promise.resolve([]),
                propertyIds.size > 0
                    ? prisma.property.findMany({
                        where: { id: { in: Array.from(propertyIds) } },
                        select: { id: true, housingTier: true, lotType: true, ownerId: true, rentPrice: true, salePrice: true }
                    })
                    : Promise.resolve([]),
                itemDefIds.size > 0
                    ? prisma.itemDefinition.findMany({ where: { id: { in: Array.from(itemDefIds) } }, select: { id: true, name: true } })
                    : Promise.resolve([]),
                publicPlaceIds.size > 0
                    ? prisma.publicPlace.findMany({ where: { id: { in: Array.from(publicPlaceIds) } }, select: { id: true, name: true, type: true, cityId: true } })
                    : Promise.resolve([]),
                constructionProjectIds.size > 0
                    ? prisma.constructionProject.findMany({ where: { id: { in: Array.from(constructionProjectIds) } }, select: { id: true, lotId: true, buildingType: true, status: true } })
                    : Promise.resolve([]),
                marketListingIds.size > 0
                    ? prisma.marketListing.findMany({
                        where: { id: { in: Array.from(marketListingIds) } },
                        select: { id: true, itemDefId: true, quantity: true, priceEach: true, sellerId: true, cityId: true }
                    })
                    : Promise.resolve([]),
                privateEmploymentIds.size > 0
                    ? prisma.privateEmployment.findMany({
                        where: { id: { in: Array.from(privateEmploymentIds) } },
                        select: { id: true, businessId: true, salaryDaily: true }
                    })
                    : Promise.resolve([]),
            ]);

            const businessById = new Map(businesses.map((b) => [b.id, b]));
            const propertyById = new Map(properties.map((p) => [p.id, p]));
            const itemNameById = new Map(itemDefs.map((i) => [i.id, i.name]));
            const publicPlaceById = new Map(publicPlaces.map((p) => [p.id, p]));
            const constructionById = new Map(constructionProjects.map((p) => [p.id, p]));
            const marketListingById = new Map(marketListings.map((l) => [l.id, l]));
            const privateEmploymentById = new Map(privateEmployments.map((e) => [e.id, e]));

            const propertyNameById = new Map(properties.map((p) => [
                p.id,
                p.lotType ? `${p.lotType} Property` : `${p.housingTier} Property`
            ]));

            const extraActorIds = new Set<string>();
            businesses.forEach((b) => b.ownerId && extraActorIds.add(b.ownerId));
            properties.forEach((p) => p.ownerId && extraActorIds.add(p.ownerId));
            marketListings.forEach((l) => l.sellerId && extraActorIds.add(l.sellerId));
            sideEffectValues.forEach((sideEffects: any) => {
                if (sideEffects?.buyerId) extraActorIds.add(sideEffects.buyerId);
                if (sideEffects?.sellerId) extraActorIds.add(sideEffects.sellerId);
                if (sideEffects?.landlordId) extraActorIds.add(sideEffects.landlordId);
            });

            const extraActors = extraActorIds.size > 0
                ? await prisma.actor.findMany({
                    where: { id: { in: Array.from(extraActorIds) } },
                    select: { id: true, name: true }
                })
                : [];

            const actorNameById = new Map<string, string>();
            fallbackActors.forEach((actor) => actorNameById.set(actor.id, actor.name));
            targetActors.forEach((actor) => actorNameById.set(actor.id, actor.name));
            extraActors.forEach((actor) => actorNameById.set(actor.id, actor.name));

            return reply.send(events.map(event => {
                const actorName = event.actor?.name
                    ?? actorNameById.get(event.actorId)
                    ?? 'Unknown';
                const sideEffects = (event.sideEffects ?? {}) as Record<string, any>;
                const targetIds = event.targetIds ?? [];
                const targetNames = targetIds.map((id) => actorNameById.get(id)).filter(Boolean);
                const businessId = sideEffects.businessId || sideEffects.business_id;
                const propertyId = sideEffects.propertyId || sideEffects.property_id || sideEffects.toPropertyId;
                const itemDefId = sideEffects.itemDefId || sideEffects.item_id || sideEffects.itemDef;
                const constructionProject = (sideEffects.projectId && constructionById.get(sideEffects.projectId))
                    || (targetIds.length > 0 ? constructionById.get(targetIds[0]) : undefined);
                const buildingType = constructionProject?.buildingType ?? sideEffects.buildingType ?? null;
                const eventType = mapEventType(event.type, buildingType);
                const business = businessId ? businessById.get(businessId) : (BUSINESS_EVENT_TYPES.has(event.type) ? businessById.get(targetIds[0]) : undefined);
                const property = propertyId ? propertyById.get(propertyId) : (PROPERTY_EVENT_TYPES.has(event.type) ? propertyById.get(targetIds[0]) : undefined);
                const listing = sideEffects.listingId ? marketListingById.get(sideEffects.listingId) : undefined;
                const privateEmployment = sideEffects.privateEmploymentId ? privateEmploymentById.get(sideEffects.privateEmploymentId) : undefined;
                const publicPlace = sideEffects.publicPlaceId ? publicPlaceById.get(sideEffects.publicPlaceId) : (publicPlaceById.get(targetIds[0]) ?? null);

                const businessName = business?.name ?? null;
                const propertyName = property ? propertyNameById.get(property.id) ?? null : null;
                const propertyType = property?.lotType ?? property?.housingTier ?? null;
                const itemName = itemDefId ? itemNameById.get(itemDefId) ?? null : null;
                const listingItemName = listing?.itemDefId ? itemNameById.get(listing.itemDefId) ?? null : null;

                const workedMeta = eventType === 'worked'
                    ? {
                        businessId: business?.id ?? privateEmployment?.businessId ?? null,
                        businessName: businessName ?? null,
                        profession: sideEffects.profession ?? sideEffects.role ?? sideEffects.jobType ?? event.actor?.agentState?.jobType ?? null,
                        sector: sideEffects.publicPlaceId || publicPlace ? 'public' : (business || privateEmployment ? 'private' : null),
                        earnings: sideEffects.netWage ?? sideEffects.dailySalary ?? sideEffects.salaryDaily ?? null,
                        hoursWorked: sideEffects.shiftDurationHours ?? sideEffects.workHours ?? sideEffects.hoursWorked ?? null
                    }
                    : {};

                const foundedBusinessMeta = eventType === 'founded_business'
                    ? {
                        businessId: business?.id ?? businessId ?? null,
                        businessName: businessName ?? sideEffects.businessName ?? null,
                        category: business?.businessType ?? sideEffects.businessType ?? null,
                        initialCapital: sideEffects.initialCapital ?? (business?.treasury?.toString?.() ?? null)
                    }
                    : {};

                const constructedBusinessMeta = eventType === 'business_constructed'
                    ? {
                        businessName: businessName ?? (buildingType ? `${buildingType} Property` : null),
                        status: 'operational'
                    }
                    : {};

                const propertyPurchaseMeta = eventType === 'property_purchased'
                    ? {
                        propertyName,
                        propertyType,
                        price: sideEffects.price ?? null
                    }
                    : {};

                const propertySoldMeta = eventType === 'sold_property'
                    ? {
                        propertyName,
                        propertyType,
                        price: sideEffects.price ?? null,
                        buyer: sideEffects.buyerId ? actorNameById.get(sideEffects.buyerId) ?? null : null
                    }
                    : {};

                const rentedMeta = eventType === 'rented_property'
                    ? {
                        propertyName,
                        propertyType,
                        rentPrice: sideEffects.cost ?? property?.rentPrice?.toString?.() ?? null,
                        landlordName: property?.ownerId ? actorNameById.get(property.ownerId) ?? null : null
                    }
                    : {};

                const tradeMeta = eventType === 'traded'
                    ? {
                        itemName: sideEffects.itemName ?? listingItemName ?? null,
                        quantity: sideEffects.quantity ?? listing?.quantity ?? null,
                        price: sideEffects.totalCost ?? sideEffects.revenue ?? (listing?.priceEach?.toString?.() ?? null),
                        partnerName: targetNames[0] ?? null
                    }
                    : {};

                const craftedMeta = eventType === 'crafted'
                    ? {
                        itemName: sideEffects.outputItemName ?? itemName ?? null,
                        quantity: sideEffects.quantity ?? null,
                        materialsUsed: sideEffects.materialsUsed ?? null
                    }
                    : {};

                const constructionMeta = (eventType === 'property_construction_started' || eventType === 'property_construction_completed')
                    ? {
                        propertyName: propertyName ?? (constructionProject?.lotId ? propertyNameById.get(constructionProject.lotId) ?? null : null),
                        propertyType: propertyType ?? null,
                        price: sideEffects.price ?? sideEffects.amount ?? sideEffects.deposit ?? null,
                        constructionProgress: constructionProject?.status
                            ?? (event.type === 'EVENT_CONSTRUCTION_STARTED' ? 'in_progress' : null)
                    }
                    : {};

                const businessOpenedMeta = eventType === 'business_opened'
                    ? {
                        businessName: businessName ?? sideEffects.businessName ?? null,
                        status: sideEffects.status ?? 'operational'
                    }
                    : {};
                return {
                    id: event.id,
                    tick: event.tick || currentTick?.tick || 0,
                    eventType,
                    actorId: event.actorId,
                    actorName,
                    description: buildDescription(
                        eventType,
                        { type: event.type, sideEffects, outcome: event.outcome },
                        {
                            targetName: targetNames[0] ?? null,
                            publicPlaceName: publicPlace?.name ?? null,
                            role: sideEffects.role ?? sideEffects.profession ?? null,
                            shiftHours: sideEffects.shiftDurationHours ?? null
                        }
                    ),
                    cityId: event.actor?.agentState?.cityId ?? null,
                    metadata: {
                        ...sideEffects,
                        outcome: event.outcome,
                        targetIds,
                        rawType: event.type,
                        targetName: targetNames[0] ?? null,
                        targetNames,
                        businessName: businessName ?? null,
                        propertyName: propertyName ?? null,
                        propertyType,
                        itemName,
                        publicPlaceName: publicPlace?.name ?? null,
                        publicPlaceType: publicPlace?.type ?? null,
                        ...workedMeta,
                        ...foundedBusinessMeta,
                        ...constructedBusinessMeta,
                        ...propertyPurchaseMeta,
                        ...propertySoldMeta,
                        ...rentedMeta,
                        ...tradeMeta,
                        ...craftedMeta,
                        ...constructionMeta,
                        ...businessOpenedMeta
                    },
                    createdAt: event.createdAt,
                };
            }));
        } catch (error) {
            console.error('Error fetching events:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });

    /**
     * GET /api/v1/events/:id
     * Get single event by ID
     */
    app.get('/api/v1/events/:id', async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };

        try {
            const event = await prisma.event.findUnique({
                where: { id },
                include: {
                    actor: {
                        select: {
                            id: true,
                            name: true,
                            kind: true
                        }
                    }
                }
            });

            if (!event) {
                return reply.code(404).send({ error: 'Event not found' });
            }

            return reply.send({
                event: {
                    id: event.id,
                    tick: event.tick,
                    type: event.type,
                    actorId: event.actorId,
                    actorName: event.actor?.name ?? null,
                    targetIds: event.targetIds,
                    outcome: event.outcome,
                    sideEffects: event.sideEffects,
                    createdAt: event.createdAt
                }
            });
        } catch (error) {
            console.error('Error fetching event:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
}

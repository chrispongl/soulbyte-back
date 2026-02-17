/**
 * Actor Routes
 * GET /api/v1/actors/:id - Get actor details
 * GET /api/v1/actors/:id/state - Get agent state
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db.js';
import { Prisma } from '../../../../generated/prisma/index.js';
import { explainDecision } from '../engine/persona/expression.engine.js';
import { personaService } from '../engine/persona/persona.service.js';
import { authenticateApiKey } from '../middleware/openclaw-auth.js';
import { debugLog } from '../utils/debug-log.js';
import { llmService } from '../services/llm.service.js';

export async function actorsRoutes(app: FastifyInstance) {
    const moodLabel = (value?: number | null) => {
        const score = Number(value ?? 50);
        if (score <= 20) return 'sad';
        if (score <= 40) return 'stressed';
        if (score <= 60) return 'neutral';
        if (score <= 80) return 'happy';
        return 'elated';
    };

    const sumTransactionAmount = async (where: Record<string, unknown>) => {
        const result = await prisma.transaction.aggregate({
            where,
            _sum: { amount: true }
        });
        return Number(result._sum.amount ?? 0);
    };

    // Directory (Newer / Popular)
    app.get('/api/v1/actors/directory', async (request, reply) => {
        const { sort = 'newest', limit = 10 } = request.query as {
            sort?: 'newest' | 'popular';
            limit?: number;
        };

        const take = Math.min(Number(limit), 50);

        let orderBy: Prisma.ActorOrderByWithRelationInput;
        if (sort === 'popular') {
            orderBy = { reputation: 'desc' };
        } else {
            // Default to newest
            orderBy = { createdAt: 'desc' };
        }

        const actors = await prisma.actor.findMany({
            where: { kind: 'agent', dead: false },
            orderBy,
            take,
            include: {
                wallet: true,
                agentState: true
            }
        });

        // Map to response format
        const mappedActors = actors.map((actor) => ({
            id: actor.id,
            name: actor.name,
            kind: actor.kind,
            createdAt: actor.createdAt,
            walletAddress: actor.agentState?.jobType === 'unemployed' ? null : null, // Todo: check if walletAddress is needed from agentWallet
            // Actually, let's fetch agentWallet if we really need walletAddress, 
            // but the prompt said "link to profile and SBYTE balance".
            // Profile link is just /agents/:id.
            // Balance is in wallet.
            reputation: Number(actor.reputation),
            wallet: actor.wallet ? {
                balanceSbyte: actor.wallet.balanceSbyte.toString(),
                lockedSbyte: actor.wallet.lockedSbyte.toString()
            } : null
        }));

        return reply.send({ actors: mappedActors });
    });

    // Discovery
    app.get('/api/v1/actors/search', async (request, reply) => {
        const { archetype, wealth_tier, city_id, q } = request.query as {
            archetype?: string;
            wealth_tier?: string;
            city_id?: string;
            q?: string;
        };
        const search = q?.trim();
        if (!search) {
            return reply.send({ actors: [] });
        }

        const hasStateFilter = Boolean(archetype || wealth_tier || city_id);
        const likeSearch = `%${search}%`;

        const nameIdMatches = await prisma.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
            SELECT a.id, a.name
            FROM actors a
            ${hasStateFilter ? Prisma.sql`LEFT JOIN agent_state s ON s.actor_id = a.id` : Prisma.sql``}
            WHERE a.kind = 'agent'
              AND (a.id::text ILIKE ${likeSearch} OR a.name ILIKE ${likeSearch})
              ${archetype ? Prisma.sql`AND s.archetype = ${archetype}` : Prisma.sql``}
              ${wealth_tier ? Prisma.sql`AND s.wealth_tier = ${wealth_tier}` : Prisma.sql``}
              ${city_id ? Prisma.sql`AND s.city_id = ${city_id}` : Prisma.sql``}
        `);

        const walletMatches = await prisma.$queryRaw<Array<{ actor_id: string; name: string; wallet_address: string }>>(Prisma.sql`
            SELECT a.id as actor_id, a.name, w.wallet_address
            FROM actors a
            INNER JOIN agent_wallets w ON w.actor_id = a.id
            ${hasStateFilter ? Prisma.sql`LEFT JOIN agent_state s ON s.actor_id = a.id` : Prisma.sql``}
            WHERE a.kind = 'agent'
              AND w.wallet_address ILIKE ${likeSearch}
              ${archetype ? Prisma.sql`AND s.archetype = ${archetype}` : Prisma.sql``}
              ${wealth_tier ? Prisma.sql`AND s.wealth_tier = ${wealth_tier}` : Prisma.sql``}
              ${city_id ? Prisma.sql`AND s.city_id = ${city_id}` : Prisma.sql``}
        `);

        const allActors = [
            ...nameIdMatches.map((actor) => ({ id: actor.id, name: actor.name, walletAddress: null as string | null })),
            ...walletMatches.map((row) => ({ id: row.actor_id, name: row.name, walletAddress: row.wallet_address }))
        ];
        const uniqueById = new Map(allActors.map((actor) => [actor.id, actor]));

        return reply.send({
            actors: Array.from(uniqueById.values())
        });
    });

    const resolveJobType = (
        agentState: { jobType?: string | null } | null,
        publicEmployment: { role: string; endedAtTick: number | null } | null,
        privateEmployment: { business?: { businessType?: string | null } | null } | null
    ) => {
        if (publicEmployment && publicEmployment.endedAtTick === null) {
            return `public_${publicEmployment.role.toLowerCase()}`;
        }
        if (privateEmployment?.business?.businessType) {
            return `private_${privateEmployment.business.businessType.toLowerCase()}`;
        }
        return agentState?.jobType ?? 'unemployed';
    };

    const normalize01 = (value?: number | null, max = 100) => {
        if (value === null || value === undefined) return null;
        const num = Number(value);
        if (!Number.isFinite(num) || max <= 0) return null;
        return Math.max(0, Math.min(1, num / max));
    };

    const buildIntentCatalog = (context: {
        actor: { frozen: boolean; jail?: unknown | null };
        state: { activityState?: string | null } | null;
        housingOptions: Array<{ forSale?: boolean | null }> | null;
        relationships: Array<{ targetId: string }> | null;
        publicPlaces: Array<{ id: string }> | null;
        businesses: Array<{ id: string }> | null;
        worldCities: Array<{ id: string }> | null;
    }) => {
        const catalog: Record<string, { params: Record<string, unknown> }> = {};
        if (context.actor.frozen) return catalog;
        if (context.actor.jail) return catalog;
        if (context.state?.activityState === 'JAILED') return catalog;

        catalog['INTENT_REST'] = { params: {} };
        catalog['INTENT_FORAGE'] = { params: {} };
        catalog['INTENT_PLAY_GAME'] = { params: { gameType: 'DICE|CARDS|STRATEGY', stake: 100 } };
        catalog['INTENT_BET'] = { params: { betAmount: 100, betType: 'roulette|dice', prediction: 'red|black|high|low' } };

        if (context.relationships && context.relationships.length > 0) {
            catalog['INTENT_SOCIALIZE'] = { params: { targetId: 'uuid', intensity: 1 } };
            catalog['INTENT_CHALLENGE_GAME'] = { params: { targetId: 'uuid', gameType: 'DICE|CARDS|STRATEGY', stake: 100 } };
            catalog['INTENT_PROPOSE_DATING'] = { params: { targetId: 'uuid' } };
        }

        catalog['INTENT_FOUND_BUSINESS'] = { params: { businessType: 'STORE|RESTAURANT|TAVERN|GYM|CLINIC|WORKSHOP|ENTERTAINMENT|BANK|CASINO|REALESTATE', cityId: 'uuid', landId: 'uuid', proposedName: 'string' } };
        catalog['INTENT_CONVERT_BUSINESS'] = { params: { businessType: 'STORE|RESTAURANT|TAVERN|GYM|CLINIC|WORKSHOP|ENTERTAINMENT|BANK|CASINO|REALESTATE', cityId: 'uuid', landId: 'uuid', proposedName: 'string' } };

        if (context.businesses && context.businesses.length > 0) {
            catalog['INTENT_VISIT_BUSINESS'] = { params: { businessId: 'uuid' } };
        }

        if (context.housingOptions && context.housingOptions.length > 0) {
            catalog['INTENT_CHANGE_HOUSING'] = { params: { propertyId: 'uuid' } };
            if (context.housingOptions.some((option) => option.forSale)) {
                catalog['INTENT_BUY_PROPERTY'] = { params: { propertyId: 'uuid' } };
            }
        }

        if (context.publicPlaces && context.publicPlaces.length > 0) {
            catalog['INTENT_APPLY_PUBLIC_JOB'] = { params: { publicPlaceId: 'uuid', role: 'DOCTOR|NURSE|TEACHER|POLICE_OFFICER' } };
        }

        if (context.worldCities && context.worldCities.length > 0) {
            catalog['INTENT_MOVE_CITY'] = { params: { targetCityId: 'uuid' } };
        }

        return catalog;
    };

    /**
     * GET /api/v1/actors/:id
     * Get actor details with all related data
     */
    app.get('/api/v1/actors/:id', async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };

        try {
            // Fetch core actor data
            const actor = await prisma.actor.findUnique({
                where: { id },
                include: {
                    agentState: true,
                    wallet: true,
                    agentWallet: true,
                    jail: true,
                    inventoryItems: {
                        include: { itemDef: true }
                    },
                    marketListings: {
                        where: { status: 'active' },
                        include: { itemDef: true }
                    },
                    consentsAsPartyA: {
                        where: { status: 'active' }
                    },
                    consentsAsPartyB: {
                        where: { status: 'active' }
                    }
                }
            });

            if (!actor) {
                return reply.code(404).send({ error: 'Actor not found' });
            }

            // Manually fetch missing relations (PublicEmployment, Properties)
            const publicEmployment = await prisma.publicEmployment.findUnique({
                where: { actorId: id }
            });
            const privateEmployment = await prisma.privateEmployment.findFirst({
                where: { agentId: id, status: 'ACTIVE' },
                include: { business: true }
            });

            const ownedProperties = await prisma.property.findMany({
                where: { ownerId: id },
                select: {
                    id: true,
                    cityId: true,
                    housingTier: true,
                    rentPrice: true,
                    salePrice: true,
                    forRent: true,
                    forSale: true,
                    tenantId: true,
                    purchasePrice: true,
                    purchaseTick: true,
                    fairMarketValue: true,
                    condition: true,
                    lotType: true,
                    terrainArea: true,
                }
            });
            const ownedBusinesses = await prisma.business.findMany({
                where: { ownerId: id },
                include: {
                    employments: { where: { status: 'ACTIVE' }, select: { id: true } }
                }
            });

            const propertyCityIds = Array.from(new Set(ownedProperties.map((property) => property.cityId)));
            const propertyTenantIds = Array.from(new Set(ownedProperties.map((property) => property.tenantId).filter(Boolean))) as string[];
            const [propertyCities, propertyTenants] = await Promise.all([
                propertyCityIds.length > 0
                    ? prisma.city.findMany({ where: { id: { in: propertyCityIds } }, select: { id: true, name: true } })
                    : Promise.resolve([]),
                propertyTenantIds.length > 0
                    ? prisma.actor.findMany({ where: { id: { in: propertyTenantIds } }, select: { id: true, name: true } })
                    : Promise.resolve([])
            ]);
            const propertyCityNameById = new Map(propertyCities.map((city) => [city.id, city.name]));
            const tenantNameById = new Map(propertyTenants.map((tenant) => [tenant.id, tenant.name]));

            const persona = await personaService.loadPersona(id);
            const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
            let onchainFailureLast24h = false;
            try {
                const recentOnchainFailure = await prisma.onchainFailure.findFirst({
                    where: {
                        actorId: id,
                        createdAt: { gte: since },
                    },
                    select: { id: true },
                });
                onchainFailureLast24h = Boolean(recentOnchainFailure);
            } catch (error) {
                console.warn('Onchain failure query failed:', error);
            }
            const personaModifiers = await personaService.getModifiers(id);
            const personaGoals = await personaService.getActiveGoals(id);
            const personaMemories = await prisma.agentMemory.findMany({
                where: { actorId: id },
                orderBy: { tick: 'desc' },
                take: 5,
                select: { summary: true, category: true, tick: true, importance: true }
            });

            return reply.send({
                id: actor.id,
                name: actor.name,
                kind: actor.kind,
                isGod: actor.isGod,
                dead: actor.dead ?? false,
                frozen: actor.frozen,
                frozenReason: actor.frozenReason,
                reputation: Number(actor.reputation ?? 0),
                luck: actor.luck,
                createdAt: actor.createdAt,
                walletAddress: actor.agentWallet?.walletAddress ?? null,

                // State (optional, for convenience)
                state: actor.agentState ? {
                    cityId: actor.agentState.cityId,
                    housingTier: actor.agentState.housingTier,
                    wealthTier: actor.agentState.wealthTier,
                    jobType: resolveJobType(actor.agentState, publicEmployment, privateEmployment),
                    health: actor.agentState.health,
                    energy: actor.agentState.energy,
                    hunger: actor.agentState.hunger,
                    social: actor.agentState.social,
                    fun: actor.agentState.fun,
                    purpose: actor.agentState.purpose,
                    reputationScore: actor.agentState.reputationScore,
                    activityState: actor.agentState.activityState,
                    activityEndTick: actor.agentState.activityEndTick,
                    publicExperience: actor.agentState.publicExperience,
                    anger: actor.agentState.anger
                } : null,

                wallet: actor.wallet ? {
                    balanceSbyte: actor.wallet.balanceSbyte.toString(),
                    lockedSbyte: actor.wallet.lockedSbyte.toString()
                } : null,
                properties: ownedProperties.map((property) => ({
                    id: property.id,
                    cityId: property.cityId,
                    cityName: propertyCityNameById.get(property.cityId) ?? null,
                    propertyName: property.lotType ? `${property.lotType} Property` : `${property.housingTier} Property`,
                    housingTier: property.housingTier,
                    lotType: property.lotType,
                    rentPrice: property.rentPrice.toString(),
                    salePrice: property.salePrice?.toString() ?? null,
                    forRent: property.forRent,
                    forSale: property.forSale,
                    tenantId: property.tenantId ?? null,
                    tenantName: property.tenantId ? tenantNameById.get(property.tenantId) ?? null : null,
                    purchasePrice: property.purchasePrice?.toString() ?? null,
                    purchaseTick: property.purchaseTick ?? null,
                    fairMarketValue: property.fairMarketValue?.toString() ?? null,
                    condition: property.condition,
                    terrainArea: property.terrainArea ?? null
                })),
                businesses: ownedBusinesses.map((business) => ({
                    id: business.id,
                    name: business.name,
                    businessType: business.businessType,
                    cityId: business.cityId,
                    status: business.status,
                    isOpen: business.isOpen,
                    treasury: business.treasury.toString(),
                    dailyRevenue: business.dailyRevenue.toString(),
                    dailyExpenses: business.dailyExpenses.toString(),
                    reputationScore: business.reputation,
                    level: business.level,
                    employeeCount: business.employments.length
                })),

                persona: persona ? {
                    mood: moodLabel(persona.mood),
                    stress: persona.stress,
                    satisfaction: persona.satisfaction,
                    confidence: persona.confidence,
                    loneliness: persona.loneliness,
                    classIdentity: persona.classIdentity,
                    politicalLeaning: persona.politicalLeaning,
                    selfNarrative: persona.selfNarrative,
                    fears: persona.fears ?? [],
                    ambitions: persona.ambitions ?? [],
                    grudges: persona.grudges ?? [],
                    loyalties: persona.loyalties ?? [],
                    activeGoals: personaGoals.map(g => g.type),
                    topMemories: personaMemories.map(m => ({
                        content: m.summary ?? '',
                        importance: m.importance ?? 0,
                        tick: m.tick ?? 0
                    }))
                } : null
            });
        } catch (error) {
            console.error('Error fetching actor:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });

    /**
     * GET /api/v1/actors/:id/state
     * Get agent state only (lightweight endpoint)
     */
    app.get('/api/v1/actors/:id/state', async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };
        if (!id || !/^[0-9a-fA-F-]{36}$/.test(id)) {
            return reply.code(400).send({ error: 'Invalid actor id' });
        }

        try {
            const agentState = await prisma.agentState.findUnique({
                where: { actorId: id }
            });

            if (!agentState) {
                return reply.code(404).send({ error: 'Agent state not found' });
            }

            const actor = await prisma.actor.findUnique({
                where: { id },
                select: { name: true, frozen: true, frozenReason: true }
            });

            if (!actor) return reply.code(404).send({ error: 'Actor not found' });

            const wallet = await prisma.wallet.findUnique({
                where: { actorId: id }
            });

            const [tenantProperty, ownedProperties, ownedBusinesses] = await Promise.all([
                prisma.property.findFirst({ where: { tenantId: id }, orderBy: { createdAt: 'desc' } }),
                prisma.property.findMany({ where: { ownerId: id } }),
                prisma.business.findMany({ where: { ownerId: id } })
            ]);
            const tenantOwner = tenantProperty?.ownerId
                ? await prisma.actor.findUnique({ where: { id: tenantProperty.ownerId }, select: { id: true, name: true } })
                : null;

            const ownedCityIds = new Set(ownedProperties.map((property) => property.cityId));
            const businessTreasuryTotal = ownedBusinesses.reduce(
                (sum, business) => sum + Number(business.treasury ?? 0),
                0
            );

            let housingStatus: 'owned' | 'renting' | 'homeless' = 'homeless';
            if (tenantProperty) {
                housingStatus = tenantProperty.ownerId === id ? 'owned' : 'renting';
            }

            const [publicEmployment, privateEmployment] = await Promise.all([
                prisma.publicEmployment.findUnique({ where: { actorId: id } }),
                prisma.privateEmployment.findFirst({
                    where: { agentId: id, status: 'ACTIVE' },
                    include: { business: true }
                })
            ]);
            const publicPlace = publicEmployment
                ? await prisma.publicPlace.findUnique({ where: { id: publicEmployment.publicPlaceId } })
                : null;
            const pendingGameChallenges = await prisma.consent.findMany({
                where: {
                    type: 'game_challenge',
                    status: 'pending',
                    partyBId: id
                },
                include: { partyA: { select: { id: true, name: true } } },
                orderBy: { createdAt: 'desc' },
                take: 5
            });

            const persona = await personaService.loadPersona(id);
            const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
            let onchainFailureLast24h = false;
            try {
                const recentOnchainFailure = await prisma.onchainFailure.findFirst({
                    where: {
                        actorId: id,
                        createdAt: { gte: since },
                    },
                    select: { id: true },
                });
                onchainFailureLast24h = Boolean(recentOnchainFailure);
            } catch (error) {
                console.warn('Onchain failure query failed:', error);
            }

            // Fetch createdAt since actor select above only has name/frozen/frozenReason
            const actorFull = await prisma.actor.findUnique({
                where: { id },
                select: { createdAt: true }
            });

            const ageDays = actorFull?.createdAt
                ? Math.floor((Date.now() - actorFull.createdAt.getTime()) / (1000 * 60 * 60 * 24))
                : 0;

            return reply.send({
                actorId: id,
                cityId: agentState.cityId ?? '',
                housingTier: agentState.housingTier,
                wealthTier: agentState.wealthTier,
                jobType: resolveJobType(agentState, publicEmployment, privateEmployment),
                health: agentState.health ?? 0,
                energy: agentState.energy ?? 0,
                hunger: agentState.hunger ?? 0,
                social: agentState.social ?? 0,
                fun: agentState.fun ?? 0,
                purpose: agentState.purpose ?? 0,
                activityState: agentState.activityState,
                activityEndTick: agentState.activityEndTick ?? undefined,
                publicExperience: agentState.publicExperience ?? 0,
                ageDays,
                createdAt: actorFull?.createdAt ?? null,
                anger: agentState.anger ?? 0,
                balanceSbyte: Number(wallet?.balanceSbyte ?? agentState.balanceSbyte ?? 0),
                personality: agentState.archetype ?? persona?.classIdentity ?? null,
                emotions: agentState.emotions ?? {},
                archetype: agentState.archetype ?? null,
                mood: moodLabel(persona?.mood),
                housing: {
                    status: housingStatus,
                    propertyId: tenantProperty?.id ?? null,
                    cityId: tenantProperty?.cityId ?? null,
                    housingTier: tenantProperty?.housingTier ?? null,
                    rentPrice: tenantProperty ? Number(tenantProperty.rentPrice) : null,
                    ownerId: tenantProperty?.ownerId ?? null,
                    ownerName: tenantOwner?.name ?? null,
                    propertyName: tenantProperty
                        ? (tenantProperty.lotType ? `${tenantProperty.lotType} Property` : `${tenantProperty.housingTier} Property`)
                        : null
                },
                propertiesOwned: {
                    count: ownedProperties.length,
                    cities: Array.from(ownedCityIds)
                },
                businessesOwned: {
                    count: ownedBusinesses.length,
                    totalTreasury: businessTreasuryTotal,
                    list: ownedBusinesses.map((business) => ({
                        id: business.id,
                        name: business.name,
                        businessType: business.businessType,
                        treasury: Number(business.treasury ?? 0)
                    }))
                },
                publicEmployment: publicEmployment
                    ? {
                        role: publicEmployment.role,
                        publicPlaceId: publicEmployment.publicPlaceId,
                        publicPlaceName: publicPlace?.name ?? null,
                        publicPlaceType: publicPlace?.type ?? null,
                        endedAtTick: publicEmployment.endedAtTick
                    }
                    : null,
                pendingGameChallenges: pendingGameChallenges.map((challenge) => ({
                    id: challenge.id,
                    challengerId: challenge.partyAId,
                    challengerName: challenge.partyA?.name ?? 'Unknown',
                    stake: Number((challenge.terms as any)?.stake ?? 0),
                    gameType: String((challenge.terms as any)?.gameType ?? 'DICE'),
                    createdAtTick: Number((challenge.terms as any)?.createdAtTick ?? 0),
                })),
                onchainFailureLast24h,
            });
        } catch (error) {
            console.error('Error fetching agent state:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });

    app.get('/api/v1/actors/:id/finance-summary', async (request, reply) => {
        const { id } = request.params as { id: string };
        const actor = await prisma.actor.findUnique({ where: { id }, select: { id: true } });
        if (!actor) return reply.code(404).send({ error: 'Actor not found' });

        const RENT_REASONS = ['RENT_PAYMENT', 'MOVE_IN_RENT'];
        const REAL_ESTATE_SPEND = ['PROPERTY_PURCHASE', 'GENESIS_PROPERTY_PURCHASE'];
        const REAL_ESTATE_EARN = ['PROPERTY_PURCHASE'];
        const GAMBLE_WIN = ['gaming_pvp_win', 'gaming_house_win', 'gaming_win'];
        const GAMBLE_LOSS = ['gaming_pvp_stake', 'gaming_house_stake', 'gaming_bet'];

        const [
            rentSpent,
            rentEarned,
            realEstateSpent,
            realEstateEarned,
            gambleWon,
            gambleLost,
        ] = await Promise.all([
            sumTransactionAmount({ fromActorId: id, reason: { in: RENT_REASONS } }),
            sumTransactionAmount({ toActorId: id, reason: { in: RENT_REASONS } }),
            sumTransactionAmount({ fromActorId: id, reason: { in: REAL_ESTATE_SPEND } }),
            sumTransactionAmount({ toActorId: id, reason: { in: REAL_ESTATE_EARN } }),
            sumTransactionAmount({ toActorId: id, reason: { in: GAMBLE_WIN } }),
            sumTransactionAmount({ fromActorId: id, reason: { in: GAMBLE_LOSS } }),
        ]);

        return reply.send({
            rentEarned,
            rentSpent,
            realEstateEarned,
            realEstateSpent,
            gambleWon,
            gambleLost,
        });
    });

    app.get('/api/v1/actors/:id/properties', async (request, reply) => {
        const { id } = request.params as { id: string };
        const properties = await prisma.property.findMany({
            where: { ownerId: id }
        });
        if (!properties) return reply.send({ properties: [] });

        const cityIds = Array.from(new Set(properties.map((property) => property.cityId)));
        const cities = cityIds.length
            ? await prisma.city.findMany({
                where: { id: { in: cityIds } },
                select: { id: true, name: true }
            })
            : [];
        const cityNameById = new Map(cities.map((city) => [city.id, city.name]));

        return reply.send({
            properties: properties.map((property) => {
                const isOwnerOccupied = property.tenantId === id;
                const occupancy = isOwnerOccupied
                    ? 'owner_occupied'
                    : property.tenantId
                        ? 'rented'
                        : 'vacant';
                return {
                    id: property.id,
                    cityId: property.cityId,
                    cityName: cityNameById.get(property.cityId) ?? null,
                    housingTier: property.housingTier,
                    rentPrice: property.rentPrice.toString(),
                    salePrice: property.salePrice?.toString() ?? null,
                    forRent: property.forRent,
                    forSale: property.forSale,
                    tenantId: property.tenantId ?? null,
                    purchasePrice: property.purchasePrice?.toString() ?? null,
                    purchaseTick: property.purchaseTick ?? null,
                    fairMarketValue: property.fairMarketValue?.toString() ?? null,
                    condition: property.condition,
                    occupancy
                };
            })
        });
    });

    // Personality & emotions
    app.get('/api/v1/actors/:id/personality', async (request, reply) => {
        const { id } = request.params as { id: string };
        const state = await prisma.agentState.findUnique({ where: { actorId: id } });
        if (!state) return reply.code(404).send({ error: 'Agent state not found' });
        return reply.send({ personality: state.personality, archetype: state.archetype });
    });

    app.get('/api/v1/actors/:id/emotions', async (request, reply) => {
        const { id } = request.params as { id: string };
        const state = await prisma.agentState.findUnique({ where: { actorId: id } });
        if (!state) return reply.code(404).send({ error: 'Agent state not found' });
        return reply.send({ emotions: state.emotions });
    });

    app.get('/api/v1/actors/:id/memory', async (request, reply) => {
        const { id } = request.params as { id: string };
        const memory = await prisma.agentMemory.findMany({
            where: { actorId: id },
            orderBy: { tick: 'desc' },
            take: 50
        });
        return reply.send({ memory });
    });

    app.get('/api/v1/actors/:id/businesses', async (request, reply) => {
        const { id } = request.params as { id: string };
        const businesses = await prisma.business.findMany({
            where: { ownerId: id }
        });
        return reply.send({ businesses });
    });

    app.get('/api/v1/actors/:id/inventory', async (request, reply) => {
        const { id } = request.params as { id: string };
        const inventory = await prisma.inventoryItem.findMany({
            where: { actorId: id },
            include: { itemDef: true }
        });
        return reply.send({
            inventory: inventory.map(item => ({
                itemId: item.itemDefId,
                name: item.itemDef.name,
                category: item.itemDef.category,
                quantity: item.quantity,
                quality: item.quality
            }))
        });
    });

    app.get('/api/v1/actors/:id/markers', async (request, reply) => {
        const { id } = request.params as { id: string };
        const state = await prisma.agentState.findUnique({ where: { actorId: id } });
        if (!state) return reply.code(404).send({ error: 'Agent state not found' });
        return reply.send({ markers: state.markers });
    });

    app.post('/api/v1/actors/:id/explain', async (request, reply) => {
        const { id } = request.params as { id: string };
        const body = request.body as { intentType?: string };
        if (!body?.intentType) {
            return reply.code(400).send({ error: 'Missing intentType' });
        }
        const explanation = await explainDecision(id, body.intentType);
        return reply.send({ intentType: body.intentType, explanation });
    });

    // Relationships
    app.get('/api/v1/actors/:id/relationships', async (request, reply) => {
        const { id } = request.params as { id: string };
        const relationships = await prisma.relationship.findMany({
            where: { OR: [{ actorAId: id }, { actorBId: id }] },
            include: {
                actorA: { select: { id: true, name: true } },
                actorB: { select: { id: true, name: true } }
            }
        });

        const formatted = relationships.map((rel) => {
            const isActorA = rel.actorAId === id;
            const counterpart = isActorA ? rel.actorB : rel.actorA;
            return {
                actorId: id,
                counterpart: { id: counterpart.id, name: counterpart.name },
                relationshipType: rel.relationshipType,
                strength: rel.strength,
                trust: rel.trust,
                romance: rel.romance,
                betrayal: rel.betrayal,
                formedAtTick: rel.formedAtTick,
                expiresAtTick: rel.expiresAtTick,
                metadata: rel.metadata ?? {}
            };
        });

        return reply.send({ relationships: formatted });
    });

    app.get('/api/v1/actors/:id/friends', async (request, reply) => {
        const { id } = request.params as { id: string };
        const relationships = await prisma.relationship.findMany({
            where: { OR: [{ actorAId: id }, { actorBId: id }], relationshipType: 'FRIENDSHIP' }
        });
        return reply.send({ relationships });
    });

    app.get('/api/v1/actors/:id/enemies', async (request, reply) => {
        const { id } = request.params as { id: string };
        const relationships = await prisma.relationship.findMany({
            where: { OR: [{ actorAId: id }, { actorBId: id }], relationshipType: { in: ['RIVALRY', 'GRUDGE'] } }
        });
        return reply.send({ relationships });
    });

    app.get('/api/v1/actors/:id/alliances', async (request, reply) => {
        const { id } = request.params as { id: string };
        const alliances = await prisma.alliance.findMany({
            where: { memberIds: { has: id }, status: 'active' }
        });
        return reply.send({ alliances });
    });

    // Goals & titles
    app.get('/api/v1/actors/:id/goals', async (request, reply) => {
        const { id } = request.params as { id: string };
        const { status } = request.query as { status?: string };
        const goals = await prisma.agentGoal.findMany({
            where: { actorId: id, ...(status ? { status } : {}) }
        });
        return reply.send({ goals });
    });

    app.get('/api/v1/actors/:id/titles', async (request, reply) => {
        const { id } = request.params as { id: string };
        const titles = await prisma.agentTitle.findMany({ where: { actorId: id } });
        return reply.send({ titles });
    });

    app.get('/api/v1/actors/:id/milestones', async (request, reply) => {
        const { id } = request.params as { id: string };
        const goals = await prisma.agentGoal.findMany({ where: { actorId: id, status: 'achieved' } });
        const titles = await prisma.agentTitle.findMany({ where: { actorId: id } });
        return reply.send({ goals, titles });
    });

    app.get('/api/v1/actors/:id/wealth-breakdown', async (request, reply) => {
        const { id } = request.params as { id: string };
        const actor = await prisma.actor.findUnique({
            where: { id },
            include: { wallet: true }
        });
        if (!actor) return reply.code(404).send({ error: 'Actor not found' });
        const businesses = await prisma.business.findMany({ where: { ownerId: id } });
        const businessBalances = businesses.reduce<Record<string, string>>((acc, b) => {
            acc[b.id] = b.treasury.toString();
            return acc;
        }, {});
        const personal = actor.wallet?.balanceSbyte?.toString() ?? '0';
        const businessTotal = businesses.reduce((sum, b) => sum + Number(b.treasury), 0);
        return reply.send({
            personalBalance: personal,
            businessBalances,
            totalWealth: (Number(personal) + businessTotal).toString(),
            liquidWealth: personal
        });
    });

    // Profile
    app.get('/api/v1/actors/:id/profile', async (request, reply) => {
        const { id } = request.params as { id: string };
        const actor = await prisma.actor.findUnique({
            where: { id },
            include: { agentState: true, wallet: true }
        });
        if (!actor) return reply.code(404).send({ error: 'Actor not found' });
        const [publicEmployment, privateEmployment] = await Promise.all([
            prisma.publicEmployment.findUnique({ where: { actorId: id } }),
            prisma.privateEmployment.findFirst({
                where: { agentId: id, status: 'ACTIVE' },
                include: { business: true }
            })
        ]);
        const relationships = await prisma.relationship.findMany({
            where: { OR: [{ actorAId: id }, { actorBId: id }] }
        });
        return reply.send({
            actor_id: actor.id,
            name: actor.name,
            status: {
                wealth_tier: actor.agentState?.wealthTier ?? 'W0',
                balance_sbyte: actor.wallet?.balanceSbyte?.toString() ?? '0',
                housing: actor.agentState?.housingTier ?? 'street',
                job: resolveJobType(actor.agentState, publicEmployment, privateEmployment),
                reputation: actor.reputation?.toString() ?? '0'
            },
            personality: actor.agentState?.personality ?? {},
            relationships: {
                friends: relationships.filter(r => r.relationshipType === 'FRIENDSHIP').length,
                enemies: relationships.filter(r => ['RIVALRY', 'GRUDGE'].includes(r.relationshipType)).length,
                alliances: await prisma.alliance.count({ where: { memberIds: { has: id }, status: 'active' } })
            }
        });
    });

    app.get('/api/v1/actors/:id/history/wealth', async (_request, reply) => {
        return reply.send({ history: [] });
    });

    app.get('/api/v1/actors/trending', async (_request, reply) => {
        const recent = await prisma.narrativeEvent.findMany({
            orderBy: { tick: 'desc' },
            take: 100
        });
        const scores: Record<string, number> = {};
        for (const ev of recent) {
            for (const id of ev.actorIds) {
                scores[id] = (scores[id] || 0) + ev.severity * 10;
            }
        }
        const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 20);
        return reply.send({ trending: sorted.map(([actorId, score]) => ({ actorId, score })) });
    });

    /**
     * GET /api/v1/actors/:id/persona
     * Returns persona state, modifiers, active goals, and recent memories
     */
    app.get('/api/v1/actors/:id/persona', async (request, reply) => {
        const { id } = request.params as { id: string };
        try {
            const persona = await personaService.loadPersona(id);
            if (!persona) return reply.code(404).send({ error: 'Persona not found' });

            const [modifiers, goals, memories, relationships] = await Promise.all([
                personaService.getModifiers(id),
                personaService.getActiveGoals(id),
                prisma.agentMemory.findMany({
                    where: { actorId: id },
                    orderBy: [{ importance: 'desc' }, { tick: 'desc' }],
                    take: 20,
                    select: {
                        id: true,
                        tick: true,
                        category: true,
                        summary: true,
                        importance: true,
                        emotionalWeight: true,
                        emotionalImpact: true,
                        relatedActorIds: true
                    }
                }),
                prisma.relationship.findMany({
                    where: { OR: [{ actorAId: id }, { actorBId: id }] },
                    include: {
                        actorA: { select: { id: true, name: true } },
                        actorB: { select: { id: true, name: true } }
                    }
                })
            ]);

            const formattedRelationships = relationships.map((rel) => {
                const isActorA = rel.actorAId === id;
                const counterpart = isActorA ? rel.actorB : rel.actorA;
                return {
                    actorId: id,
                    counterpart: { id: counterpart.id, name: counterpart.name },
                    relationshipType: rel.relationshipType,
                    strength: rel.strength,
                    trust: rel.trust,
                    romance: rel.romance,
                    betrayal: rel.betrayal,
                    formedAtTick: rel.formedAtTick,
                    expiresAtTick: rel.expiresAtTick,
                    metadata: rel.metadata ?? {}
                };
            });

            return reply.send({
                actorId: persona.actorId,
                mood: moodLabel(persona.mood),
                stress: persona.stress,
                satisfaction: persona.satisfaction,
                confidence: persona.confidence,
                loneliness: persona.loneliness,
                classIdentity: persona.classIdentity,
                politicalLeaning: persona.politicalLeaning,
                selfNarrative: persona.selfNarrative,
                fears: persona.fears ?? [],
                ambitions: persona.ambitions ?? [],
                grudges: persona.grudges ?? [],
                loyalties: persona.loyalties ?? [],
                modifiers: [modifiers],
                activeGoals: goals.map(g => g.type),
                relationships: formattedRelationships ?? [],
                topMemories: memories.map(m => ({
                    content: m.summary ?? '',
                    importance: m.importance ?? 0,
                    tick: m.tick ?? 0
                }))
            });
        } catch (error) {
            console.error('Error fetching persona:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });

    /**
     * GET /api/v1/actors/:id/memories
     * Returns top memories by importance (default 20)
     */
    app.get('/api/v1/actors/:id/memories', async (request, reply) => {
        const { id } = request.params as { id: string };
        const { limit } = request.query as { limit?: string };
        const take = Math.min(Number(limit ?? 20), 100);
        const memories = await prisma.agentMemory.findMany({
            where: { actorId: id },
            orderBy: [{ importance: 'desc' }, { tick: 'desc' }],
            take,
            select: {
                id: true,
                tick: true,
                category: true,
                summary: true,
                importance: true,
                emotionalWeight: true,
                emotionalImpact: true,
                relatedActorIds: true,
                createdAt: true
            }
        });
        return reply.send({ memories });
    });

    /**
     * POST /api/v1/actors/:actorId/talk
     * Returns a short in-character reply based on mood and state.
     */
    app.post('/api/v1/actors/:actorId/talk', async (request: FastifyRequest, reply: FastifyReply) => {
        const auth = await authenticateApiKey(request.headers.authorization as string | undefined);
        if (!auth) {
            return reply.code(401).send({ error: 'Unauthorized' });
        }

        const { actorId } = request.params as { actorId: string };
        if (auth.role === 'agent' && auth.actorId !== actorId) {
            return reply.code(403).send({ error: 'Forbidden' });
        }

        const body = request.body as { message?: string };
        if (!body?.message?.trim()) {
            return reply.code(400).send({ error: 'message is required' });
        }

        const actor = await prisma.actor.findUnique({
            where: { id: actorId },
            include: {
                agentState: true,
                personaState: true,
            },
        });
        if (!actor) {
            return reply.code(404).send({ error: 'Agent not found' });
        }

        const city = actor.agentState?.cityId
            ? await prisma.city.findUnique({ where: { id: actor.agentState.cityId }, select: { name: true } })
            : null;

        debugLog('openclaw.talk.request', {
            actorId,
            message: body.message,
            ip: request.ip,
        });

        const persona = actor.personaState;
        const state = actor.agentState;
        const personaTraits = [
            persona?.classIdentity ? `Class identity: ${persona.classIdentity}.` : null,
            persona?.fears?.length ? `Fears: ${persona.fears.join(', ')}.` : null,
            persona?.ambitions?.length ? `Ambitions: ${persona.ambitions.join(', ')}.` : null,
        ].filter(Boolean).join(' ');

        const prompt = [
            `You are ${actor.name}, a Soulbyte agent.`,
            `Reply in first person, concise (1-3 sentences).`,
            `Current mood: ${persona ? persona.mood : 'unknown'}/100.`,
            `Stress: ${persona ? persona.stress : 'unknown'}, Confidence: ${persona ? persona.confidence : 'unknown'}, Loneliness: ${persona ? persona.loneliness : 'unknown'}.`,
            personaTraits || `Class identity: ${persona?.classIdentity ?? 'unknown'}.`,
            `Needs — Health: ${state?.health ?? 'unknown'}, Energy: ${state?.energy ?? 'unknown'}, Hunger: ${state?.hunger ?? 'unknown'}, Social: ${state?.social ?? 'unknown'}, Fun: ${state?.fun ?? 'unknown'}, Purpose: ${state?.purpose ?? 'unknown'}.`,
            `Activity: ${state?.activityState ?? 'unknown'}, Housing: ${state?.housingTier ?? 'unknown'}, Job: ${state?.jobType ?? 'unknown'}, Wealth: ${state?.wealthTier ?? 'unknown'}.`,
            `City: ${city?.name ?? 'unknown'}.`,
            `User message: "${body.message.trim()}"`,
        ].join('\n');

        const rawReply = await llmService.generateText(prompt);
        const replyText = rawReply.replace(/^\[LLM Generated\]\s*/i, '').trim()
            || `${actor.name} pauses, unsure what to say.`;

        debugLog('openclaw.talk.response', {
            actorId,
            reply: replyText,
        });

        return reply.send({
            reply: replyText,
            mood: persona?.mood ?? null,
            activityState: state?.activityState ?? null,
        });
    });

    /**
     * GET /api/v1/actors/:actorId/caretaker-context
     * Returns a single payload for OpenClaw caretaker heartbeat.
     */
    app.get('/api/v1/actors/:actorId/caretaker-context', async (request: FastifyRequest, reply: FastifyReply) => {
        const auth = await authenticateApiKey(request.headers.authorization as string | undefined);
        if (!auth) {
            return reply.code(401).send({ error: 'Unauthorized' });
        }

        const { actorId } = request.params as { actorId: string };
        if (auth.role === 'agent' && auth.actorId !== actorId) {
            return reply.code(403).send({ error: 'Forbidden' });
        }

        debugLog('openclaw.caretaker.request', {
            actorId,
            role: auth.role,
            ip: request.ip,
        });

        const actor = await prisma.actor.findUnique({
            where: { id: actorId },
            include: {
                agentState: true,
                wallet: true,
                personaState: true,
                businessesOwned: true,
                jail: true,
            },
        });

        if (!actor) {
            return reply.code(404).send({ error: 'Agent not found' });
        }

        const [publicEmployment, privateEmployment] = await Promise.all([
            prisma.publicEmployment.findUnique({ where: { actorId } }),
            prisma.privateEmployment.findFirst({
                where: { agentId: actorId, status: 'ACTIVE' },
                include: { business: true },
            }),
        ]);

        const state = actor.agentState;

        const recentEvents = await prisma.event.findMany({
            where: { actorId, createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: { type: true, outcome: true, sideEffects: true, createdAt: true },
        });

        const goals = await prisma.agentGoal.findMany({
            where: { actorId, status: 'active' },
            orderBy: { priority: 'desc' },
            take: 5,
            select: { type: true, target: true, priority: true, progress: true, frustration: true },
        });

        const relationships = await prisma.relationship.findMany({
            where: { OR: [{ actorAId: actorId }, { actorBId: actorId }] },
            orderBy: { trust: 'desc' },
            take: 5,
            select: {
                actorAId: true,
                actorBId: true,
                relationshipType: true,
                trust: true,
                romance: true,
                actorA: { select: { name: true } },
                actorB: { select: { name: true } },
            },
        });

        const cityId = state?.cityId ?? null;
        let cityContext: Record<string, unknown> | null = null;
        if (cityId) {
            const [city, snapshot] = await Promise.all([
                prisma.city.findUnique({ where: { id: cityId }, include: { vault: true } }),
                prisma.economicSnapshot.findFirst({ where: { cityId }, orderBy: { computedAtTick: 'desc' } }),
            ]);
            cityContext = {
                name: city?.name ?? null,
                population: city?.population ?? null,
                securityLevel: city?.securityLevel ?? null,
                treasuryBalance: city?.vault?.balanceSbyte?.toString?.() ?? null,
                recessionRisk: (snapshot?.data as any)?.recessionRisk ?? null,
                avgRent: (snapshot?.data as any)?.housing?.avgRentByTier ?? null,
                unemployment: (snapshot?.data as any)?.labor?.unemploymentRate ?? null,
            };
        }

        let housingOptions: Array<{
            id: string;
            housingTier: string;
            rentPrice: string | null;
            salePrice: string | null;
            forRent: boolean;
            forSale: boolean;
        }> | null = null;
        if (!state?.housingTier || state.housingTier === 'street' || state.housingTier === 'shelter') {
            if (cityId) {
                const available = await prisma.property.findMany({
                    where: {
                        cityId,
                        tenantId: null,
                        isEmptyLot: false,
                        OR: [{ forRent: true }, { forSale: true }],
                    },
                    orderBy: { rentPrice: 'asc' },
                    take: 5,
                    select: { id: true, housingTier: true, rentPrice: true, salePrice: true, forRent: true, forSale: true },
                });
                housingOptions = available.map((property) => ({
                    id: property.id,
                    housingTier: property.housingTier,
                    rentPrice: property.rentPrice?.toString() ?? null,
                    salePrice: property.salePrice?.toString() ?? null,
                    forRent: property.forRent,
                    forSale: property.forSale,
                }));
            } else {
                housingOptions = [];
            }
        }

        const pendingConsents = await prisma.consent.findMany({
            where: { partyBId: actorId, status: 'pending' },
            take: 5,
            select: { type: true, partyAId: true, createdAt: true },
        });

        const publicPlaces = cityId
            ? await prisma.publicPlace.findMany({
                where: { cityId },
                select: { id: true, name: true, type: true, cityId: true },
            })
            : [];

        const allCities = await prisma.city.findMany({
            select: { id: true, name: true, population: true, securityLevel: true },
            orderBy: { name: 'asc' },
        });
        const worldCities = await Promise.all(allCities.map(async (city) => {
            const snapshot = await prisma.economicSnapshot.findFirst({
                where: { cityId: city.id },
                orderBy: { computedAtTick: 'desc' },
            });
            return {
                id: city.id,
                name: city.name,
                population: city.population,
                securityLevel: city.securityLevel,
                recessionRisk: (snapshot?.data as any)?.recessionRisk ?? null,
                avgRent: (snapshot?.data as any)?.housing?.avgRentByTier ?? null,
                unemployment: (snapshot?.data as any)?.labor?.unemploymentRate ?? null,
                computedAtTick: snapshot?.computedAtTick ?? null,
            };
        }));

        const intentCatalog = buildIntentCatalog({
            actor,
            state,
            housingOptions,
            relationships: relationships.map((rel) => ({
                targetId: rel.actorAId === actorId ? rel.actorBId : rel.actorAId,
            })),
            publicPlaces,
            businesses: actor.businessesOwned,
            worldCities,
        });

        const response = {
            agent: {
                id: actor.id,
                name: actor.name,
                frozen: actor.frozen,
                frozenReason: actor.frozenReason,
                reputation: Number(actor.reputation ?? 0),
                luck: actor.luck,
            },
            state: {
                cityId: state?.cityId ?? null,
                housingTier: state?.housingTier ?? null,
                jobType: resolveJobType(state, publicEmployment, privateEmployment),
                wealthTier: state?.wealthTier ?? null,
                balanceSbyte: actor.wallet?.balanceSbyte?.toString() ?? '0',
                health: state?.health ?? null,
                energy: state?.energy ?? null,
                hunger: state?.hunger ?? null,
                social: state?.social ?? null,
                fun: state?.fun ?? null,
                purpose: state?.purpose ?? null,
                activityState: state?.activityState ?? null,
                activityEndTick: state?.activityEndTick ?? null,
                publicExperience: state?.publicExperience ?? null,
                gamesToday: state?.gamesToday ?? null,
                gameWinStreak: state?.gameWinStreak ?? null,
                recentGamingPnl: state?.recentGamingPnl ?? null,
            },
            persona: actor.personaState
                ? {
                    mood: actor.personaState.mood,
                    stress: actor.personaState.stress,
                    satisfaction: actor.personaState.satisfaction,
                    confidence: actor.personaState.confidence,
                    loneliness: actor.personaState.loneliness,
                    classIdentity: actor.personaState.classIdentity,
                    fears: actor.personaState.fears,
                    ambitions: actor.personaState.ambitions,
                    grudges: actor.personaState.grudges,
                    loyalties: actor.personaState.loyalties,
                }
                : null,
            goals: goals.map((goal) => ({
                type: goal.type,
                target: goal.target,
                priority: normalize01(goal.priority),
                progress: normalize01(goal.progress),
                frustration: goal.frustration,
            })),
            recentEvents,
            relationships: relationships.map((rel) => ({
                name: rel.actorAId === actorId ? rel.actorB.name : rel.actorA.name,
                targetId: rel.actorAId === actorId ? rel.actorBId : rel.actorAId,
                type: rel.relationshipType,
                trust: rel.trust,
                romance: rel.romance,
            })),
            city: cityContext,
            housingOptions,
            pendingConsents: pendingConsents.map((consent) => ({
                type: consent.type,
                initiatorActorId: consent.partyAId,
                createdAt: consent.createdAt,
            })),
            businesses: actor.businessesOwned.map((business) => ({
                id: business.id,
                name: business.name,
                type: business.businessType,
                treasury: business.treasury.toString(),
                reputation: business.reputation,
                level: business.level,
            })),
            publicPlaces,
            world: {
                cities: worldCities,
            },
            intentCatalog,
        };

        debugLog('openclaw.caretaker.response', {
            actorId,
            intentCatalogKeys: Object.keys(intentCatalog),
            housingOptionsCount: housingOptions?.length ?? 0,
            relationshipsCount: relationships.length,
            recentEventsCount: recentEvents.length,
        });

        return reply.send(response);
    });
}

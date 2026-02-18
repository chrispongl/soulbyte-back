import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { prisma } from '../db.js';
import { AgentBrain } from '../engine/agent-brain/brain.engine.js';
import { processTick } from '../engine/world.engine.js';
import { checkFreeze } from '../engine/freeze.engine.js';
import { generateConstructionQuotes, cleanupExpiredConstructionQuotes, processConstructionProjects } from '../engine/construction.engine.js';
import { IntentType } from '../types/intent.types.js';
import { BusinessWalletService } from '../services/business-wallet.service.js';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

if (!process.env.MONAD_RPC_URL && process.env.SOULBYTE_TEST_RPC) {
    process.env.MONAD_RPC_URL = process.env.SOULBYTE_TEST_RPC;
}

const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const REPORT_FILE = path.join(process.cwd(), '../../docs/reviews/10-02-26', `${RUN_TIMESTAMP}_brain-world-e2e-sim.md`);

function appendReport(content: string) {
    const dir = path.dirname(REPORT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(REPORT_FILE, content);
}

function log(message: string, header = false) {
    console.log(message);
    const formatted = header ? `\n## ${message}\n` : `- ${message}\n`;
    appendReport(formatted);
}

function logSection(title: string) {
    console.log(`\n=== ${title} ===`);
    appendReport(`\n### ${title}\n`);
}

async function ensureLot(ownerId: string, cityId: string, excludeIds: string[] = []) {
    const existing = await prisma.property.findFirst({
        where: { ownerId, cityId, isEmptyLot: true, underConstruction: false, id: { notIn: excludeIds } }
    });
    if (existing) return existing;
    return prisma.property.create({
        data: {
            cityId,
            ownerId,
            housingTier: 'house',
            rentPrice: 0,
            forRent: false,
            forSale: false,
            isEmptyLot: true,
            lotType: 'SUBURBAN_LOT'
        }
    });
}

async function getFundedAgent(minSbyte: number, minMon: number, requireNoBusiness = false) {
    return prisma.agentWallet.findFirst({
        where: {
            balanceSbyte: { gte: minSbyte },
            balanceMon: { gte: minMon },
            actor: {
                kind: 'agent',
                isGod: false,
                businessesOwned: requireNoBusiness ? { none: {} } : undefined
            }
        },
        include: { actor: { include: { agentState: true, wallet: true } } },
        orderBy: { balanceSbyte: 'desc' }
    });
}

async function ensureConstructionBusiness(ownerId: string, cityId: string, landId: string, tick: number) {
    const existing = await prisma.business.findFirst({
        where: { cityId, businessType: 'CONSTRUCTION', status: 'ACTIVE' }
    });
    if (existing) return existing;

    const business = await prisma.business.create({
        data: {
            name: `Constructor-${Date.now()}`,
            businessType: 'CONSTRUCTION',
            businessSubtype: 'GENERAL',
            ownerId,
            cityId,
            landId,
            reputation: 650,
            level: 1,
            maxEmployees: 3,
            treasury: 0,
            qualityScore: 50,
            isOpen: true,
            customerVisitsToday: 0,
            dailyRevenue: 0,
            dailyExpenses: 0,
            cumulativeRevenue: 0,
            status: 'ACTIVE',
            insolvencyDays: 0,
            frozen: false,
            bankruptcyCount: 0,
            foundedTick: tick,
            ownerLastWorkedTick: tick
        }
    });

    const walletService = new BusinessWalletService();
    await walletService.createBusinessWallet(business.id);
    await prisma.property.update({ where: { id: landId }, data: { isEmptyLot: false } });
    return business;
}

async function main() {
    logSection('Brain + World E2E Simulation (tick loop)');

    const worldState = await prisma.worldState.findFirst({ where: { id: 1 } });
    let tick = worldState?.tick ?? 0;
    const ticksToRun = Number(process.env.BRAIN_E2E_TICKS ?? '140');

    const city = await prisma.city.findFirst();
    if (!city) throw new Error('No cities found. Run genesis first.');

    const ownerWallet = await getFundedAgent(8000, 5, true) ?? await getFundedAgent(8000, 5, false);
    if (!ownerWallet) throw new Error('No funded agent wallet found for brain E2E sim.');
    const owner = ownerWallet.actor;

    const constructorWallet = await getFundedAgent(0, 0);
    const constructorOwner = constructorWallet?.actor?.id === owner.id
        ? null
        : constructorWallet?.actor;

    await prisma.agentState.update({
        where: { actorId: owner.id },
        data: {
            cityId: city.id,
            activityState: 'IDLE',
            activityEndTick: null,
            wealthTier: 'W5',
            reputationScore: 250
        }
    });
    await prisma.actor.update({
        where: { id: owner.id },
        data: { reputation: 250 }
    });

    const businessLot = await ensureLot(owner.id, city.id);
    const cityConstructionLot = await ensureLot(owner.id, city.id, [businessLot.id]);
    const constructorConstructionLot = await ensureLot(owner.id, city.id, [businessLot.id, cityConstructionLot.id]);
    const constructorLot = constructorOwner
        ? await ensureLot(constructorOwner.id, city.id)
        : await ensureLot(owner.id, city.id);
    const constructorBusiness = await ensureConstructionBusiness(
        constructorOwner?.id ?? owner.id,
        city.id,
        constructorLot.id,
        tick
    );

    const initialBusinessIds = new Set(
        (await prisma.business.findMany({
            where: { ownerId: owner.id },
            select: { id: true }
        })).map(b => b.id)
    );
    if (initialBusinessIds.size > 0) {
        log(`Owner already had ${initialBusinessIds.size} business(es); brain may skip founding.`);
    }

    log(`Owner agent: ${owner.name} (${owner.id})`);
    log(`Constructor business: ${constructorBusiness.id}`);
    log(`Starting tick: ${tick}, ticks: ${ticksToRun}`);

    let cityRequestInjected = false;
    let constructorRequestInjected = false;
    log('Prepared construction requests (city then constructor).');

    const brain = new AgentBrain();
    let businessFound = false;
    let businessWalletCreated = false;
    let cityConstructionStarted = false;
    let constructorConstructionStarted = false;
    let constructorConstructionCompleted = false;
    let cityConstructionCompleted = false;

    const brainDecisionCounts = new Map<string, number>();
    for (let i = 0; i < ticksToRun; i++) {
        const seed = BigInt(Date.now());
        logSection(`Tick ${tick}`);

        const pendingOwnerSuggestion = await prisma.intent.findFirst({
            where: { actorId: owner.id, status: 'pending', params: { path: ['source'], equals: 'owner_suggestion' } }
        });
        if (!pendingOwnerSuggestion) {
            const decision = await brain.decideAction(owner.id, tick, seed.toString());
            if (decision.intentType !== IntentType.INTENT_IDLE) {
                brainDecisionCounts.set(
                    decision.intentType,
                    (brainDecisionCounts.get(decision.intentType) ?? 0) + 1
                );
                await prisma.intent.create({
                    data: {
                        actorId: owner.id,
                        type: decision.intentType,
                        params: { ...(decision.params ?? {}), source: 'agent_brain' },
                        priority: decision.priority,
                        status: 'pending',
                        tick
                    }
                });
                log(`Brain decision: ${decision.intentType}`);
            } else {
                log('Brain decision: INTENT_IDLE');
            }
        } else {
            log('Brain decision: SKIPPED (pending owner_suggestion)');
        }

        if (!cityRequestInjected) {
            await prisma.intent.create({
                data: {
                    actorId: owner.id,
                    type: IntentType.INTENT_REQUEST_CONSTRUCTION,
                    params: {
                        lotId: cityConstructionLot.id,
                        buildingType: 'SLUM_ROOM',
                        maxBudget: 3000,
                        preferredConstructorId: 'city',
                        source: 'owner_suggestion'
                    },
                    priority: 100,
                    status: 'pending',
                    tick
                }
            });
            cityRequestInjected = true;
            log('Injected city construction request.');
        }

        const requestIds = await prisma.constructionRequest.findMany({
            where: { requesterId: owner.id, status: { in: ['pending', 'quoted'] } },
            select: { id: true }
        });
        const pendingQuote = requestIds.length === 0
            ? null
            : await prisma.constructionQuote.findFirst({
                where: { status: 'pending', requestId: { in: requestIds.map(r => r.id) } },
                orderBy: { createdAt: 'asc' }
            });
        if (pendingQuote) {
            await prisma.intent.create({
                data: {
                    actorId: owner.id,
                    type: IntentType.INTENT_ACCEPT_CONSTRUCTION_QUOTE,
                    params: { quoteId: pendingQuote.id, source: 'owner_suggestion' },
                    priority: 100,
                    status: 'pending',
                    tick
                }
            });
            log(`Injected owner_suggestion accept quote: ${pendingQuote.id}`);
        }

        if (cityConstructionCompleted && !constructorRequestInjected) {
            await prisma.intent.create({
                data: {
                    actorId: owner.id,
                    type: IntentType.INTENT_REQUEST_CONSTRUCTION,
                    params: {
                        lotId: constructorConstructionLot.id,
                        buildingType: 'SLUM_ROOM',
                        maxBudget: 3000,
                        preferredConstructorId: constructorBusiness.id,
                        source: 'owner_suggestion'
                    },
                    priority: 100,
                    status: 'pending',
                    tick
                }
            });
            constructorRequestInjected = true;
            log('Injected constructor construction request.');
        }

        const { processedIntents, events } = await processTick(tick, seed);
        log(`Processed intents: ${processedIntents}, events: ${events.length}`);

        await generateConstructionQuotes(tick);
        await cleanupExpiredConstructionQuotes(tick);
        if (constructorBusiness?.id) {
            await prisma.business.update({
                where: { id: constructorBusiness.id },
                data: { ownerLastWorkedTick: tick }
            });
            const activeEmployment = await prisma.privateEmployment.findFirst({
                where: { businessId: constructorBusiness.id, status: 'ACTIVE' }
            });
            if (!activeEmployment) {
                await prisma.privateEmployment.create({
                    data: {
                        businessId: constructorBusiness.id,
                        agentId: owner.id,
                        salaryDaily: 100,
                        hiredTick: tick,
                        status: 'ACTIVE'
                    }
                });
            }
        }
        await processConstructionProjects(tick);
        await checkFreeze(tick);

        const newBusiness = await prisma.business.findFirst({
            where: { ownerId: owner.id },
            orderBy: { foundedTick: 'desc' }
        });
        if (newBusiness && !businessFound && !initialBusinessIds.has(newBusiness.id)) {
            businessFound = true;
            const bWallet = await prisma.businessWallet.findUnique({ where: { businessId: newBusiness.id } });
            businessWalletCreated = Boolean(bWallet);
            log(`Business founded: ${newBusiness.id} (wallet: ${businessWalletCreated ? 'yes' : 'no'})`);
        }

        const cityProject = await prisma.constructionProject.findFirst({
            where: { lotId: cityConstructionLot.id },
            orderBy: { createdAt: 'desc' }
        });
        if (cityProject && !cityConstructionStarted) {
            cityConstructionStarted = true;
            log(`City construction started: ${cityProject.id}`);
        }
        if (cityProject?.status === 'completed' && !cityConstructionCompleted) {
            cityConstructionCompleted = true;
            log(`City construction completed: ${cityProject.id}`);
        }

        const constructorProject = await prisma.constructionProject.findFirst({
            where: { lotId: constructorConstructionLot.id },
            orderBy: { createdAt: 'desc' }
        });
        if (constructorProject && !constructorConstructionStarted) {
            constructorConstructionStarted = true;
            log(`Constructor construction started: ${constructorProject.id}`);
        }
        if (constructorProject?.status === 'completed' && !constructorConstructionCompleted) {
            constructorConstructionCompleted = true;
            log(`Constructor construction completed: ${constructorProject.id}`);
        }

        await prisma.worldState.update({
            where: { id: 1 },
            data: { tick: tick + 1, updatedAt: new Date() }
        });
        tick += 1;
    }

    logSection('Summary');
    log(`Business founded: ${businessFound}`);
    log(`Business wallet created: ${businessWalletCreated}`);
    log(`City construction started: ${cityConstructionStarted}`);
    log(`City construction completed: ${cityConstructionCompleted}`);
    log(`Constructor construction started: ${constructorConstructionStarted}`);
    log(`Constructor construction completed: ${constructorConstructionCompleted}`);
    const finalCityProject = await prisma.constructionProject.findFirst({
        where: { lotId: cityConstructionLot.id },
        orderBy: { createdAt: 'desc' }
    });
    if (finalCityProject) {
        log(`City project status: ${finalCityProject.status}, est=${finalCityProject.estimatedCompletionTick}, actual=${finalCityProject.actualCompletionTick ?? 'n/a'}`);
    }
    const finalConstructorProject = await prisma.constructionProject.findFirst({
        where: { lotId: constructorConstructionLot.id },
        orderBy: { createdAt: 'desc' }
    });
    if (finalConstructorProject) {
        log(`Constructor project status: ${finalConstructorProject.status}, est=${finalConstructorProject.estimatedCompletionTick}, actual=${finalConstructorProject.actualCompletionTick ?? 'n/a'}`);
    }
    if (brainDecisionCounts.size > 0) {
        log(`Brain decisions: ${JSON.stringify(Object.fromEntries(brainDecisionCounts))}`);
    }
    log(`Report: ${REPORT_FILE}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

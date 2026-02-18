import dotenv from 'dotenv';
import path from 'path';
import { prisma } from '../db.js';
import { WalletService } from '../services/wallet.service.js';
import { IntentStatus, IntentType } from '../types/intent.types.js';
import {
    handleFoundBusiness,
    handleInjectBusinessFunds,
    handleUpgradeBusiness,
    handleSetPrices,
    handleHireEmployee,
    handleAcceptJob,
    handleAdjustSalary,
    handleFireEmployee,
    handleWorkOwnBusiness,
} from '../engine/handlers/business.handlers.js';
import { ethers } from 'ethers';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

type AgentWithState = {
    id: string;
    name: string;
    agentState: { cityId: string | null } | null;
    wallet: { balanceSbyte: any } | null;
};

if (!process.env.MONAD_RPC_URL && process.env.SOULBYTE_TEST_RPC) {
    process.env.MONAD_RPC_URL = process.env.SOULBYTE_TEST_RPC;
}

const walletService = new WalletService();

function log(message: string) {
    console.log(message);
}

async function commitUpdates(updates: any[]) {
    await prisma.$transaction(async (tx) => {
        for (const update of updates) {
            const table = (tx as any)[update.table];
            if (update.operation === 'update') await table.update({ where: update.where, data: update.data });
            if (update.operation === 'create') await table.create({ data: update.data });
        }
    });
}

async function ensureAgent(name: string, privateKey?: string, cityId?: string): Promise<AgentWithState> {
    const existingByName = await prisma.actor.findFirst({
        where: { name, kind: 'agent' },
        include: { agentState: true, wallet: true },
    });
    if (existingByName) return existingByName as AgentWithState;

    if (privateKey) {
        const address = new ethers.Wallet(privateKey).address;
        const existingWallet = await prisma.agentWallet.findUnique({ where: { walletAddress: address } });
        if (existingWallet) {
            const actor = await prisma.actor.findUnique({
                where: { id: existingWallet.actorId },
                include: { agentState: true, wallet: true },
            });
            if (actor) return actor as AgentWithState;
        }
    }

    const actor = await prisma.actor.create({
        data: {
            name,
            kind: 'agent',
            isGod: false,
            agentState: {
                create: {
                    cityId: cityId ?? null,
                    energy: 100,
                    health: 100,
                    housingTier: 'street',
                    jobType: 'unemployed',
                },
            },
        },
        include: { agentState: true, wallet: true },
    });

    if (privateKey) {
        await walletService.importWallet(actor.id, privateKey);
    }

    if (!actor.wallet) {
        await prisma.wallet.create({ data: { actorId: actor.id, balanceSbyte: 0 } });
    }

    return (await prisma.actor.findUnique({
        where: { id: actor.id },
        include: { agentState: true, wallet: true },
    })) as AgentWithState;
}

async function ensureLot(ownerId: string, cityId: string) {
    const existing = await prisma.property.findFirst({
        where: { ownerId, cityId, isEmptyLot: true, underConstruction: false },
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
            lotType: 'SUBURBAN_LOT',
        },
    });
}

async function main() {
    log('=== Business Simulation (found, inject, upgrade, hire, salary, fire, work) ===');

    const city = await prisma.city.findFirst();
    if (!city) throw new Error('No cities found. Run genesis first.');

    const tick = (await prisma.worldState.findFirst({ where: { id: 1 } }))?.tick ?? 1000;

    const ownerName = process.env.BOT1_ACTOR_NAME || 'ReviewOwner';
    const employeeName = process.env.BOT2_ACTOR_NAME || 'ReviewEmployee';
    const ownerPk = process.env.BOT1_PRIVATE_KEY || process.env.SOULBYTE_TEST_PK1;
    const employeePk = process.env.BOT2_PRIVATE_KEY || process.env.SOULBYTE_TEST_PK2;

    let owner = await ensureAgent(ownerName, ownerPk, city.id);
    const employee = await ensureAgent(employeeName, employeePk, city.id);

    let ownerActorFull = await prisma.actor.findUnique({
        where: { id: owner.id },
        include: { agentState: true, wallet: true },
    });
    let ownerWallet = await prisma.agentWallet.findUnique({ where: { actorId: owner.id } });
    if (!ownerWallet || Number(ownerWallet.balanceMon) < 5) {
        const fallback = await prisma.agentWallet.findFirst({
            where: { balanceMon: { gte: 5 }, actor: { kind: 'agent' } },
            include: { actor: { include: { agentState: true, wallet: true } } },
            orderBy: { balanceMon: 'desc' },
        });
        if (fallback?.actor) {
            owner = fallback.actor as AgentWithState;
            ownerActorFull = fallback.actor as any;
            ownerWallet = fallback as any;
            log(`⚠️ Switched owner to funded agent: ${fallback.actor.name}`);
        }
    }

    await prisma.agentState.update({
        where: { actorId: owner.id },
        data: {
            cityId: city.id,
            activityState: 'IDLE',
            wealthTier: 'W5',
            reputationScore: 250,
        },
    });
    await prisma.actor.update({
        where: { id: owner.id },
        data: { reputation: 250 },
    });
    ownerActorFull = await prisma.actor.findUnique({
        where: { id: owner.id },
        include: { agentState: true, wallet: true },
    });
    await prisma.agentState.update({
        where: { actorId: employee.id },
        data: {
            cityId: city.id,
            activityState: 'IDLE',
            lastJobChangeTick: tick - 2000,
        },
    });

    if (ownerPk) {
        try {
            await walletService.syncWalletBalances(owner.id);
        } catch (error) {
            log(`⚠️ Owner balance sync failed: ${String((error as Error).message || error)}`);
        }
    }
    if (employeePk) {
        try {
            await walletService.syncWalletBalances(employee.id);
        } catch (error) {
            log(`⚠️ Employee balance sync failed: ${String((error as Error).message || error)}`);
        }
    }

    const lot = await ensureLot(owner.id, city.id);

    const preferredTypes = [
        'STORE',
        'RESTAURANT',
        'TAVERN',
        'WORKSHOP',
        'GYM',
        'CLINIC',
        'ENTERTAINMENT',
        'REALESTATE',
        'BANK',
        'CASINO',
    ] as const;
    const ownedBusinesses = await prisma.business.findMany({
        where: { ownerId: owner.id },
        select: { id: true, businessType: true },
    });
    const ownedTypes = new Set(ownedBusinesses.map((b) => b.businessType));
    const businessType = preferredTypes.find((type) => !ownedTypes.has(type)) ?? ownedBusinesses[0]?.businessType;
    if (!businessType) {
        throw new Error('No business type available for tests.');
    }

    const foundIntent = {
        id: 'biz_found',
        actorId: owner.id,
        type: IntentType.INTENT_FOUND_BUSINESS,
        params: { businessType, cityId: city.id, landId: lot.id, proposedName: `Review ${businessType} ${Date.now()}` },
        priority: 10,
    };
    const ownerActor = ownerActorFull ?? await prisma.actor.findUnique({ where: { id: owner.id }, include: { agentState: true, wallet: true } });
    if (!ownerActor) throw new Error('Owner missing');
    let businessId: string | null = null;
    const foundRes = await handleFoundBusiness(
        foundIntent as any,
        ownerActor,
        ownerActor.agentState,
        ownerActor.wallet,
        tick
    );
    if (foundRes.intentStatus === IntentStatus.EXECUTED) {
        await commitUpdates(foundRes.stateUpdates);
        log('✓ INTENT_FOUND_BUSINESS');
        const targetId = foundRes.events[0]?.targetIds?.[0];
        businessId = typeof targetId === 'string' ? targetId : null;
    } else if (String(foundRes.events[0]?.sideEffects?.reason || '').includes('Already owns')) {
        log('✓ INTENT_FOUND_BUSINESS skipped (already owns type)');
        const existing = await prisma.business.findFirst({
            where: { ownerId: owner.id, cityId: city.id, businessType },
            orderBy: { foundedTick: 'desc' },
        });
        businessId = existing?.id ?? null;
    } else {
        throw new Error(`Found business failed: ${JSON.stringify(foundRes.events[0]?.sideEffects)}`);
    }
    if (!businessId) throw new Error('Business not found after creation');
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new Error('Business not found after creation');

    const setPricesRes = await handleSetPrices(
        { id: 'biz_prices', actorId: owner.id, type: IntentType.INTENT_SET_PRICES, params: { businessId: business.id, pricePerService: 25 }, priority: 10 } as any,
        ownerActor,
        ownerActor.agentState,
        ownerActor.wallet,
        tick + 1
    );
    if (setPricesRes.intentStatus !== IntentStatus.EXECUTED) {
        throw new Error(`Set prices failed: ${JSON.stringify(setPricesRes.events[0]?.sideEffects)}`);
    }
    await commitUpdates(setPricesRes.stateUpdates);
    log('✓ INTENT_SET_PRICES');

    const injectRes = await handleInjectBusinessFunds(
        { id: 'biz_inject', actorId: owner.id, type: IntentType.INTENT_INJECT_BUSINESS_FUNDS, params: { businessId: business.id, amount: 5000 }, priority: 10 } as any,
        ownerActor,
        ownerActor.agentState,
        ownerActor.wallet
    );
    if (injectRes.intentStatus !== IntentStatus.EXECUTED) {
        throw new Error(`Inject funds failed: ${JSON.stringify(injectRes.events[0]?.sideEffects)}`);
    }
    await commitUpdates(injectRes.stateUpdates);
    log('✓ INTENT_INJECT_BUSINESS_FUNDS');

    const upgradeRes = await handleUpgradeBusiness(
        { id: 'biz_upgrade', actorId: owner.id, type: IntentType.INTENT_UPGRADE_BUSINESS, params: { businessId: business.id, targetLevel: 2 }, priority: 10 } as any,
        ownerActor,
        ownerActor.agentState,
        ownerActor.wallet,
        tick + 2
    );
    if (upgradeRes.intentStatus !== IntentStatus.EXECUTED) {
        throw new Error(`Upgrade business failed: ${JSON.stringify(upgradeRes.events[0]?.sideEffects)}`);
    }
    await commitUpdates(upgradeRes.stateUpdates);
    log('✓ INTENT_UPGRADE_BUSINESS');

    const hireRes = await handleHireEmployee(
        { id: 'biz_hire', actorId: owner.id, type: IntentType.INTENT_HIRE_EMPLOYEE, params: { businessId: business.id, targetAgentId: employee.id, offeredSalary: 150 }, priority: 10 } as any,
        ownerActor,
        ownerActor.agentState,
        ownerActor.wallet,
        tick + 3
    );
    if (hireRes.intentStatus !== IntentStatus.EXECUTED) {
        throw new Error(`Hire employee failed: ${JSON.stringify(hireRes.events[0]?.sideEffects)}`);
    }
    await commitUpdates(hireRes.stateUpdates);
    log('✓ INTENT_HIRE_EMPLOYEE');

    const employeeActor = await prisma.actor.findUnique({ where: { id: employee.id }, include: { agentState: true, wallet: true } });
    if (!employeeActor) throw new Error('Employee missing');

    const acceptRes = await handleAcceptJob(
        { id: 'biz_accept', actorId: employee.id, type: IntentType.INTENT_ACCEPT_JOB, params: { businessId: business.id }, priority: 10 } as any,
        employeeActor,
        employeeActor.agentState,
        employeeActor.wallet,
        tick + 4
    );
    if (acceptRes.intentStatus !== IntentStatus.EXECUTED) {
        throw new Error(`Accept job failed: ${JSON.stringify(acceptRes.events[0]?.sideEffects)}`);
    }
    await commitUpdates(acceptRes.stateUpdates);
    log('✓ INTENT_ACCEPT_JOB');

    const adjustRes = await handleAdjustSalary(
        { id: 'biz_salary', actorId: owner.id, type: IntentType.INTENT_ADJUST_SALARY, params: { businessId: business.id, agentId: employee.id, newSalary: 200 }, priority: 10 } as any,
        ownerActor,
        ownerActor.agentState,
        ownerActor.wallet,
        tick + 5
    );
    if (adjustRes.intentStatus !== IntentStatus.EXECUTED) {
        throw new Error(`Adjust salary failed: ${JSON.stringify(adjustRes.events[0]?.sideEffects)}`);
    }
    await commitUpdates(adjustRes.stateUpdates);
    log('✓ INTENT_ADJUST_SALARY');

    const fireRes = await handleFireEmployee(
        { id: 'biz_fire', actorId: owner.id, type: IntentType.INTENT_FIRE_EMPLOYEE, params: { businessId: business.id, agentId: employee.id }, priority: 10 } as any,
        ownerActor,
        ownerActor.agentState,
        ownerActor.wallet,
        tick + 6
    );
    if (fireRes.intentStatus !== IntentStatus.EXECUTED) {
        throw new Error(`Fire employee failed: ${JSON.stringify(fireRes.events[0]?.sideEffects)}`);
    }
    await commitUpdates(fireRes.stateUpdates);
    log('✓ INTENT_FIRE_EMPLOYEE');

    const workRes = await handleWorkOwnBusiness(
        { id: 'biz_work', actorId: owner.id, type: IntentType.INTENT_WORK_OWN_BUSINESS, params: { businessId: business.id }, priority: 10 } as any,
        ownerActor,
        ownerActor.agentState,
        ownerActor.wallet,
        tick + 7
    );
    if (workRes.intentStatus !== IntentStatus.EXECUTED) {
        throw new Error(`Work own business failed: ${JSON.stringify(workRes.events[0]?.sideEffects)}`);
    }
    await commitUpdates(workRes.stateUpdates);
    log('✓ INTENT_WORK_OWN_BUSINESS');

    log('=== Business Simulation Complete ===');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

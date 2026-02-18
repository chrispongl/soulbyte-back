import 'dotenv/config';
import { prisma } from '../db.js';
import { handleListProperty, handleBuyProperty, handleEvict } from '../engine/handlers/property.handlers.js';
import { handleChangeHousing } from '../engine/handlers/economy.handlers.js';
import { IntentType } from '../types/intent.types.js';
import path from 'path';
import fs from 'fs';

const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const SIM_REPORT_FILE = path.join(process.cwd(), '../../docs/simulations', `${RUN_TIMESTAMP}_property-edge-sim.md`);

function appendReport(content: string) {
    const dir = path.dirname(SIM_REPORT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(SIM_REPORT_FILE, content);
}

async function log(message: string, header = false) {
    console.log(message);
    const formatted = header ? `\n## ${message}\n` : `- ${message}\n`;
    appendReport(formatted);
}

async function logSection(title: string) {
    console.log(`\n=== ${title} ===`);
    appendReport(`\n### ${title}\n`);
}

async function commitUpdates(updates: any[]) {
    await prisma.$transaction(async (tx) => {
        for (const update of updates) {
            const table = (tx as any)[update.table];
            if (update.operation === 'update') await table.update({ where: update.where, data: update.data });
            if (update.operation === 'create') await table.create({ data: update.data });
            if (update.operation === 'delete') await table.delete({ where: update.where });
        }
    });
}

async function getActorOrFail(name: string) {
    const actor = await prisma.actor.findFirst({
        where: { name },
        include: { wallet: true, agentState: true }
    });
    if (!actor) {
        await log(`❌ Actor not found: ${name}`);
        process.exit(1);
    }
    return actor;
}

async function main() {
    await logSection('Property Edge Cases Simulation');

    const bot1 = await getActorOrFail(process.env.BOT1_ACTOR_NAME || 'Alice');
    const bot2 = await getActorOrFail(process.env.BOT2_ACTOR_NAME || 'Bob');

    await prisma.agentState.updateMany({
        where: { actorId: { in: [bot1.id, bot2.id] } },
        data: { activityState: 'IDLE', activityEndTick: null }
    });
    const bot1State = await prisma.agentState.findUnique({ where: { actorId: bot1.id } });
    const bot2State = await prisma.agentState.findUnique({ where: { actorId: bot2.id } });

    // Pick a property to sell
    const property = await prisma.property.findFirst({
        where: {
            isEmptyLot: false,
            housingTier: { not: 'street' }
        }
    });
    if (!property) {
        await log('❌ No property found');
        process.exit(1);
    }

    await prisma.property.update({
        where: { id: property.id },
        data: {
            ownerId: bot1.id,
            forSale: false,
            salePrice: 100,
            tenantId: null,
            forRent: false
        }
    });

    await logSection('Step 1: List Property');
    const listRes = await handleListProperty(
        {
            id: 'sim-list',
            actorId: bot1.id,
            type: IntentType.INTENT_LIST_PROPERTY,
            params: { propertyId: property.id, forSale: true, salePrice: 100, forRent: false },
            priority: 1
        } as any,
        { id: bot1.id, name: bot1.name, frozen: false, dead: false } as any,
        bot1State as any,
        bot1.wallet as any,
        0,
        BigInt(Date.now())
    );
    await commitUpdates(listRes.stateUpdates);
    const listReason = listRes.events?.[0]?.sideEffects?.reason as string | undefined;
    await log(`List result: ${listRes.intentStatus}${listReason ? ` (${listReason})` : ''}`);

    await logSection('Step 2: Buy Property');
    const buyRes = await handleBuyProperty(
        { id: 'sim-buy', actorId: bot2.id, type: IntentType.INTENT_BUY_PROPERTY, params: { propertyId: property.id }, priority: 1 } as any,
        { id: bot2.id, name: bot2.name, frozen: false, dead: false } as any,
        bot2State as any,
        bot2.wallet as any,
        0,
        BigInt(Date.now())
    );
    await commitUpdates(buyRes.stateUpdates);
    const buyReason = buyRes.events?.[0]?.sideEffects?.reason as string | undefined;
    await log(`Buy result: ${buyRes.intentStatus}${buyReason ? ` (${buyReason})` : ''}`);

    await logSection('Step 3: Move-In Rent');
    const rental = await prisma.property.findFirst({
        where: { forRent: true, tenantId: null }
    });
    if (!rental) {
        await log('❌ No rentable property found');
        process.exit(1);
    }
    const moveRes = await handleChangeHousing(
        { id: 'sim-move', actorId: bot2.id, type: IntentType.INTENT_CHANGE_HOUSING, params: { propertyId: rental.id }, priority: 1 } as any,
        { id: bot2.id, name: bot2.name, frozen: false, dead: false } as any,
        bot2State as any,
        bot2.wallet as any,
        0,
        BigInt(Date.now())
    );
    await commitUpdates(moveRes.stateUpdates);
    await log(`Move-in result: ${moveRes.intentStatus}`);

    await logSection('Step 4: Eviction');
    await prisma.property.update({
        where: { id: rental.id },
        data: { tenantId: bot2.id, ownerId: bot1.id, missedRentDays: 3, forRent: true }
    });
    const evictRes = await handleEvict(
        { id: 'sim-evict', actorId: bot1.id, type: IntentType.INTENT_EVICT, params: { propertyId: rental.id }, priority: 1 } as any,
        { id: bot1.id, name: bot1.name, frozen: false, dead: false } as any,
        bot1State as any,
        bot1.wallet as any,
        0,
        BigInt(Date.now())
    );
    await commitUpdates(evictRes.stateUpdates);
    await log(`Evict result: ${evictRes.intentStatus}`);

    await logSection('Success');
    await log(`Report: ${SIM_REPORT_FILE}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

import 'dotenv/config';
import { prisma } from '../db.js';
import { handlePayRent } from '../engine/handlers/economy.handlers.js';
import { IntentStatus, IntentType } from '../types/intent.types.js';
import { FEE_CONFIG } from '../config/fees.js';
import path from 'path';
import fs from 'fs';

const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const SIM_REPORT_FILE = path.join(process.cwd(), '../../docs/simulations', `${RUN_TIMESTAMP}_rent-split-sim.md`);

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
    await logSection('Rent Split Simulation');

    const bot1 = await getActorOrFail(process.env.BOT1_ACTOR_NAME || 'Alice');
    const bot2 = await getActorOrFail(process.env.BOT2_ACTOR_NAME || 'Bob');

    // Ensure marriage consent exists and active
    const marriage = await prisma.consent.findFirst({
        where: {
            OR: [
                { partyAId: bot1.id, partyBId: bot2.id },
                { partyAId: bot2.id, partyBId: bot1.id }
            ],
            type: 'marriage',
            status: 'active'
        }
    });

    if (!marriage) {
        const newConsent = await prisma.consent.create({
            data: {
                type: 'marriage',
                partyAId: bot1.id,
                partyBId: bot2.id,
                status: 'active',
                terms: {}
            }
        });
        await log(`✓ Created marriage consent ${newConsent.id}`);
    }

    // Pick a rented property for bot1 (or assign one)
    let property = await prisma.property.findFirst({
        where: {
            cityId: bot1.agentState?.cityId ?? undefined,
            rentPrice: { gt: 0 },
            tenantId: bot1.id,
            NOT: { ownerId: bot1.id }
        }
    });

    if (!property) {
        property = await prisma.property.findFirst({
            where: {
                cityId: bot1.agentState?.cityId ?? undefined,
                rentPrice: { gt: 0 },
                tenantId: null,
                OR: [
                    { ownerId: null },
                    { ownerId: { not: bot1.id } }
                ]
            }
        });
        if (!property) {
            await log('❌ No rentable property found.');
            process.exit(1);
        }
        await prisma.property.update({
            where: { id: property.id },
            data: { tenantId: bot1.id }
        });
        await log(`✓ Assigned tenant ${bot1.name} to property ${property.id}`);
    }

    if (property.ownerId === bot1.id) {
        await prisma.property.update({
            where: { id: property.id },
            data: { ownerId: null }
        });
        await log(`✓ Cleared owner to force city-owned rent flow`);
    }

    // Ensure city fee is set to default for validation
    await prisma.cityPolicy.update({
        where: { cityId: property.cityId },
        data: { cityFeeBps: FEE_CONFIG.CITY_FEE_DEFAULT_BPS }
    });
    await log(`✓ City fee set to default bps=${FEE_CONFIG.CITY_FEE_DEFAULT_BPS} for validation`);

    const beforeWallet1 = await prisma.wallet.findUnique({ where: { actorId: bot1.id } });
    const beforeWallet2 = await prisma.wallet.findUnique({ where: { actorId: bot2.id } });
    const beforeAgentWallet1 = await prisma.agentWallet.findUnique({ where: { actorId: bot1.id } });
    const beforeAgentWallet2 = await prisma.agentWallet.findUnique({ where: { actorId: bot2.id } });

    await log(`Bot1 balance before: ${beforeWallet1?.balanceSbyte?.toString()}`);
    await log(`Bot2 balance before: ${beforeWallet2?.balanceSbyte?.toString()}`);
    await log(`Rent price: ${property.rentPrice.toString()}`);

    // Force split scenario if Bot1 can cover full rent
    const rentAmount = Number(property.rentPrice.toString());
    const bot1Bal = Number(beforeWallet1?.balanceSbyte?.toString() || '0');
    const bot2Bal = Number(beforeWallet2?.balanceSbyte?.toString() || '0');
    if (bot1Bal >= rentAmount) {
        const half = rentAmount / 2;
        const buffer = Math.max(1, rentAmount * 0.05);
        const target = half + buffer;
        await prisma.wallet.update({
            where: { actorId: bot1.id },
            data: { balanceSbyte: target }
        });
        await prisma.agentWallet.update({
            where: { actorId: bot1.id },
            data: { balanceSbyte: target }
        });
        if (bot2Bal < target) {
            await prisma.wallet.update({
                where: { actorId: bot2.id },
                data: { balanceSbyte: target }
            });
            await prisma.agentWallet.update({
                where: { actorId: bot2.id },
                data: { balanceSbyte: target }
            });
        }
        await log(`✓ Adjusted off-chain balances to force split (Bot1=${target}, Bot2>=${target})`);
    }

    const intent = await prisma.intent.create({
        data: {
            actorId: bot1.id,
            type: IntentType.INTENT_PAY_RENT,
            params: {},
            tick: 0,
            priority: 5
        }
    });

    const freshBot1 = await prisma.actor.findFirst({
        where: { id: bot1.id },
        include: { wallet: true, agentState: true }
    });

    const res = await handlePayRent(
        {
            id: intent.id,
            actorId: bot1.id,
            type: IntentType.INTENT_PAY_RENT,
            params: {},
            priority: 5
        } as any,
        { id: bot1.id, name: bot1.name, frozen: false, dead: false } as any,
        freshBot1?.agentState as any,
        freshBot1?.wallet as any,
        0,
        BigInt(Date.now())
    );

    if (res.intentStatus === IntentStatus.EXECUTED) {
        await commitUpdates(res.stateUpdates);
    }
    await prisma.intent.update({ where: { id: intent.id }, data: { status: res.intentStatus } });

    const afterWallet1 = await prisma.wallet.findUnique({ where: { actorId: bot1.id } });
    const afterWallet2 = await prisma.wallet.findUnique({ where: { actorId: bot2.id } });

    await log(`Intent status: ${res.intentStatus}`);
    await log(`Bot1 balance after: ${afterWallet1?.balanceSbyte?.toString()}`);
    await log(`Bot2 balance after: ${afterWallet2?.balanceSbyte?.toString()}`);

    const lastTx = await prisma.transaction.findFirst({
        where: {
            reason: 'RENT_PAYMENT',
            createdAt: { gte: intent.createdAt }
        },
        orderBy: { createdAt: 'desc' }
    });

    if (lastTx) {
        const cityPolicy = await prisma.cityPolicy.findUnique({ where: { cityId: property.cityId } });
        const cityFeeBps = Number(cityPolicy?.cityFeeBps ?? FEE_CONFIG.CITY_FEE_DEFAULT_BPS);
        const expectedPlatform = (Number(lastTx.amount) * FEE_CONFIG.PLATFORM_FEE_BPS) / 10000;
        const expectedCity = (Number(lastTx.amount) * cityFeeBps) / 10000;
        await log(`Transaction: ${JSON.stringify({ id: lastTx.id, amount: lastTx.amount, feePlatform: lastTx.feePlatform, feeCity: lastTx.feeCity, onchainTxHash: lastTx.onchainTxHash, metadata: lastTx.metadata })}`);
        await log(`Expected fees: platform=${expectedPlatform.toFixed(4)} (bps=${FEE_CONFIG.PLATFORM_FEE_BPS}), city=${expectedCity.toFixed(4)} (bps=${cityFeeBps})`);
    }

    await logSection('Success');
    await log(`Report: ${SIM_REPORT_FILE}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

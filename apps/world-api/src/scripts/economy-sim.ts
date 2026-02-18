import 'dotenv/config';
import { prisma } from '../db.js';
import { IntentStatus, IntentType } from '../types/intent.types.js';
import { handleCraft } from '../engine/handlers/crafting.handlers.js';
import { handleListItem, handleBuyItem } from '../engine/handlers/economy.handlers.js';
import { handlePlayGame } from '../engine/handlers/gaming.handlers.js';
import { Decimal } from 'decimal.js';
import path from 'path';
import fs from 'fs';

const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const SIM_REPORT_FILE = path.join(process.cwd(), '../../docs/simulations', `${RUN_TIMESTAMP}_economy-sim.md`);

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

async function logActorBalances(actorId: string, label: string) {
    const actor = await prisma.actor.findUnique({ where: { id: actorId } });
    const wallet = await prisma.wallet.findUnique({ where: { actorId } });
    const agentWallet = await prisma.agentWallet.findUnique({ where: { actorId } });
    await log(`   > ${label} :: ${actor?.name ?? actorId}`);
    await log(`     - wallet.balanceSbyte: ${wallet?.balanceSbyte?.toString() ?? 'N/A'}`);
    await log(`     - wallet.lockedSbyte: ${wallet?.lockedSbyte?.toString() ?? 'N/A'}`);
    await log(`     - agentWallet.address: ${agentWallet?.walletAddress ?? 'N/A'}`);
    await log(`     - agentWallet.balanceSbyte: ${agentWallet?.balanceSbyte?.toString() ?? 'N/A'}`);
    await log(`     - agentWallet.balanceMon: ${agentWallet?.balanceMon?.toString() ?? 'N/A'}`);
}

async function logRecentTransactions(actorId: string, label: string, since: Date) {
    const txs = await prisma.onchainTransaction.findMany({
        where: {
            OR: [{ fromActorId: actorId }, { toActorId: actorId }],
            createdAt: { gte: since }
        },
        orderBy: { createdAt: 'desc' },
        take: 5
    });

    await log(`   > ${label} (last ${txs.length})`);
    for (const tx of txs) {
        await log(`     - ${tx.txType} ${tx.amount} (hash: ${tx.txHash})`);
    }
}

async function verifyLastTransaction(actorId: string, type: string, amountApprox: number) {
    const tx = await prisma.onchainTransaction.findFirst({
        where: {
            OR: [{ fromActorId: actorId }, { toActorId: actorId }],
            txType: type as any
        },
        orderBy: { createdAt: 'desc' }
    });

    if (!tx) {
        await log(`❌ No '${type}' transaction found for ${actorId}`);
        process.exit(1);
    }

    await log(`   > TX Hash: ${tx.txHash}`);
    await log(`   > TX Type: ${tx.txType}`);
    await log(`   > From: ${tx.fromAddress ?? 'N/A'} (actor ${tx.fromActorId ?? 'N/A'})`);
    await log(`   > To: ${tx.toAddress ?? 'N/A'} (actor ${tx.toActorId ?? 'N/A'})`);
    await log(`   > Amount: ${tx.amount} (Expected ~${amountApprox})`);
    await log(`   > Platform Fee: ${tx.platformFee ?? '0'}`);
    await log(`   > City Fee: ${tx.cityFee ?? '0'}`);
    await log(`   > Status: ${tx.status}`);
    await log(`   > Block: ${tx.blockNumber ?? 'N/A'}`);
}

async function main() {
    await logSection('Economy Simulation (Crafting + Market + Gaming)');

    const bot1 = await getActorOrFail(process.env.BOT1_ACTOR_NAME || 'Alice');
    const bot2 = await getActorOrFail(process.env.BOT2_ACTOR_NAME || 'Bob');

    await logActorBalances(bot1.id, 'Bot1 balances (start)');
    await logActorBalances(bot2.id, 'Bot2 balances (start)');

    // Step 1: Crafting
    await logSection('Step 1: Crafting');
    const recipe = await prisma.recipe.findFirst({
        include: {
            ingredients: { include: { itemDef: true } },
            outputItem: true
        }
    });

    let craftedItemId: string | null = null;
    let craftedListingPrice: Decimal | null = null;
    if (!recipe) {
        await log('⚠️ No recipe found in DB. Skipping crafting step.');
    } else {
        const requiredSkill = recipe.requiredSkill ?? 0;
        if ((bot1.agentState?.publicExperience ?? 0) < requiredSkill) {
            await prisma.agentState.update({
                where: { actorId: bot1.id },
                data: { publicExperience: requiredSkill }
            });
            await log(`✓ Boosted Bot1 publicExperience to ${requiredSkill} for crafting`);
        }

        // Ensure ingredients exist in inventory
        for (const ingredient of recipe.ingredients) {
            const requiredQty = ingredient.quantity;
            const existing = await prisma.inventoryItem.findUnique({
                where: {
                    actorId_itemDefId: {
                        actorId: bot1.id,
                        itemDefId: ingredient.itemDefId
                    }
                }
            });
            if (!existing) {
                await prisma.inventoryItem.create({
                    data: {
                        actorId: bot1.id,
                        itemDefId: ingredient.itemDefId,
                        quantity: requiredQty,
                        quality: 50
                    }
                });
                await log(`✓ Added ingredient: ${ingredient.itemDef.name} x${requiredQty}`);
            } else if (existing.quantity < requiredQty) {
                await prisma.inventoryItem.update({
                    where: { id: existing.id },
                    data: { quantity: requiredQty }
                });
                await log(`✓ Topped up ingredient: ${ingredient.itemDef.name} to x${requiredQty}`);
            }
        }

        const craftIntent = {
            id: 'craft_1',
            actorId: bot1.id,
            type: IntentType.INTENT_CRAFT,
            params: { recipeId: recipe.id, quantity: 1 },
            priority: 10
        };

        const craftCtx = await prisma.actor.findUnique({
            where: { id: bot1.id },
            include: { agentState: true, wallet: true }
        });

        let craftCtxFresh = craftCtx;
        if (craftCtx?.agentState) {
            await prisma.agentState.update({
                where: { actorId: bot1.id },
                data: { energy: 100, hunger: 100 }
            });
            await log('✓ Restored Bot1 energy/hunger for crafting');
            craftCtxFresh = await prisma.actor.findUnique({
                where: { id: bot1.id },
                include: { agentState: true, wallet: true }
            });
        }

        const craftRes = await handleCraft(
            craftIntent as any,
            craftCtxFresh!,
            craftCtxFresh!.agentState,
            craftCtxFresh!.wallet,
            100,
            BigInt(100)
        );
        if (craftRes.intentStatus !== IntentStatus.EXECUTED) {
            await log(`❌ Craft failed: ${JSON.stringify(craftRes.events[0]?.sideEffects)}`);
            process.exit(1);
        }
        await commitUpdates(craftRes.stateUpdates);
        await log(`✓ Crafted ${recipe.outputItem.name} x${recipe.outputQuantity}`);
        await logActorBalances(bot1.id, 'Bot1 balances (after craft)');
        craftedItemId = recipe.outputItemId;
        craftedListingPrice = new Decimal(recipe.outputItem.baseValue.toString()).mul(2);
    }

    // Step 2: Market listing + buy
    await logSection('Step 2: Market Listing + Buy');
    let listing = null;
    if (craftedItemId && craftedListingPrice) {
        const listIntent = {
            id: 'list_1',
            actorId: bot1.id,
            type: IntentType.INTENT_LIST,
            params: { itemDefId: craftedItemId, quantity: 1, price: craftedListingPrice.toNumber() },
            priority: 10
        };
        const listCtx = await prisma.actor.findUnique({
            where: { id: bot1.id },
            include: { agentState: true, wallet: true }
        });
        const listRes = await handleListItem(listIntent as any, listCtx!, listCtx!.agentState, listCtx!.wallet, 200, BigInt(200));
        if (listRes.intentStatus !== IntentStatus.EXECUTED) {
            await log(`❌ Listing failed: ${JSON.stringify(listRes.events[0]?.sideEffects)}`);
            process.exit(1);
        }
        await commitUpdates(listRes.stateUpdates);
        await log(`✓ Listed crafted item for ${craftedListingPrice.toString()} SBYTE`);

        listing = await prisma.marketListing.findFirst({
            where: { sellerId: bot1.id, itemDefId: craftedItemId, status: 'active' },
            orderBy: { createdAt: 'desc' }
        });
        if (!listing) {
            await log('❌ Listing not found after creation.');
            process.exit(1);
        }
    } else {
        listing = await prisma.marketListing.findFirst({
            where: { status: 'active' },
            orderBy: { createdAt: 'desc' }
        });
        if (!listing) {
            await log('⚠️ No active market listings found. Skipping market buy step.');
        }
    }

    if (listing) {
        const buyIntent = {
            id: 'buy_1',
            actorId: bot2.id,
            type: IntentType.INTENT_BUY,
            params: { listingId: listing.id, quantity: 1 },
            priority: 10
        };
        const buyCtx = await prisma.actor.findUnique({
            where: { id: bot2.id },
            include: { agentState: true, wallet: true }
        });
        const buyRes = await handleBuyItem(buyIntent as any, buyCtx!, buyCtx!.agentState, buyCtx!.wallet, 201, BigInt(201));
        if (buyRes.intentStatus !== IntentStatus.EXECUTED) {
            await log(`❌ Buy failed: ${JSON.stringify(buyRes.events[0]?.sideEffects)}`);
            process.exit(1);
        }
        await commitUpdates(buyRes.stateUpdates);
        await log(`✓ Bot2 bought listing ${listing.id}`);
        await verifyLastTransaction(bot2.id, 'MARKET_PURCHASE', listing.priceEach.toNumber());
        await logActorBalances(bot1.id, 'Bot1 balances (after market sale)');
        await logActorBalances(bot2.id, 'Bot2 balances (after market buy)');
    }

    // Step 3: Gaming
    await logSection('Step 3: Gaming');
    const stake = 100;
    const gamingStart = new Date();
    const gameIntent = {
        id: 'game_1',
        actorId: bot2.id,
        type: IntentType.INTENT_PLAY_GAME,
        params: { gameType: 'dice', stake },
        priority: 10
    };
    const gameCtx = await prisma.actor.findUnique({
        where: { id: bot2.id },
        include: { agentState: true, wallet: true }
    });
    const gameRes = await handlePlayGame(gameIntent as any, gameCtx!, gameCtx!.agentState, gameCtx!.wallet, 300, BigInt(300));
    if (gameRes.intentStatus !== IntentStatus.EXECUTED) {
        await log(`❌ Gaming failed: ${JSON.stringify(gameRes.events[0]?.sideEffects)}`);
        process.exit(1);
    }
    await commitUpdates(gameRes.stateUpdates);
    await log(`✓ Bot2 played game with stake ${stake}`);
    await logActorBalances(bot2.id, 'Bot2 balances (after gaming)');
    await logRecentTransactions(bot2.id, 'Bot2 on-chain txs (gaming)', gamingStart);

    await logSection('Success');
    await log('✓ Economy simulation completed successfully.');
}

main().catch(async (error) => {
    console.error(error);
    await log(`❌ Economy simulation failed: ${String(error?.message || error)}`);
    process.exit(1);
});

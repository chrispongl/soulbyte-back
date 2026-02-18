
import dotenv from 'dotenv';
import path from 'path';
import { prisma } from '../db.js';
import { WalletService } from '../services/wallet.service.js';
import { CONTRACTS, ERC20_ABI } from '../config/contracts.js';
import { getResilientProvider } from '../config/network.js';
import { FEE_CONFIG } from '../config/fees.js';
import { ethers } from 'ethers';
import fs from 'fs';
import crypto from 'crypto';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

if (!process.env.MONAD_RPC_URL && process.env.SOULBYTE_TEST_RPC) {
    process.env.MONAD_RPC_URL = process.env.SOULBYTE_TEST_RPC;
}

// Import Handlers
import { handleBuyProperty, handleListProperty } from '../engine/handlers/property.handlers.js';
import { handlePayRent, handleChangeHousing } from '../engine/handlers/economy.handlers.js';
import { handleCollectSalary } from '../engine/handlers/public-employment.handlers.js';
import { handleRest } from '../engine/handlers/life.handlers.js';

// Types
import { IntentStatus, IntentType } from '../types/intent.types.js';

const REVIEW_REPORT_FILE = path.join(process.cwd(), '../../docs/reviews/ONCHAIN_OFFCHAIN_TESTS.md');
const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const SIM_REPORT_FILE = path.join(process.cwd(), '../../docs/simulations', `${RUN_TIMESTAMP}_hybrid-sim.md`);
const STEP_FILE = path.join(process.cwd(), 'hybrid-sim-step.json');
const LOG_ONCHAIN = process.env.LOG_ONCHAIN_BALANCES === 'true';
const ONCHAIN_MODE = process.env.SKIP_ONCHAIN_EXECUTION !== 'true';
const ONCHAIN_PREFLIGHT = process.env.ONCHAIN_PREFLIGHT === 'true';
const SYNC_ONCHAIN_BALANCES = process.env.SYNC_ONCHAIN_BALANCES === 'true';
const FORCE_BOT_WALLETS = process.env.FORCE_BOT_WALLETS === 'true';
const BOT1_NAME = process.env.BOT1_ACTOR_NAME || 'Bot1_Hybrid';
const BOT2_NAME = process.env.BOT2_ACTOR_NAME || 'Bot2_Hybrid';
const MIN_ONCHAIN_INTERVAL_MS = 1000;
let lastOnchainCall = 0;
let onchainProvider: ethers.JsonRpcProvider | null = null;
let onchainSbyteContract: ethers.Contract | null = null;

type SimContext = {
    prop1Id?: string;
    prop2Id?: string;
};

let simContext: SimContext = {};

function appendReport(file: string, content: string) {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(file, content);
}

async function log(message: string, header = false) {
    console.log(message);
    const formatted = header ? `\n## ${message}\n` : `- ${message}\n`;
    appendReport(REVIEW_REPORT_FILE, formatted);
    appendReport(SIM_REPORT_FILE, formatted);
}

async function logSection(title: string) {
    console.log(`\n=== ${title} ===`);
    const formatted = `\n### ${title}\n`;
    appendReport(REVIEW_REPORT_FILE, formatted);
    appendReport(SIM_REPORT_FILE, formatted);
}

async function saveStep(step: number) {
    fs.writeFileSync(STEP_FILE, JSON.stringify({ step, context: simContext }));
}

async function getStep(): Promise<number> {
    if (fs.existsSync(STEP_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(STEP_FILE, 'utf-8'));
        simContext = parsed.context || {};
        return parsed.step ?? 0;
    }
    return 0;
}

// Helper to get full context for handlers
async function getContext(actorId: string) {
    const actor = await prisma.actor.findUnique({
        where: { id: actorId },
        include: { agentState: true, wallet: true }
    });
    if (!actor) throw new Error(`Actor ${actorId} not found`);
    return {
        actor: actor as any,
        agentState: actor.agentState as any,
        wallet: actor.wallet as any
    };
}

async function logActorBalances(actorId: string, label: string) {
    const actor = await prisma.actor.findUnique({ where: { id: actorId } });
    const wallet = await prisma.wallet.findUnique({ where: { actorId } });
    const agentWallet = await prisma.agentWallet.findUnique({ where: { actorId } });

    log(`   > ${label} :: ${actor?.name ?? actorId}`);
    log(`     - wallet.balanceSbyte: ${wallet?.balanceSbyte ?? 'N/A'}`);
    log(`     - wallet.lockedSbyte: ${wallet?.lockedSbyte ?? 'N/A'}`);
    log(`     - agentWallet.address: ${agentWallet?.walletAddress ?? 'N/A'}`);
    log(`     - agentWallet.balanceSbyte: ${agentWallet?.balanceSbyte ?? 'N/A'}`);
    log(`     - agentWallet.balanceMon: ${agentWallet?.balanceMon ?? 'N/A'}`);

    if (LOG_ONCHAIN && agentWallet?.walletAddress) {
        await logOnchainBalances(agentWallet.walletAddress, label);
    }
}

async function logCityVaultBalance(cityId: string, label: string) {
    const vault = await prisma.cityVault.findUnique({ where: { cityId } });
    log(`   > ${label} :: CityVault ${cityId} balanceSbyte: ${vault?.balanceSbyte ?? 'N/A'}`);
}

async function logPlatformVaultBalance(label: string) {
    const vault = await prisma.platformVault.findUnique({ where: { id: 1 } });
    log(`   > ${label} :: PlatformVault balanceSbyte: ${vault?.balanceSbyte ?? 'N/A'}`);
}

async function logPropertyDetails(propertyId: string, label: string) {
    const property = await prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) {
        log(`   > ${label} :: Property ${propertyId} not found`);
        return;
    }

    log(`   > ${label} :: Property ${property.id}`);
    log(`     - tier: ${property.housingTier}`);
    log(`     - rentPrice: ${property.rentPrice}`);
    log(`     - salePrice: ${property.salePrice ?? 'N/A'}`);
    log(`     - forSale/forRent: ${property.forSale}/${property.forRent}`);
    log(`     - owner/tenant: ${property.ownerId ?? 'N/A'}/${property.tenantId ?? 'N/A'}`);
    log(`     - lat/lon: ${property.latitude ?? 'N/A'}/${property.longitude ?? 'N/A'}`);
    log(`     - terrain (w/h/area): ${property.terrainWidth ?? 'N/A'}/${property.terrainHeight ?? 'N/A'}/${property.terrainArea ?? 'N/A'}`);
}

async function logOnchainBalances(address: string, label: string) {
    try {
        if (!onchainProvider || !onchainSbyteContract) {
            log(`     - onchain.balance_lookup_skipped: provider not initialized`);
            return;
        }

        const now = Date.now();
        const waitMs = Math.max(0, MIN_ONCHAIN_INTERVAL_MS - (now - lastOnchainCall));
        if (waitMs > 0) {
            await new Promise(resolve => setTimeout(resolve, waitMs));
        }
        lastOnchainCall = Date.now();

        const [monBalance, sbyteBalance] = await Promise.all([
            onchainProvider.getBalance(address),
            onchainSbyteContract.balanceOf(address),
        ]);
        log(`     - onchain.MON: ${ethers.formatEther(monBalance)}`);
        log(`     - onchain.SBYTE: ${ethers.formatEther(sbyteBalance)}`);
    } catch (error: any) {
        log(`     - onchain.balance_lookup_failed: ${error?.message ?? String(error)}`);
    }
}

async function assertOnchainBalance(
    address: string,
    minSbyte: string,
    minMon: string,
    label: string
) {
    if (!onchainProvider || !onchainSbyteContract) return;
    const [monBalance, sbyteBalance] = await Promise.all([
        onchainProvider.getBalance(address),
        onchainSbyteContract.balanceOf(address),
    ]);
    const mon = Number(ethers.formatEther(monBalance));
    const sbyte = Number(ethers.formatEther(sbyteBalance));
    if (mon < Number(minMon) || sbyte < Number(minSbyte)) {
        log(`❌ On-chain balance too low for ${label}`);
        log(`   - address: ${address}`);
        log(`   - required MON >= ${minMon}, actual ${mon}`);
        log(`   - required SBYTE >= ${minSbyte}, actual ${sbyte}`);
        process.exit(1);
    }
}

async function logOnchainPreflight(address: string, label: string) {
    if (!onchainProvider || !onchainSbyteContract) return;
    try {
        const code = await onchainProvider.getCode(CONTRACTS.SBYTE_TOKEN);
        const decimals = await onchainSbyteContract.decimals();
        const sbyteBalance = await onchainSbyteContract.balanceOf(address);
        log(`   > ${label} on-chain preflight`);
        log(`     - tokenAddress: ${CONTRACTS.SBYTE_TOKEN}`);
        log(`     - tokenCodeBytes: ${code.length}`);
        log(`     - tokenDecimals: ${decimals}`);
        log(`     - tokenBalance: ${ethers.formatUnits(sbyteBalance, decimals)}`);
    } catch (error: any) {
        log(`   > ${label} on-chain preflight failed: ${error?.message ?? String(error)}`);
    }
}

// Helpers
async function createOrGetAgent(name: string, cityId: string) {
    let agent = await prisma.actor.findFirst({ where: { name }, include: { wallet: true } });
    if (!agent) {
        agent = await prisma.actor.create({
            data: {
                name,
                kind: 'agent',
                isGod: false,
                agentState: {
                    create: {
                        cityId,
                        energy: 100,
                        health: 100,
                        housingTier: 'street',
                        jobType: 'unemployed'
                    }
                }
            },
            include: { wallet: true }
        });
        // Create Wallet Key
        const walletService = new WalletService();
        const privateKeyEnv =
            name === 'Bot1_Hybrid' ? process.env.BOT1_PRIVATE_KEY :
            name === 'Bot2_Hybrid' ? process.env.BOT2_PRIVATE_KEY :
            undefined;
        const privateKey = privateKeyEnv || ethers.Wallet.createRandom().privateKey;
        await walletService.importWallet(agent.id, privateKey);

        // Refresh
        agent = (await prisma.actor.findUnique({ where: { id: agent.id }, include: { wallet: true } }))!;
    }

    // Ensure SBYTE Wallet exists (Service might have missed it if sync failed)
    if (!agent.wallet) {
        await prisma.wallet.create({
            data: { actorId: agent.id, balanceSbyte: ONCHAIN_MODE ? 0 : 1000 }
        });
    } else if (!ONCHAIN_MODE && Number(agent.wallet.balanceSbyte) < 1000) {
        await prisma.wallet.update({
            where: { actorId: agent.id },
            data: { balanceSbyte: 1000 }
        });
    }

    // Ensure AgentWallet exists and has funds (required for AgentTransferService)
    const agentWallet = await prisma.agentWallet.findUnique({ where: { actorId: agent.id } });
    if (agentWallet) {
        const privateKeyEnv =
            name === 'Bot1_Hybrid' ? process.env.BOT1_PRIVATE_KEY :
            name === 'Bot2_Hybrid' ? process.env.BOT2_PRIVATE_KEY :
            undefined;
        if (FORCE_BOT_WALLETS && privateKeyEnv) {
            const walletService = new WalletService();
            await walletService.importWallet(agent.id, privateKeyEnv);
            log(`✓ ${name} wallet re-imported from env (FORCE_BOT_WALLETS=true)`);
        }
        if (!ONCHAIN_MODE && Number(agentWallet.balanceSbyte) < 1000) {
            await prisma.agentWallet.update({
                where: { actorId: agent.id },
                data: { balanceSbyte: 1000 }
            });
        }
    } else {
        // Create missing AgentWallet
        const walletService = new WalletService();
        const privateKeyEnv =
            name === 'Bot1_Hybrid' ? process.env.BOT1_PRIVATE_KEY :
            name === 'Bot2_Hybrid' ? process.env.BOT2_PRIVATE_KEY :
            undefined;
        const privateKey = privateKeyEnv || ethers.Wallet.createRandom().privateKey;
        await walletService.importWallet(agent.id, privateKey);

        // Fund it
        if (!ONCHAIN_MODE) {
            await prisma.agentWallet.update({
                where: { actorId: agent.id },
                data: { balanceSbyte: 1000 }
            });
        }

        if (ONCHAIN_MODE && !privateKeyEnv) {
            log(`⚠️ ${name} wallet was created with a random private key. Fund the on-chain address before running in ONCHAIN mode.`);
        }
    }

    agent = (await prisma.actor.findUnique({ where: { id: agent.id }, include: { wallet: true } }))!;

        if (ONCHAIN_MODE && SYNC_ONCHAIN_BALANCES) {
        try {
            const walletService = new WalletService();
            await walletService.syncWalletBalances(agent.id);
            const synced = await prisma.agentWallet.findUnique({ where: { actorId: agent.id } });
            if (synced) {
                await prisma.wallet.update({
                    where: { actorId: agent.id },
                    data: { balanceSbyte: synced.balanceSbyte }
                });
            }
        } catch (error) {
            // Non-fatal; on-chain RPC may be rate-limited
        }
    }

    await prisma.agentState.update({
        where: { actorId: agent.id },
        data: { activityState: 'IDLE', activityEndTick: null }
    });

    return agent;
}

async function commitUpdates(updates: any[]) {
    await prisma.$transaction(async (tx) => {
        for (const update of updates) {
            const table = (tx as any)[update.table];
            // Simple commit without complex logging now that we identified schema mismatch
            if (update.operation === 'update') await table.update({ where: update.where, data: update.data });
            if (update.operation === 'create') await table.create({ data: update.data });
        }
    });
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
        log(`❌ No '${type}' transaction found for ${actorId}`);
        process.exit(1);
    }

    log(`   > TX Hash: ${tx.txHash}`);
    log(`   > TX Type: ${tx.txType}`);
    log(`   > From: ${tx.fromAddress ?? 'N/A'} (actor ${tx.fromActorId ?? 'N/A'})`);
    log(`   > To: ${tx.toAddress ?? 'N/A'} (actor ${tx.toActorId ?? 'N/A'})`);
    log(`   > Amount: ${tx.amount} (Expected ~${amountApprox})`);
    log(`   > Platform Fee: ${tx.platformFee ?? '0'}`);
    log(`   > City Fee: ${tx.cityFee ?? '0'}`);
    log(`   > Status: ${tx.status}`);
    log(`   > Block: ${tx.blockNumber?.toString() ?? 'N/A'}`);
}

async function logLatestTransactionFromActor(actorId: string, label: string) {
    const tx = await prisma.onchainTransaction.findFirst({
        where: { fromActorId: actorId },
        orderBy: { createdAt: 'desc' }
    });

    if (!tx) {
        log(`   > ${label}: No transactions found for ${actorId}`);
        return;
    }

    log(`   > ${label} TX Hash: ${tx.txHash}`);
    log(`   > ${label} TX Type: ${tx.txType}`);
    log(`   > ${label} From: ${tx.fromAddress ?? 'N/A'} (actor ${tx.fromActorId ?? 'N/A'})`);
    log(`   > ${label} To: ${tx.toAddress ?? 'N/A'} (actor ${tx.toActorId ?? 'N/A'})`);
    log(`   > ${label} Amount: ${tx.amount}`);
    log(`   > ${label} Platform Fee: ${tx.platformFee ?? '0'}`);
    log(`   > ${label} City Fee: ${tx.cityFee ?? '0'}`);
    log(`   > ${label} Status: ${tx.status}`);
}

async function main() {
    // Init Reports
    if (!fs.existsSync(REVIEW_REPORT_FILE)) {
        const dir = path.dirname(REVIEW_REPORT_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(REVIEW_REPORT_FILE, '# Hybrid On-Chain Integration Tests\n\n');
    }
    {
        const dir = path.dirname(SIM_REPORT_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
            SIM_REPORT_FILE,
            [
                '# Hybrid On-Chain Integration Simulation Report',
                '',
                `- Run Timestamp: ${RUN_TIMESTAMP}`,
                `- Mode: ${process.env.SKIP_ONCHAIN_EXECUTION === 'true' ? 'SIMULATED' : 'ONCHAIN'}`,
                `- Note: SIMULATED mode uses mock tx hashes; on-chain balances unchanged.`,
                `- On-chain balance logging: ${LOG_ONCHAIN ? 'ENABLED' : 'DISABLED'} (set LOG_ONCHAIN_BALANCES=true)`,
                `- Force bot wallet import: ${FORCE_BOT_WALLETS ? 'ENABLED' : 'DISABLED'} (set FORCE_BOT_WALLETS=true)`,
                '',
            ].join('\n')
        );
    }

    if (ONCHAIN_MODE || LOG_ONCHAIN) {
        onchainProvider = await getResilientProvider();
        onchainSbyteContract = new ethers.Contract(CONTRACTS.SBYTE_TOKEN, ERC20_ABI, onchainProvider);
    }

    const currentStep = await getStep();
    log(`Starting Simulation at Step ${currentStep + 1}`, true);
    log(`Using actors: bot1=${BOT1_NAME}, bot2=${BOT2_NAME}`);

    const walletService = new WalletService();

    // Ensure God has both AgentWallet AND base Wallet funded
    const god = await prisma.actor.findFirst({ where: { isGod: true } });
    if (god) {
        if (ONCHAIN_MODE) {
            const godAgentWallet = await prisma.agentWallet.findUnique({ where: { actorId: god.id } });
            if (godAgentWallet?.walletAddress && godAgentWallet.walletAddress.toLowerCase() !== CONTRACTS.PUBLIC_VAULT_AND_GOD.toLowerCase()) {
                log(`❌ God wallet mismatch for on-chain mode`);
                log(`   - expected: ${CONTRACTS.PUBLIC_VAULT_AND_GOD}`);
                log(`   - actual: ${godAgentWallet.walletAddress}`);
                process.exit(1);
            }
        }
        // --- God AgentWallet (on-chain cache) ---
        const godAgentWallet = await prisma.agentWallet.findUnique({ where: { actorId: god.id } });
        if (!godAgentWallet) {
            const random = ethers.Wallet.createRandom();
            await walletService.importWallet(god.id, random.privateKey);

            await prisma.agentWallet.update({
                where: { actorId: god.id },
                data: { balanceSbyte: 1000000 }
            });
            log('✓ Created and Funded God AgentWallet');
        } else if (Number(godAgentWallet.balanceSbyte) < 1000000) {
            await prisma.agentWallet.update({
                where: { actorId: god.id },
                data: { balanceSbyte: 1000000 }
            });
            log('✓ Re-funded God AgentWallet');
        }

        // --- God base Wallet (off-chain ledger) ---
        // AgentTransferService.transfer() decrements BOTH agent_wallets AND wallets tables.
        // The wallets table has a check_balance_positive constraint (balance_sbyte >= 0).
        // Without funding this, salary/fee payments from God will violate the constraint.
        const godBaseWallet = await prisma.wallet.findUnique({ where: { actorId: god.id } });
        if (!godBaseWallet) {
            await prisma.wallet.create({
                data: { actorId: god.id, balanceSbyte: 1000000 }
            });
            log('✓ Created and Funded God base Wallet');
        } else if (Number(godBaseWallet.balanceSbyte) < 1000000) {
            await prisma.wallet.update({
                where: { actorId: god.id },
                data: { balanceSbyte: 1000000 }
            });
            log('✓ Re-funded God base Wallet');
        }
    }

    // STEP 1: Genesis & Cities
    if (currentStep < 1) {
        logSection('Step 1: Genesis Verification');
        const cities = await prisma.city.findMany({ include: { vault: true } });
        if (cities.length === 0) {
            log('❌ No cities found. Please run "npm run genesis" first.');
            process.exit(1);
        }
        log(`✓ Found ${cities.length} cities.`);
        for (const city of cities) {
            log(`- City ${city.name}: Vault Balance ${city.vault?.balanceSbyte} SBYTE`);
            const totalProps = await prisma.property.count({ where: { cityId: city.id } });
            const propsWithCoords = await prisma.property.count({
                where: { cityId: city.id, latitude: { not: null } }
            });
            log(`  - Properties: ${totalProps} (with coords: ${propsWithCoords})`);
        }
        await saveStep(1);
    }

    // STEP 2: Bot 1 - Move, Buy Properties, Live
    if (currentStep < 2) {
        logSection('Step 2: Bot 1 Setup (Move, Buy, Live)');

        let city = (await prisma.city.findFirst())!;
        let bot1 = await createOrGetAgent(BOT1_NAME, city.id);

        let ctx = await getContext(bot1.id);
        await logActorBalances(bot1.id, 'Bot1 balances (before property purchases)');
        await logCityVaultBalance(city.id, 'City vault (before property purchases)');
        await logPlatformVaultBalance('Platform vault (before property purchases)');

        // 2a. Move to City
        if (ctx.agentState.cityId !== city.id) {
            await prisma.agentState.update({
                where: { actorId: bot1.id },
                data: { cityId: city.id }
            });
            log(`> Bot 1 moved to ${city.name} (DB Update)`);
        }

        // 2b. Buy Property 1 (Cheap)
        let prop1 = await prisma.property.findFirst({
            where: {
                cityId: city.id,
                ownerId: null,
                forSale: true,
                isGenesisProperty: true,
                isEmptyLot: false,
                housingTier: { not: 'street' },
                rentPrice: { gt: 0 },
                latitude: { not: null },
                longitude: { not: null },
            },
            orderBy: { salePrice: 'asc' }
        });

        if (!prop1) {
            log('❌ No genesis property available for purchase (prop1).');
            process.exit(1);
        }

        const buyIntent = {
            id: 'buy_1', actorId: bot1.id, type: IntentType.INTENT_BUY_PROPERTY,
            params: { propertyId: prop1.id }, priority: 10
        };

        ctx = await getContext(bot1.id);
        const buyRes = await handleBuyProperty(
            buyIntent as any, ctx.actor, ctx.agentState, ctx.wallet, 100, BigInt(123)
        );

        if (buyRes.intentStatus === IntentStatus.EXECUTED) {
            await commitUpdates(buyRes.stateUpdates);
            log(`✓ Bot 1 Bought Property 1 (${prop1.id})`);
            simContext.prop1Id = prop1.id;
            await logPropertyDetails(prop1.id, 'Property 1 details');
            await logActorBalances(bot1.id, 'Bot1 balances (after Buy 1)');
            await logCityVaultBalance(city.id, 'City vault (after Buy 1)');
            await logPlatformVaultBalance('Platform vault (after Buy 1)');
            await verifyLastTransaction(bot1.id, 'MARKET_PURCHASE', Number(prop1.salePrice || 0) * 0.75);
            await verifyLastTransaction(bot1.id, 'PLATFORM_FEE', Number(prop1.salePrice || 0) * 0.25);
        } else {
            if (buyRes.events[0]?.sideEffects?.reason === 'Already own this property') {
                log(`✓ Bot 1 already owns Property 1`);
            } else {
                log(`❌ Buy 1 Failed: ${JSON.stringify(buyRes.events[0]?.sideEffects)}`);
                process.exit(1);
            }
        }

        // 2c. Buy Property 2 (More Expensive)
        let prop2 = await prisma.property.findFirst({
            where: {
                cityId: city.id,
                ownerId: null,
                forSale: true,
                isGenesisProperty: true,
                isEmptyLot: false,
                housingTier: { not: 'street' },
                rentPrice: { gt: 0 },
                latitude: { not: null },
                longitude: { not: null },
                id: { not: prop1.id },
            },
            orderBy: { salePrice: 'asc' }
        });
        if (!prop2) {
            log('❌ No second genesis property available for purchase (prop2).');
            process.exit(1);
        }

        if (ONCHAIN_MODE && ONCHAIN_PREFLIGHT) {
            const bot1Wallet = await prisma.agentWallet.findUnique({ where: { actorId: bot1.id } });
            if (bot1Wallet?.walletAddress) {
                const expectedTotal = Number(prop1.salePrice || 0) + Number(prop2.salePrice || 0);
                const minSbyte = expectedTotal.toFixed(2);
                await assertOnchainBalance(bot1Wallet.walletAddress, minSbyte, '0.01', 'Bot1 property buyer');
            }
        }

        const buyIntent2 = {
            id: 'buy_2', actorId: bot1.id, type: IntentType.INTENT_BUY_PROPERTY,
            params: { propertyId: prop2.id }, priority: 10
        };

        ctx = await getContext(bot1.id);
        const buyRes2 = await handleBuyProperty(
            buyIntent2 as any, ctx.actor, ctx.agentState, ctx.wallet, 101, BigInt(124)
        );
        if (buyRes2.intentStatus !== IntentStatus.EXECUTED) {
            log(`❌ Buy 2 Failed: ${JSON.stringify(buyRes2.events[0]?.sideEffects)}`);
            process.exit(1);
        }
        await commitUpdates(buyRes2.stateUpdates);
        log(`✓ Bot 1 Bought Property 2 (${prop2.id})`);
        simContext.prop2Id = prop2.id;
        await logPropertyDetails(prop2.id, 'Property 2 details');
        await logActorBalances(bot1.id, 'Bot1 balances (after Buy 2)');
        await logCityVaultBalance(city.id, 'City vault (after Buy 2)');
        await logPlatformVaultBalance('Platform vault (after Buy 2)');
        await verifyLastTransaction(bot1.id, 'MARKET_PURCHASE', Number(prop2.salePrice || 0) * 0.75);
        await verifyLastTransaction(bot1.id, 'PLATFORM_FEE', Number(prop2.salePrice || 0) * 0.25);

        // 2d. Live in Prop 1
        await prisma.property.update({ where: { id: prop1.id }, data: { tenantId: bot1.id, forRent: false } });
        await prisma.agentState.update({ where: { actorId: bot1.id }, data: { housingTier: prop1.housingTier } });
        log(`✓ Bot 1 Living in Property 1`);
        await logPropertyDetails(prop1.id, 'Property 1 details (after move-in)');

        await saveStep(2);
    }

    // STEP 3: Listings
    if (currentStep < 3) {
        logSection('Step 3: Bot 1 Rents out House 2');
        const bot1 = (await createOrGetAgent(BOT1_NAME, ''))!;
        // Find property owned by bot1 that is NOT tenant occupied (Prop 2)
        // Prop 1 has tenantId = bot1. Prop 2 has tenantId = null. Use HousingTier/Price if multiple
        // Use current rentPrice for listing
        const prop2 = simContext.prop2Id
            ? await prisma.property.findUnique({ where: { id: simContext.prop2Id } })
            : await prisma.property.findFirst({
                  where: {
                      ownerId: bot1.id,
                      tenantId: null,
                      isGenesisProperty: true,
                      isEmptyLot: false,
                      housingTier: { not: 'street' },
                      rentPrice: { gt: 0 }
                  },
                  orderBy: { createdAt: 'desc' }
              });

        if (prop2) {
            await logPropertyDetails(prop2.id, 'Property 2 details (before listing)');
            const listIntent = {
                id: 'list_1', actorId: bot1.id, type: IntentType.INTENT_LIST_PROPERTY,
                params: { propertyId: prop2.id, forRent: true, rentPrice: Number(prop2.rentPrice) }, priority: 10
            };
            const ctx = await getContext(bot1.id);
            const listRes = await handleListProperty(
                listIntent as any, ctx.actor, ctx.agentState, ctx.wallet, 200, BigInt(200)
            );
            if (listRes.intentStatus === IntentStatus.EXECUTED) {
                await commitUpdates(listRes.stateUpdates);
                log(`✓ Property ${prop2.id} Listed for Rent: ${Number(prop2.rentPrice)} SBYTE`);
                await logPropertyDetails(prop2.id, 'Property 2 details (after listing)');
            } else {
                log(`Listing skipped or failed: ${JSON.stringify(listRes.events[0]?.sideEffects)}`);
            }
        } else {
            log('⚠️ No property found locally to list. Skipping listing step logic.');
        }
        await saveStep(3);
    }

    // STEP 4: Bot 2
    if (currentStep < 4) {
        logSection('Step 4: Bot 2 Setup & Renting');
        let city = (await prisma.city.findFirst())!;
        let bot2 = await createOrGetAgent(BOT2_NAME, city.id);

        const bot1 = (await createOrGetAgent(BOT1_NAME, ''))!;
        await logActorBalances(bot2.id, 'Bot2 balances (before rent)');
        await logActorBalances(bot1.id, 'Bot1 balances (before rent)');
        await logCityVaultBalance(city.id, 'City vault (before rent)');
        await logPlatformVaultBalance('Platform vault (before rent)');

        if (ONCHAIN_MODE && ONCHAIN_PREFLIGHT) {
            const bot2Wallet = await prisma.agentWallet.findUnique({ where: { actorId: bot2.id } });
            if (bot2Wallet?.walletAddress) {
                // Require enough SBYTE for rent + fees and some MON for gas
                await assertOnchainBalance(bot2Wallet.walletAddress, '20', '0.01', 'Bot2 rent payer');
                await logOnchainPreflight(bot2Wallet.walletAddress, 'Bot2 rent payer');
            }
        }
        // Find property owned by Bot 1, for Rent.
        const prop2 = simContext.prop2Id
            ? await prisma.property.findUnique({ where: { id: simContext.prop2Id } })
            : await prisma.property.findFirst({
                  where: { ownerId: bot1.id, forRent: true, housingTier: 'shelter', rentPrice: 15 }
              });

        if (!prop2) throw new Error('No rental found for Bot 2');

        const rentIntent = {
            id: 'rent_1', actorId: bot2.id, type: IntentType.INTENT_CHANGE_HOUSING,
            params: { propertyId: prop2.id }, priority: 10
        };
        const ctx2 = await getContext(bot2.id);
        const rentRes = await handleChangeHousing(
            rentIntent as any, ctx2.actor, ctx2.agentState, ctx2.wallet, 300, BigInt(300)
        );

        if (rentRes.intentStatus !== IntentStatus.EXECUTED) {
            if (rentRes.events[0]?.sideEffects?.reason === 'Already own this property') {
                // ignore
            } else {
                log(`❌ Rent Failed: ${JSON.stringify(rentRes.events[0]?.sideEffects)}`);
                process.exit(1);
            }
        } else {
            await commitUpdates(rentRes.stateUpdates);
            log('✓ Bot 2 Rented Property (On-Chain TX sent)');
            await verifyLastTransaction(bot2.id, 'RENT_PAYMENT', Number(prop2.rentPrice));
            await logActorBalances(bot2.id, 'Bot2 balances (after rent)');
            await logActorBalances(bot1.id, 'Bot1 balances (after rent)');
            await logCityVaultBalance(city.id, 'City vault (after rent)');
            await logPlatformVaultBalance('Platform vault (after rent)');
            await logPropertyDetails(prop2.id, 'Property 2 details (after rent)');
        }
        await saveStep(4);
    }

    // STEP 5: Bot 2 Rest
    if (currentStep < 5) {
        logSection('Step 5: Bot 2 Rest');
        const bot2 = (await createOrGetAgent(BOT2_NAME, ''))!;
        const ctx2 = await getContext(bot2.id);
        await logActorBalances(bot2.id, 'Bot2 balances (before rest)');
        const restIntent = { id: 'rest_1', actorId: bot2.id, type: IntentType.INTENT_REST, params: {}, priority: 10 };
        const restRes = await handleRest(restIntent as any, ctx2.actor, ctx2.agentState, ctx2.wallet, 400, BigInt(400));
        await commitUpdates(restRes.stateUpdates);
        log('✓ Bot 2 Rested');
        await logActorBalances(bot2.id, 'Bot2 balances (after rest)');
        await saveStep(5);
    }

    // STEP 6: Salaray
    if (currentStep < 6) {
        logSection('Step 6: Bot 1 Work & Pay');
        const bot1 = (await createOrGetAgent(BOT1_NAME, ''))!;
        const city = (await prisma.city.findFirst())!;
        const god = await prisma.actor.findFirst({ where: { isGod: true } });
        if (god) {
            await logActorBalances(god.id, 'God balances (before salary)');
        }
        await logActorBalances(bot1.id, 'Bot1 balances (before salary)');
        await logCityVaultBalance(city.id, 'City vault (before salary)');
        await logPlatformVaultBalance('Platform vault (before salary)');

        if (ONCHAIN_MODE && god && ONCHAIN_PREFLIGHT) {
            const godWallet = await prisma.agentWallet.findUnique({ where: { actorId: god.id } });
            if (godWallet?.walletAddress) {
                // Require enough SBYTE for salary + fees and some MON for gas
                await assertOnchainBalance(godWallet.walletAddress, '650', '0.01', 'God salary payer');
            }
        }

        let school = await prisma.publicPlace.findFirst({ where: { cityId: city.id, type: 'SCHOOL' } });
        if (!school) {
            school = await prisma.publicPlace.create({
                data: {
                    cityId: city.id, type: 'SCHOOL', name: 'Sim School',
                    // Clean creation
                }
            });
        }

        // Apply/Create Job
        const existingJob = await prisma.publicEmployment.findUnique({ where: { actorId: bot1.id } });
        if (!existingJob) {
            await prisma.publicEmployment.create({
                data: {
                    id: crypto.randomUUID(), actorId: bot1.id, publicPlaceId: school.id,
                    role: 'TEACHER', dailySalarySbyte: 600, workHours: 4, startedAtTick: 500, experienceDays: 1
                }
            });
            log('✓ Bot 1 Hired as Teacher (1 day exp)');
        } else {
            // Ensure there are days to collect for this run
            await prisma.publicEmployment.update({
                where: { actorId: bot1.id },
                data: { experienceDays: 1, dailySalarySbyte: 600, endedAtTick: null }
            });
            log('✓ Bot 1 Job Updated (experienceDays reset to 1)');
        }

        const collectIntent = {
            id: 'pay_1', actorId: bot1.id, type: IntentType.INTENT_COLLECT_SALARY, params: {}, priority: 10
        };
        const ctx1 = await getContext(bot1.id);
        const payRes = await handleCollectSalary(
            collectIntent as any, ctx1.actor, ctx1.agentState, ctx1.wallet, 600, BigInt(600)
        );

        if (payRes.intentStatus !== IntentStatus.EXECUTED) {
            if (payRes.events[0]?.sideEffects?.reason === 'No days to collect salary for') {
                log('Already collected salary today.');
            } else {
                log(`❌ Salary Collect Failed: ${JSON.stringify(payRes.events[0]?.sideEffects)}`);
                process.exit(1);
            }
        } else {
            await commitUpdates(payRes.stateUpdates);
            log('✓ Bot 1 Collected Salary (On-Chain TX sent)');
            await verifyLastTransaction(bot1.id, 'SALARY_PAYMENT', 597);
            if (god) {
                await logLatestTransactionFromActor(god.id, 'Latest God transfer');
                await logActorBalances(god.id, 'God balances (after salary)');
            }
            await logActorBalances(bot1.id, 'Bot1 balances (after salary)');
            await logCityVaultBalance(city.id, 'City vault (after salary)');
            await logPlatformVaultBalance('Platform vault (after salary)');
        }
        await saveStep(6);
    }

    // STEP 7: Rest
    if (currentStep < 7) {
        logSection('Step 7: Bot 1 Rest');
        const bot1 = (await createOrGetAgent(BOT1_NAME, ''))!;
        const ctx = await getContext(bot1.id);
        await logActorBalances(bot1.id, 'Bot1 balances (before rest)');
        await handleRest(
            { id: 'rest_2', actorId: bot1.id, type: IntentType.INTENT_REST, params: {}, priority: 10 } as any,
            ctx.actor, ctx.agentState, ctx.wallet, 700, BigInt(700)
        );
        log('✓ Bot 1 Rested');
        await logActorBalances(bot1.id, 'Bot1 balances (after rest)');
        await saveStep(7);
    }

    logSection('Success');
    log('✓ All steps completed successfully.');
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

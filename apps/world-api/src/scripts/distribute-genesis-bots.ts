/**
 * Distribute SBYTE and MON from God/Public Vault to genesis bots.
 * Also syncs bot wallet balances back into the game.
 */
import 'dotenv/config';
import { prisma, connectDB, disconnectDB } from '../db.js';
import { WalletService } from '../services/wallet.service.js';
import { CONTRACTS, ERC20_ABI } from '../config/contracts.js';
import { ethers } from 'ethers';
import fs from 'fs';
import { assertReceiptSuccess } from '../utils/onchain.js';

const BOT_NAMES = [
    'jaxel7',
    'nicoRiot',
    'maverik22',
    'slyroam',
    'kade89',
    'roninx',
    'briqz',
    'zanevolt',
    'tycho77',
    'reeko5',
    'daxterr',
    'kyren',
    'lumaFox',
    'orion54',
    'vexley',
    'drayke',
    'calyx9',
    'rivenx',
    'junoir',
    'marz10',
    'zephyrion',
    'tannerx',
    'kairo8',
    'bramwell',
    'lucan7',
    'myloz',
    'renzoid',
    'corvin',
    'elricx',
    'ziven',
] as const;

const BOT_SEED = process.env.GENESIS_BOT_SEED || 'soulbyte-genesis-bots-v1';
const BOT_WALLET_PATH = process.env.GENESIS_BOT_WALLET_PATH;
const TOTAL_SBYTE = process.env.GENESIS_BOT_DISTRIBUTE_SBYTE || '295000';
const TOTAL_MON = process.env.GENESIS_BOT_DISTRIBUTE_MON || '50';
const DRY_RUN = process.env.GENESIS_BOT_DRY_RUN === 'true';
const SKIP_SYNC = process.env.GENESIS_BOT_SKIP_SYNC === 'true';
const THROTTLE_MS = Number(process.env.GENESIS_BOT_THROTTLE_MS || '750');
const BALANCE_SOURCE = (process.env.GENESIS_BOT_BALANCE_SOURCE || 'db').toLowerCase();

function deriveBotWallet(name: string, seed: string): ethers.Wallet {
    const hash = ethers.keccak256(ethers.toUtf8Bytes(`${seed}:${name}`));
    return new ethers.Wallet(hash);
}

type WalletOverride = {
    name: string;
    privateKey?: string;
    address?: string;
};

function loadWalletOverrides(): Map<string, WalletOverride> {
    if (!BOT_WALLET_PATH) return new Map();
    const raw = fs.readFileSync(BOT_WALLET_PATH, 'utf8');
    const data = JSON.parse(raw);
    const list: WalletOverride[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.bots)
            ? data.bots
            : Object.entries(data || {}).map(([name, value]) => {
                if (typeof value === 'string') return { name, privateKey: value };
                return { name, ...(value as Record<string, unknown>) };
            });
    return new Map(list.map((entry) => [entry.name, entry]));
}

function buildSplitAmounts(total: bigint, count: number): bigint[] {
    const per = total / BigInt(count);
    const remainder = Number(total % BigInt(count));
    return Array.from({ length: count }, (_, i) => per + (i < remainder ? 1n : 0n));
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureGodWallet(ws: WalletService, godId: string): Promise<string> {
    const pk = process.env.GOD_WALLET_PRIVATE_KEY;
    if (!pk) {
        throw new Error('GOD_WALLET_PRIVATE_KEY not set');
    }

    const expected = CONTRACTS.PUBLIC_VAULT_AND_GOD.toLowerCase();
    const derived = new ethers.Wallet(pk).address.toLowerCase();
    if (derived !== expected) {
        throw new Error(`GOD_WALLET_PRIVATE_KEY does not match PUBLIC_VAULT_AND_GOD. Derived=${derived}, expected=${expected}`);
    }

    const existing = await prisma.agentWallet.findUnique({ where: { actorId: godId } });
    if (!existing) {
        await ws.importWallet(godId, pk);
    } else if (existing.walletAddress.toLowerCase() !== expected) {
        throw new Error(`God agent wallet mismatch. Found=${existing.walletAddress}, expected=${CONTRACTS.PUBLIC_VAULT_AND_GOD}`);
    }

    return expected;
}

async function main() {
    console.log('═══════════════════════════════════════════');
    console.log('     DISTRIBUTE GENESIS BOT FUNDS          ');
    console.log('═══════════════════════════════════════════');
    console.log(`Dry run: ${DRY_RUN}`);
    if (BOT_WALLET_PATH) {
        console.log(`Wallet override file: ${BOT_WALLET_PATH}`);
    }

    const totalBots = BOT_NAMES.length;
    const totalSbyteWei = ethers.parseUnits(TOTAL_SBYTE, 18);
    const totalMonWei = ethers.parseUnits(TOTAL_MON, 18);
    const sbyteSplit = buildSplitAmounts(totalSbyteWei, totalBots);
    const monSplit = buildSplitAmounts(totalMonWei, totalBots);

    console.log(`Bots: ${totalBots}`);
    console.log(`Total SBYTE: ${TOTAL_SBYTE} -> per bot ≈ ${ethers.formatUnits(sbyteSplit[0], 18)}`);
    console.log(`Total MON: ${TOTAL_MON} -> per bot ≈ ${ethers.formatUnits(monSplit[0], 18)}`);

    try {
        await connectDB();

        const god = await prisma.actor.findFirst({ where: { isGod: true } });
        if (!god) {
            throw new Error('God actor not found');
        }

        const ws = new WalletService();
        const godAddress = await ensureGodWallet(ws, god.id);
        const signer = await ws.getSignerWallet(god.id);
        const sbyteContract = new ethers.Contract(CONTRACTS.SBYTE_TOKEN, ERC20_ABI, signer);

        const bots = await prisma.actor.findMany({
            where: { name: { in: [...BOT_NAMES] } },
            include: { agentWallet: true, agentState: true },
        });
        const botByName = new Map(bots.map(bot => [bot.name, bot]));
        const walletOverrides = loadWalletOverrides();

        for (let i = 0; i < BOT_NAMES.length; i++) {
            const name = BOT_NAMES[i];
            const bot = botByName.get(name);
            if (!bot) {
                throw new Error(`Missing bot actor ${name}. Run genesis:bots first.`);
            }
            if (!bot.agentWallet) {
                throw new Error(`Missing agent wallet for ${name}. Run genesis:bots first.`);
            }

            const override = walletOverrides.get(name);
            const overrideWallet = override?.privateKey ? new ethers.Wallet(override.privateKey) : null;
            const expectedAddress = (override?.address ?? overrideWallet?.address ?? deriveBotWallet(name, BOT_SEED).address).toLowerCase();
            if (bot.agentWallet.walletAddress.toLowerCase() !== expectedAddress) {
                throw new Error(`Wallet mismatch for ${name}. DB=${bot.agentWallet.walletAddress}, expected=${expectedAddress}`);
            }

            const sbyteAmount = sbyteSplit[i];
            const monAmount = monSplit[i];

            console.log(`\n${name} -> ${bot.agentWallet.walletAddress}`);
            console.log(`  SBYTE: ${ethers.formatUnits(sbyteAmount, 18)}`);
            console.log(`  MON:   ${ethers.formatUnits(monAmount, 18)}`);

            if (DRY_RUN) {
                continue;
            }

            const marker = (bot.agentState?.markers as any) || {};
            const fundingMarker = marker.genesisBotFunding;
            let currentSbyte = ethers.parseUnits(String(bot.agentWallet.balanceSbyte ?? '0'), 18);
            let currentMon = ethers.parseUnits(String(bot.agentWallet.balanceMon ?? '0'), 18);
            if (BALANCE_SOURCE === 'onchain') {
                currentSbyte = await sbyteContract.balanceOf(bot.agentWallet.walletAddress);
                currentMon = await signer.provider.getBalance(bot.agentWallet.walletAddress);
                await sleep(THROTTLE_MS);
            }
            const hasSbyte = currentSbyte >= sbyteAmount;
            const hasMon = currentMon >= monAmount;

            if (fundingMarker?.status === 'complete') {
                console.log('  Funding marker present, skipping');
            } else {
                if (sbyteAmount > 0n && !hasSbyte) {
                    const delta = sbyteAmount - currentSbyte;
                    const tx = await sbyteContract.transfer(bot.agentWallet.walletAddress, delta);
                    console.log(`  SBYTE tx: ${tx.hash}`);
                    const receipt = await tx.wait();
                    assertReceiptSuccess(receipt, `sbyte:${name}`);
                    await sleep(THROTTLE_MS);
                } else if (sbyteAmount > 0n) {
                    console.log('  SBYTE: already funded (db), skipping');
                }

                if (monAmount > 0n && !hasMon) {
                    const delta = monAmount - currentMon;
                    const tx = await signer.sendTransaction({
                        to: bot.agentWallet.walletAddress,
                        value: delta,
                    });
                    console.log(`  MON tx:   ${tx.hash}`);
                    const receipt = await tx.wait();
                    assertReceiptSuccess(receipt, `mon:${name}`);
                    await sleep(THROTTLE_MS);
                } else if (monAmount > 0n) {
                    console.log('  MON: already funded (db), skipping');
                }
            }

            if (!SKIP_SYNC) {
                await ws.syncWalletBalances(bot.id);
                await sleep(THROTTLE_MS);
            }

            const updatedMarkers = {
                ...marker,
                genesisBotFunding: {
                    status: 'complete',
                    sbyteTarget: ethers.formatUnits(sbyteAmount, 18),
                    monTarget: ethers.formatUnits(monAmount, 18),
                    fundedAt: new Date().toISOString(),
                },
            };
            await prisma.agentState.update({
                where: { actorId: bot.id },
                data: { markers: updatedMarkers },
            });
        }

        if (!SKIP_SYNC) {
            await ws.syncWalletBalances(god.id);
        }

        console.log('\n═══════════════════════════════════════════');
        console.log('      BOT FUND DISTRIBUTION DONE           ');
        console.log('═══════════════════════════════════════════');
        console.log(`God/public vault: ${godAddress}`);
    } catch (error) {
        console.error('Bot fund distribution failed:', error);
        process.exit(1);
    } finally {
        await disconnectDB();
    }
}

main();

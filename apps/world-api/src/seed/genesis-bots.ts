/**
 * Genesis Bots Script - Seed deterministic bot agents per city
 * Separate from genesis:test and genesis:prod
 */
import 'dotenv/config';
import { prisma, connectDB, disconnectDB } from '../db.js';
import { WalletService } from '../services/wallet.service.js';
import { personaService } from '../engine/persona/persona.service.js';
import { ethers } from 'ethers';
import fs from 'fs';

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

const CITY_NAMES = ['Genesis City', 'Nova Haven', 'Iron Hold'] as const;
const BOTS_PER_CITY = 10;

const BOT_SEED = process.env.GENESIS_BOT_SEED || 'soulbyte-genesis-bots-v1';
const BOT_WALLET_PATH = process.env.GENESIS_BOT_WALLET_PATH;
const DRY_RUN = process.env.GENESIS_BOT_DRY_RUN === 'true';
const SKIP_WALLETS = process.env.GENESIS_BOT_SKIP_WALLETS === 'true';
const DEFAULT_BALANCE = Number(process.env.GENESIS_BOT_BALANCE || '0');
const DEFAULT_WEALTH_TIER = (process.env.GENESIS_BOT_WEALTH_TIER || 'W2') as any;
const DEFAULT_HOUSING_TIER = (process.env.GENESIS_BOT_HOUSING_TIER || 'street') as any;

type BotSeed = {
    name: string;
    cityName: string;
};

type WalletOverride = {
    name: string;
    privateKey?: string;
    address?: string;
};

function deriveBotWallet(name: string, seed: string): ethers.Wallet {
    const hash = ethers.keccak256(ethers.toUtf8Bytes(`${seed}:${name}`));
    return new ethers.Wallet(hash);
}

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

function buildBotSeeds(): BotSeed[] {
    const totalRequired = CITY_NAMES.length * BOTS_PER_CITY;
    if (BOT_NAMES.length !== totalRequired) {
        throw new Error(`Expected ${totalRequired} bot names, got ${BOT_NAMES.length}`);
    }

    return BOT_NAMES.map((name, index) => {
        const cityIndex = Math.floor(index / BOTS_PER_CITY);
        return {
            name,
            cityName: CITY_NAMES[cityIndex],
        };
    });
}

async function ensureAgentState(actorId: string, cityId: string) {
    await prisma.agentState.upsert({
        where: { actorId },
        create: {
            actorId,
            cityId,
            housingTier: DEFAULT_HOUSING_TIER,
            jobType: 'unemployed',
            wealthTier: DEFAULT_WEALTH_TIER,
            balanceSbyte: DEFAULT_BALANCE,
            reputationScore: 50,
            health: 100,
            energy: 100,
            hunger: 100,
            social: 50,
            fun: 50,
            purpose: 50,
            activityState: 'IDLE',
            publicExperience: 0,
            anger: 0,
            personality: {
                ambition: 50,
                riskTolerance: 50,
                sociability: 50,
                lawfulness: 50,
                vengefulness: 50,
            },
            emotions: {
                anger: 0,
                fear: 0,
                confidence: 0,
                desperation: 0,
                pride: 0,
                loneliness: 0,
            },
            markers: {},
            archetype: null,
        },
        update: {
            cityId,
        },
    });
}

async function ensureGameWallet(actorId: string) {
    await prisma.wallet.upsert({
        where: { actorId },
        create: {
            actorId,
            balanceSbyte: DEFAULT_BALANCE,
            lockedSbyte: 0,
        },
        update: {
            balanceSbyte: DEFAULT_BALANCE,
        },
    });
}

async function seedGenesisBots() {
    console.log('═══════════════════════════════════════════');
    console.log('          SOULBYTE GENESIS BOTS            ');
    console.log('═══════════════════════════════════════════');

    const botSeeds = buildBotSeeds();
    const walletOverrides = loadWalletOverrides();
    const seedFingerprint = ethers.keccak256(ethers.toUtf8Bytes(BOT_SEED)).slice(0, 12);
    console.log(`Seed fingerprint: ${seedFingerprint}`);
    if (BOT_WALLET_PATH) {
        console.log(`Wallet override file: ${BOT_WALLET_PATH}`);
    }
    console.log(`Dry run: ${DRY_RUN}`);

    try {
        if (!DRY_RUN) {
            await connectDB();
        }

        const cities = await prisma.city.findMany({
            where: { name: { in: [...CITY_NAMES] } },
        });
        const cityByName = new Map(cities.map(city => [city.name, city]));

        for (const cityName of CITY_NAMES) {
            if (!cityByName.has(cityName)) {
                throw new Error(`Missing city "${cityName}". Run genesis first.`);
            }
        }

        let walletService: WalletService | null = null;
        if (!DRY_RUN && !SKIP_WALLETS) {
            try {
                walletService = new WalletService();
            } catch (error) {
                console.warn('   ! WalletService init failed. Skipping on-chain wallet imports.');
            }
        }

        console.log('\nBot wallets:');
        for (const bot of botSeeds) {
            const override = walletOverrides.get(bot.name);
            const wallet = override?.privateKey
                ? new ethers.Wallet(override.privateKey)
                : deriveBotWallet(bot.name, BOT_SEED);
            console.log(`  • ${bot.name} (${bot.cityName}): ${wallet.address}`);

            if (DRY_RUN) {
                continue;
            }

            const cityId = cityByName.get(bot.cityName)!.id;
            let actor = await prisma.actor.findFirst({ where: { name: bot.name } });

            if (!actor) {
                actor = await prisma.actor.create({
                    data: {
                        kind: 'agent',
                        isGod: false,
                        name: bot.name,
                        frozen: false,
                        dead: false,
                        wallet: {
                            create: {
                                balanceSbyte: DEFAULT_BALANCE,
                                lockedSbyte: 0,
                            },
                        },
                        agentState: {
                            create: {
                                cityId,
                                housingTier: DEFAULT_HOUSING_TIER,
                                jobType: 'unemployed',
                                wealthTier: DEFAULT_WEALTH_TIER,
                                balanceSbyte: DEFAULT_BALANCE,
                                reputationScore: 50,
                                health: 100,
                                energy: 100,
                                hunger: 100,
                                social: 50,
                                fun: 50,
                                purpose: 50,
                                activityState: 'IDLE',
                                publicExperience: 0,
                                anger: 0,
                                personality: {
                                    ambition: 50,
                                    riskTolerance: 50,
                                    sociability: 50,
                                    lawfulness: 50,
                                    vengefulness: 50,
                                },
                                emotions: {
                                    anger: 0,
                                    fear: 0,
                                    confidence: 0,
                                    desperation: 0,
                                    pride: 0,
                                    loneliness: 0,
                                },
                                markers: {},
                                archetype: null,
                            },
                        },
                    },
                });
                await prisma.city.update({
                    where: { id: cityId },
                    data: { population: { increment: 1 } },
                });
            } else {
                await ensureAgentState(actor.id, cityId);
                await ensureGameWallet(actor.id);
            }

            await personaService.loadPersona(actor.id);

            if (walletService) {
                const existingWallet = await prisma.agentWallet.findUnique({ where: { actorId: actor.id } });
                if (!existingWallet) {
                    try {
                        if (!wallet.privateKey) {
                            throw new Error(`Missing private key for ${bot.name}. Provide GENESIS_BOT_WALLET_PATH with privateKey entries.`);
                        }
                        await walletService.importWallet(actor.id, wallet.privateKey);
                        await prisma.wallet.update({
                            where: { actorId: actor.id },
                            data: { balanceSbyte: DEFAULT_BALANCE },
                        });
                        await prisma.agentState.update({
                            where: { actorId: actor.id },
                            data: { balanceSbyte: DEFAULT_BALANCE },
                        });
                    } catch (error) {
                        console.error(`   ! Wallet import failed for ${bot.name}:`, error);
                    }
                } else {
                    const expectedAddress = override?.address ?? wallet.address;
                    if (existingWallet.walletAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
                        console.warn(`   ! Wallet mismatch for ${bot.name}: ${existingWallet.walletAddress} vs ${expectedAddress}`);
                    }
                }
            }
        }

        // Backfill city population based on agent state
        const populationByCity = await prisma.agentState.groupBy({
            by: ['cityId'],
            _count: { cityId: true },
            where: { cityId: { not: null } },
        });
        for (const entry of populationByCity) {
            if (!entry.cityId) continue;
            await prisma.city.update({
                where: { id: entry.cityId },
                data: { population: entry._count.cityId },
            });
        }

        console.log('\n═══════════════════════════════════════════');
        console.log('        GENESIS BOTS COMPLETE              ');
        console.log('═══════════════════════════════════════════');
    } catch (error) {
        console.error('Genesis bots failed:', error);
        process.exit(1);
    } finally {
        if (!DRY_RUN) {
            await disconnectDB();
        }
    }
}

seedGenesisBots();

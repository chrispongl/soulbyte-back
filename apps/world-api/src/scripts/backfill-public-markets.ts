import 'dotenv/config';
import { prisma, connectDB, disconnectDB } from '../db.js';
import { CONTRACTS } from '../config/contracts.js';
import crypto from 'crypto';

const PUBLIC_MARKET_NAME = (cityName: string) => `Public Market ${cityName}`;

async function ensurePublicMarketForCity(cityId: string, cityName: string, ownerId: string, foundedTick: number) {
    const marketName = PUBLIC_MARKET_NAME(cityName);
    const godWallet = await prisma.agentWallet.findUnique({ where: { actorId: ownerId } });
    if (!godWallet) {
        console.warn(`   ! Missing God wallet; public market will not have a business wallet in ${cityName}`);
    } else if (godWallet.walletAddress.toLowerCase() !== CONTRACTS.PUBLIC_VAULT_AND_GOD.toLowerCase()) {
        console.warn(`   ⚠️ God wallet mismatch for public market: config=${CONTRACTS.PUBLIC_VAULT_AND_GOD}, wallet=${godWallet.walletAddress}`);
    }

    const existingStores = await prisma.business.findMany({
        where: {
            cityId,
            businessType: 'STORE',
            ownerId
        }
    });
    const existing = existingStores.find((store) => {
        const config = (store.config ?? {}) as Record<string, unknown>;
        return store.name === marketName || config.publicMarket === true;
    });

    if (existing) {
        const config = (existing.config ?? {}) as Record<string, unknown>;
        const nextConfig = {
            ...config,
            publicMarket: true,
            noStatusEffects: true
        };
        const needsUpdate = existing.status !== 'ACTIVE' || !existing.isOpen
            || JSON.stringify(config) !== JSON.stringify(nextConfig);
        if (needsUpdate) {
            await prisma.business.update({
                where: { id: existing.id },
                data: {
                    name: marketName,
                    status: 'ACTIVE',
                    isOpen: true,
                    config: nextConfig
                }
            });
        }

        const existingWallet = await prisma.businessWallet.findUnique({
            where: { businessId: existing.id }
        });
        if (!existingWallet && godWallet) {
            await prisma.businessWallet.create({
                data: {
                    businessId: existing.id,
                    walletAddress: godWallet.walletAddress,
                    encryptedPk: godWallet.encryptedPk,
                    pkNonce: godWallet.pkNonce
                }
            });
        } else if (existingWallet && godWallet && existingWallet.walletAddress !== godWallet.walletAddress) {
            await prisma.businessWallet.update({
                where: { businessId: existing.id },
                data: {
                    walletAddress: godWallet.walletAddress,
                    encryptedPk: godWallet.encryptedPk,
                    pkNonce: godWallet.pkNonce
                }
            });
        }
        return;
    }

    const lot = await prisma.property.findFirst({
        where: { cityId, isEmptyLot: true },
        orderBy: { createdAt: 'asc' }
    });
    if (!lot) {
        console.warn(`   ! No empty lots available for Public Market in ${cityName}`);
        return;
    }

    const businessId = crypto.randomUUID();
    const config = { publicMarket: true, noStatusEffects: true };

    await prisma.$transaction([
        prisma.property.update({
            where: { id: lot.id },
            data: {
                ownerId,
                isEmptyLot: false,
                forSale: false,
                forRent: false
            }
        }),
        prisma.business.create({
            data: {
                id: businessId,
                name: marketName,
                businessType: 'STORE',
                businessSubtype: 'PUBLIC_MARKET',
                ownerId,
                cityId,
                landId: lot.id,
                reputation: 100,
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
                foundedTick,
                ownerLastWorkedTick: foundedTick,
                config
            }
        }),
        ...(godWallet
            ? [prisma.businessWallet.create({
                data: {
                    businessId,
                    walletAddress: godWallet.walletAddress,
                    encryptedPk: godWallet.encryptedPk,
                    pkNonce: godWallet.pkNonce
                }
            })]
            : [])
    ]);
}

async function run() {
    console.log('Backfilling public markets (one per city)...');
    try {
        await connectDB();
        const god = await prisma.actor.findFirst({ where: { isGod: true } });
        if (!god) {
            console.error('No God actor found. Aborting.');
            process.exit(1);
        }

        const worldState = await prisma.worldState.findFirst({ where: { id: 1 } });
        const foundedTick = Number(worldState?.tick ?? 0);
        const cities = await prisma.city.findMany();
        for (const city of cities) {
            console.log(` - ${city.name}`);
            await ensurePublicMarketForCity(city.id, city.name, god.id, foundedTick);
        }
    } catch (error) {
        console.error('Backfill failed:', error);
        process.exit(1);
    } finally {
        await disconnectDB();
    }
}

run();

import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import prismaPkg from '../../../../generated/prisma/index.js';
import { Decimal } from 'decimal.js';

const { PrismaClient } = prismaPkg;

const connectionString = process.env.DATABASE_URL || 'postgresql://soulbyte:soulbyte@localhost:5432/soulbyte';
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DEFAULT_ITEM_BASE_VALUE = new Decimal(10);

async function main() {
    const zeroListings = await prisma.marketListing.findMany({
        where: { priceEach: { lte: new Decimal(0) } },
        select: { id: true, sellerId: true, itemDefId: true, priceEach: true, status: true }
    });

    const zeroItems = await prisma.itemDefinition.findMany({
        where: { baseValue: { lte: new Decimal(0) } },
        select: { id: true, name: true, baseValue: true }
    });

    const storeBusinesses = await prisma.business.findMany({
        where: { businessType: 'STORE' },
        select: { id: true, name: true, config: true }
    });

    const storesWithBadMultiplier = storeBusinesses.filter((b) => {
        const multiplier = Number(b.config?.priceMultiplier ?? 1);
        return !Number.isFinite(multiplier) || multiplier <= 0;
    });

    console.log(`Zero-price listings: ${zeroListings.length}`);
    console.log(`Zero/negative item base values: ${zeroItems.length}`);
    console.log(`Store businesses with invalid priceMultiplier: ${storesWithBadMultiplier.length}`);

    if (zeroListings.length > 0) {
        const result = await prisma.marketListing.updateMany({
            where: { priceEach: { lte: new Decimal(0) } },
            data: { status: 'cancelled' }
        });
        console.log(`Cancelled ${result.count} zero-price listings.`);
    }

    if (zeroItems.length > 0) {
        let updated = 0;
        for (const item of zeroItems) {
            await prisma.itemDefinition.update({
                where: { id: item.id },
                data: { baseValue: DEFAULT_ITEM_BASE_VALUE }
            });
            updated += 1;
        }
        console.log(`Updated ${updated} item definitions with baseValue <= 0.`);
    }

    if (storesWithBadMultiplier.length > 0) {
        let updated = 0;
        for (const store of storesWithBadMultiplier) {
            const config = { ...(store.config ?? {}), priceMultiplier: 1 };
            await prisma.business.update({
                where: { id: store.id },
                data: { config }
            });
            updated += 1;
        }
        console.log(`Fixed ${updated} store priceMultipliers.`);
    }
}

main()
    .catch((error) => {
        console.error('Audit failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });

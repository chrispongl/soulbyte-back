import 'dotenv/config';
import { prisma } from '../db.js';

const DEFAULT_HOUSING_PRICE_MAP: Record<string, { rent: number; sale: number }> = {
    shelter: { rent: 15, sale: 5000 },
    slum_room: { rent: 40, sale: 12000 },
    apartment: { rent: 100, sale: 30000 },
    condo: { rent: 300, sale: 100000 },
    house: { rent: 1500, sale: 500000 },
    villa: { rent: 8000, sale: 3000000 },
    estate: { rent: 40000, sale: 15000000 },
    palace: { rent: 150000, sale: 60000000 },
    citadel: { rent: 500000, sale: 200000000 },
};

const DRY_RUN = process.env.DRY_RUN === 'true';
const TARGET_CITY_ID = process.env.CITY_ID || '';

async function logCitySummary(cityId: string) {
    const [total, emptyLots, built, cityOwnedBuilt, cityOwnedBuiltNoPrice, builtFlaggedAsEmpty] = await Promise.all([
        prisma.property.count({ where: { cityId } }),
        prisma.property.count({ where: { cityId, isEmptyLot: true } }),
        prisma.property.count({ where: { cityId, isEmptyLot: false } }),
        prisma.property.count({ where: { cityId, isEmptyLot: false, ownerId: null } }),
        prisma.property.count({
            where: {
                cityId,
                isEmptyLot: false,
                ownerId: null,
                OR: [{ rentPrice: 0 }, { salePrice: 0 }],
            },
        }),
        prisma.property.count({
            where: {
                cityId,
                isEmptyLot: true,
                housingTier: { not: 'street' },
            },
        }),
    ]);

    console.log(`City ${cityId}: total=${total}, emptyLots=${emptyLots}, built=${built}`);
    console.log(`City ${cityId}: cityOwnedBuilt=${cityOwnedBuilt}, cityOwnedBuiltNoPrice=${cityOwnedBuiltNoPrice}`);
    console.log(`City ${cityId}: builtFlaggedAsEmpty=${builtFlaggedAsEmpty}`);
}

async function fixCity(cityId: string) {
    await logCitySummary(cityId);

    if (DRY_RUN) {
        console.log('DRY_RUN enabled; no updates applied.');
        return;
    }

    const flagFix = await prisma.property.updateMany({
        where: {
            cityId,
            isEmptyLot: true,
            housingTier: { not: 'street' },
        },
        data: {
            isEmptyLot: false,
            lotType: null,
        },
    });
    console.log(`City ${cityId}: corrected empty-lot flag for ${flagFix.count} built rows.`);

    const availabilityFix = await prisma.property.updateMany({
        where: {
            cityId,
            isGenesisProperty: true,
            isEmptyLot: false,
            ownerId: null,
        },
        data: {
            forSale: true,
            forRent: true,
        },
    });
    console.log(`City ${cityId}: set forSale/forRent on ${availabilityFix.count} city-owned built rows.`);

    for (const [tier, pricing] of Object.entries(DEFAULT_HOUSING_PRICE_MAP)) {
        const priceFix = await prisma.property.updateMany({
            where: {
                cityId,
                isGenesisProperty: true,
                isEmptyLot: false,
                ownerId: null,
                housingTier: tier,
            },
            data: {
                rentPrice: pricing.rent,
                salePrice: pricing.sale,
            },
        });
        if (priceFix.count > 0) {
            console.log(`City ${cityId}: updated prices for ${priceFix.count} ${tier} homes.`);
        }
    }

    await logCitySummary(cityId);
}

async function main() {
    const cities = TARGET_CITY_ID
        ? [{ id: TARGET_CITY_ID }]
        : await prisma.city.findMany({ select: { id: true } });

    for (const city of cities) {
        await fixCity(city.id);
    }
}

main()
    .catch((error) => {
        console.error('Fix genesis housing failed:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

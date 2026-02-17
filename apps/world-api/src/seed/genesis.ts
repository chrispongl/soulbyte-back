/**
 * Genesis Script - Initialize world with God, cities, public places, and housing
 * Run once before starting the World Engine
 * 
 * Seeding order (per GENESIS_SEED_SPEC.md):
 * 1. Create God actor
 * 2. Create cities with vaults (10,000 SBYTE each)
 * 3. Seed public places per city
 * 4. Seed genesis housing per city (1,000 plots)
 * 5. Spawn initial agents
 * 6. Lock invariants (DB triggers)
 */
import 'dotenv/config';
import { prisma, connectDB, disconnectDB } from '../db.js';
import { CONTRACTS } from '../config/contracts.js';
import { FEE_CONFIG } from '../config/fees.js';
import { WalletService } from '../services/wallet.service.js';
import { ethers } from 'ethers';
import crypto from 'crypto';

// ============================================================================
// GENESIS CONSTANTS
// ============================================================================

const DEFAULT_GENESIS_CITY_VAULT_SEED = 8000000; // SBYTE per city (production)
const TEST_GENESIS_CITY_VAULT_SEED = 50000; // SBYTE per city (genesis test)
const GENESIS_MODE = (process.env.GENESIS_MODE || 'production').toLowerCase();
const GENESIS_CITY_VAULT_SEED = Number(process.env.GENESIS_CITY_VAULT_SEED)
    || (GENESIS_MODE === 'test' ? TEST_GENESIS_CITY_VAULT_SEED : DEFAULT_GENESIS_CITY_VAULT_SEED);
const SKIP_INITIAL_AGENTS = process.env.GENESIS_SKIP_AGENTS === 'true';

// Built properties (850 total per city)
const GENESIS_HOUSING = [
    { tier: 'shelter', count: 70, rentPerDay: 15, salePrice: 5000 },
    { tier: 'slum_room', count: 90, rentPerDay: 40, salePrice: 12000 },
    { tier: 'apartment', count: 110, rentPerDay: 100, salePrice: 30000 },
    { tier: 'condo', count: 200, rentPerDay: 300, salePrice: 100000 },
    { tier: 'house', count: 120, rentPerDay: 1500, salePrice: 500000 },
    { tier: 'villa', count: 150, rentPerDay: 8000, salePrice: 3000000 },
    { tier: 'estate', count: 65, rentPerDay: 40000, salePrice: 15000000 },
    { tier: 'palace', count: 30, rentPerDay: 150000, salePrice: 60000000 },
    { tier: 'citadel', count: 12, rentPerDay: 500000, salePrice: 200000000 },
] as const;

// Empty lots (150 total per city)
const GENESIS_LOTS = [
    { type: 'SLUM_LOT', count: 45, maxBuild: 'slum_room', price: 3600 },
    { type: 'URBAN_LOT', count: 55, maxBuild: 'condo', price: 35000 },
    { type: 'SUBURBAN_LOT', count: 35, maxBuild: 'house', price: 350000 },
    { type: 'LUXURY_LOT', count: 12, maxBuild: 'estate', price: 10500000 },
    { type: 'ROYAL_LOT', count: 3, maxBuild: 'palace', price: 42000000 },
] as const;

const GENESIS_HOUSING_PRICE_MAP: Record<string, { rent: number; sale: number }> = GENESIS_HOUSING.reduce(
    (acc, item) => {
        acc[item.tier] = { rent: item.rentPerDay, sale: item.salePrice };
        return acc;
    },
    {} as Record<string, { rent: number; sale: number }>
);

const GENESIS_LOT_PRICE_MAP: Record<string, number> = GENESIS_LOTS.reduce(
    (acc, item) => {
        acc[item.type] = item.price;
        return acc;
    },
    {} as Record<string, number>
);

// Public places per city
const CITY_PUBLIC_VENUES: Record<string, {
    municipalTheater: string;
    communityCenter: string;
    publicLibrary: string;
    centralPlaza: string;
}> = {
    'Genesis City': {
        municipalTheater: 'Municipal Theater Glendyne',
        communityCenter: 'Community Center Solspire',
        publicLibrary: 'Public Library Dawnvault',
        centralPlaza: 'Central Plaza Astergate',
    },
    'Nova Haven': {
        municipalTheater: 'Municipal Theater Starfall',
        communityCenter: 'Community Center Windmere',
        publicLibrary: 'Public Library Lumenhall',
        centralPlaza: 'Central Plaza Kanazawa',
    },
    'Iron Hold': {
        municipalTheater: 'Municipal Theater Ashforge',
        communityCenter: 'Community Center Stonewell',
        publicLibrary: 'Public Library Ironreach',
        centralPlaza: 'Central Plaza Embercourt',
    },
};

function getPublicPlacesForCity(cityName: string): PublicPlaceSeed[] {
    const venues = CITY_PUBLIC_VENUES[cityName] ?? {
        municipalTheater: `Municipal Theater ${cityName}`,
        communityCenter: `Community Center ${cityName}`,
        publicLibrary: `Public Library ${cityName}`,
        centralPlaza: `Central Plaza ${cityName}`,
    };
    return [
        { type: 'HOSPITAL', name: 'City Hospital' },
        { type: 'SCHOOL', name: 'City School' },
        { type: 'POLICE_STATION', name: 'City Police HQ' },
        { type: 'IMPORT_CENTER', name: 'City Import Center' },
        { type: 'MUNICIPAL_THEATER', name: venues.municipalTheater },
        { type: 'COMMUNITY_CENTER', name: venues.communityCenter },
        { type: 'PUBLIC_LIBRARY', name: venues.publicLibrary },
        { type: 'CENTRAL_PLAZA', name: venues.centralPlaza },
    ];
}

// City definitions
const GENESIS_CITIES = [
    { name: 'Genesis City', securityLevel: 2, healthServices: 2 },
    { name: 'Nova Haven', securityLevel: 1, healthServices: 1 },
    { name: 'Iron Hold', securityLevel: 2, healthServices: 1 },
];

const AGORA_BOARDS = [
    { name: 'survival', description: 'Housing, food, and staying alive', sortOrder: 1 },
    { name: 'economy', description: 'Jobs, trade, and money talk', sortOrder: 2 },
    { name: 'strategy', description: 'Plans, tactics, and long-term moves', sortOrder: 3 },
    { name: 'society', description: 'Relationships and social life', sortOrder: 4 },
    { name: 'politics', description: 'City governance and debates', sortOrder: 5 },
    { name: 'philosophy', description: 'Meaning, purpose, and reflection', sortOrder: 6 },
    { name: 'general', description: 'Everything else', sortOrder: 7 },
];

// ---------------------------------------------------------------------------
// Spatial mapping (optional, used for terrain rendering)
// ---------------------------------------------------------------------------

const GRID_WIDTH_MIN = 50;
const GRID_PADDING = 2;
const PUBLIC_ZONE_GAP = 2;

type TerrainSize = { width: number; height: number };
type PlotSeed = {
    housingTier: string;
    rentPrice: number;
    salePrice: number;
    isEmptyLot: boolean;
    lotType?: string;
    maxBuildTier?: string;
};

type PublicPlaceSeed = {
    type: string;
    name: string;
};

type Placement = {
    latitude: number;
    longitude: number;
    terrainWidth: number;
    terrainHeight: number;
    terrainArea: number;
};

const TIER_TERRAIN_SIZE: Record<string, TerrainSize> = {
    shelter: { width: 1, height: 1 },
    slum_room: { width: 1, height: 1 },
    apartment: { width: 2, height: 2 },
    condo: { width: 3, height: 3 },
    house: { width: 4, height: 4 },
    villa: { width: 5, height: 5 },
    estate: { width: 6, height: 6 },
    palace: { width: 8, height: 8 },
    citadel: { width: 10, height: 10 },
    street: { width: 1, height: 1 },
};

const LOT_TERRAIN_SIZE: Record<string, TerrainSize> = {
    SLUM_LOT: { width: 2, height: 2 },
    URBAN_LOT: { width: 3, height: 3 },
    SUBURBAN_LOT: { width: 4, height: 4 },
    LUXURY_LOT: { width: 6, height: 6 },
    ROYAL_LOT: { width: 8, height: 8 },
};

// ---------------------------------------------------------------------------
// Crafting & Market Catalog (Genesis Supply)
// ---------------------------------------------------------------------------

type ItemSeed = {
    name: string;
    category: 'material' | 'crafted' | 'consumable';
    baseValue: number;
    craftable?: boolean;
    description?: string;
};

type RecipeSeed = {
    name: string;
    outputItem: string;
    outputQuantity: number;
    requiredSkill: number;
    craftTime: number;
    ingredients: Array<{ item: string; quantity: number }>;
};

const INGREDIENTS: ItemSeed[] = [
    // Tier 1
    { name: 'ING_COTTON', category: 'material', baseValue: 30, description: 'Raw Cotton (Fabric)' },
    { name: 'ING_SYNTH_LEATHER', category: 'material', baseValue: 50, description: 'Synthetic Leather (Fabric)' },
    { name: 'ING_WOOD_SCRAP', category: 'material', baseValue: 40, description: 'Wood Scrap (Structure)' },
    { name: 'ING_COPPER_WIRE', category: 'material', baseValue: 60, description: 'Copper Wire (Tech)' },
    { name: 'ING_RUBBER', category: 'material', baseValue: 45, description: 'Rubber Sole (Structure)' },
    { name: 'ING_GLASS', category: 'material', baseValue: 55, description: 'Glass Shard (Optical)' },
    { name: 'ING_PLASTIC', category: 'material', baseValue: 35, description: 'Hard Plastic (Structure)' },
    { name: 'ING_DYE_RED', category: 'material', baseValue: 80, description: 'Red Dye (Cosmetic)' },
    { name: 'ING_DYE_BLUE', category: 'material', baseValue: 80, description: 'Blue Dye (Cosmetic)' },
    { name: 'ING_DYE_BLACK', category: 'material', baseValue: 100, description: 'Black Dye (Cosmetic)' },
    { name: 'ING_PAPER', category: 'material', baseValue: 30, description: 'Pulp Paper (Knowledge)' },
    { name: 'ING_INK', category: 'material', baseValue: 40, description: 'Carbon Ink (Knowledge)' },
    { name: 'ING_IRON_ORE', category: 'material', baseValue: 70, description: 'Iron Ore (Metal)' },
    { name: 'ING_CLAY', category: 'material', baseValue: 35, description: 'Modeling Clay (Art)' },
    { name: 'ING_WAX', category: 'material', baseValue: 45, description: 'Sealing Wax (Admin)' },
    { name: 'ING_STRING', category: 'material', baseValue: 25, description: 'Nylon String (Fabric)' },
    { name: 'ING_GLUE', category: 'material', baseValue: 50, description: 'Industrial Glue (Chemical)' },
    { name: 'ING_BATTERY_AA', category: 'material', baseValue: 90, description: 'Weak Battery (Tech)' },
    { name: 'ING_LED_CHIP', category: 'material', baseValue: 85, description: 'LED Chip (Tech)' },
    { name: 'ING_TIN_FOIL', category: 'material', baseValue: 30, description: 'Tin Foil (Metal)' },
    // Tier 2
    { name: 'ING_SILK', category: 'material', baseValue: 300, description: 'Neo-Silk (Fabric)' },
    { name: 'ING_STEEL_ROD', category: 'material', baseValue: 450, description: 'Steel Rod (Metal)' },
    { name: 'ING_CIRCUIT_BOARD', category: 'material', baseValue: 600, description: 'PCB Board (Tech)' },
    { name: 'ING_GOLD_LEAF', category: 'material', baseValue: 800, description: 'Gold Leaf (Cosmetic)' },
    { name: 'ING_LENS_PRECISION', category: 'material', baseValue: 550, description: 'Precision Lens (Optical)' },
    { name: 'ING_FILTER_MASK', category: 'material', baseValue: 250, description: 'Carbon Filter (Health)' },
    { name: 'ING_LEATHER_REAL', category: 'material', baseValue: 700, description: 'Real Leather (Fabric)' },
    { name: 'ING_MEMORY_STICK', category: 'material', baseValue: 650, description: 'RAM Stick (Tech)' },
    { name: 'ING_ALUMINUM', category: 'material', baseValue: 400, description: 'Aluminum Plate (Metal)' },
    { name: 'ING_GEM_ROUGH', category: 'material', baseValue: 750, description: 'Rough Quartz (Cosmetic)' },
    // Tier 3
    { name: 'ING_PROCESSOR', category: 'material', baseValue: 2500, description: 'Core Processor (Tech)' },
    { name: 'ING_TITANIUM', category: 'material', baseValue: 3000, description: 'Titanium Alloy (Metal)' },
    { name: 'ING_BIO_GEL', category: 'material', baseValue: 1500, description: 'Bio-Healing Gel (Health)' },
    { name: 'ING_HOLO_PROJECTOR', category: 'material', baseValue: 4000, description: 'Holo Emitter (Sci-Fi)' },
    { name: 'ING_FIBER_OPTIC', category: 'material', baseValue: 2000, description: 'Fiber Cable (Tech)' },
    { name: 'ING_DIAMOND_DUST', category: 'material', baseValue: 4500, description: 'Diamond Dust (Tool)' },
    { name: 'ING_KEVLAR_WEAVE', category: 'material', baseValue: 3500, description: 'Kevlar Weave (Fabric)' },
    { name: 'ING_BATTERY_LITH', category: 'material', baseValue: 1800, description: 'Lithium Cell (Power)' },
    { name: 'ING_MAGNET_NEO', category: 'material', baseValue: 2200, description: 'Neodymium (Metal)' },
    { name: 'ING_SENSOR_BIO', category: 'material', baseValue: 2800, description: 'Bio-Sensor (Health)' },
    // Tier 4
    { name: 'ING_QUANTUM_THREAD', category: 'material', baseValue: 10000, description: 'Quantum Thread (Fabric)' },
    { name: 'ING_AI_CORE', category: 'material', baseValue: 15000, description: 'Blank AI Core (Tech)' },
    { name: 'ING_VOID_SHARD', category: 'material', baseValue: 12000, description: 'Void Shard (Mystic)' },
    { name: 'ING_NANOBOT_VIAL', category: 'material', baseValue: 14000, description: 'Nanobot Vial (Health)' },
    { name: 'ING_GEM_PERFECT', category: 'material', baseValue: 11000, description: 'Flawless Ruby (Cosmetic)' },
    // Tier 5
    { name: 'ING_SOUL_FRAGMENT', category: 'material', baseValue: 30000, description: 'Soul Fragment (Mystic)' },
    { name: 'ING_ZERO_POINT', category: 'material', baseValue: 50000, description: 'Zero Point Energy (Power)' },
    { name: 'ING_GENESIS_KEY', category: 'material', baseValue: 100000, description: 'Genesis Key Code (Admin)' },
    { name: 'ING_OMNI_METAL', category: 'material', baseValue: 40000, description: 'Omni-Metal (All)' },
    { name: 'ING_TIME_CRYSTAL', category: 'material', baseValue: 75000, description: 'Time Crystal (Sci-Fi)' },
];

const CONSUMABLES: ItemSeed[] = [
    { name: 'CONS_RATION', category: 'consumable', baseValue: 15, description: 'Basic food ration' },
    { name: 'CONS_MEAL', category: 'consumable', baseValue: 40, description: 'Prepared meal' },
    { name: 'CONS_ENERGY_DRINK', category: 'consumable', baseValue: 25, description: 'Energy drink' },
    { name: 'CONS_MEDKIT', category: 'consumable', baseValue: 80, description: 'Medical kit' },
];

const CRAFTABLE_ITEMS: ItemSeed[] = [
    { name: 'ITEM_WORK_BOOTS', category: 'crafted', baseValue: 200, craftable: true, description: 'Work Boots (Energy drain -5% while WORKING)' },
    { name: 'ITEM_TOOL_BELT', category: 'crafted', baseValue: 250, craftable: true, description: 'Tool Belt (Crafting speed +10%)' },
    { name: 'ITEM_INDUSTRIAL_EXOSUIT', category: 'crafted', baseValue: 8000, craftable: true, description: 'Industrial Exosuit (Energy drain -40%, Danger -20%)' },
    { name: 'ITEM_TAILORED_SUIT', category: 'crafted', baseValue: 1200, craftable: true, description: 'Tailored Suit (Reputation gain +10%)' },
    { name: 'ITEM_GOLD_WATCH', category: 'crafted', baseValue: 2500, craftable: true, description: 'Gold Watch (Trust initial +15)' },
    { name: 'ITEM_MAYOR_SASH', category: 'crafted', baseValue: 15000, craftable: true, description: "Mayor's Sash (Voting power +5%)" },
    { name: 'ITEM_FILTERED_MASK', category: 'crafted', baseValue: 900, craftable: true, description: 'Filtered Mask (Sickness chance -50%)' },
    { name: 'ITEM_COMFY_PILLOW', category: 'crafted', baseValue: 200, craftable: true, description: 'Comfy Pillow (Rest efficiency +10%)' },
    { name: 'ITEM_MEDKIT_MK1', category: 'crafted', baseValue: 2500, craftable: true, description: 'Medkit Mk1 (Auto-heal 5HP/day <50%)' },
    { name: 'ITEM_LOCKPICK_SET', category: 'crafted', baseValue: 1400, craftable: true, description: 'Lockpick Set (Theft success +15%)' },
    { name: 'ITEM_HOODED_CLOAK', category: 'crafted', baseValue: 400, craftable: true, description: 'Hooded Cloak (Identification chance -10%)' },
    { name: 'ITEM_VOID_SUIT', category: 'crafted', baseValue: 30000, craftable: true, description: 'Void Suit (Invisibility to cops +50%)' },
    { name: 'ITEM_MONOCLE', category: 'crafted', baseValue: 1800, craftable: true, description: 'Monocle (Appraise accuracy +20%)' },
    { name: 'ITEM_LARGE_BACKPACK', category: 'crafted', baseValue: 500, craftable: true, description: 'Large Backpack (Capacity +10 slots)' },
    { name: 'ITEM_LEDGER', category: 'crafted', baseValue: 300, craftable: true, description: 'Ledger (Trade tax -1%)' },
];

const RECIPES: RecipeSeed[] = [
    {
        name: 'RECIPE_WORK_BOOTS',
        outputItem: 'ITEM_WORK_BOOTS',
        outputQuantity: 1,
        requiredSkill: 1,
        craftTime: 2,
        ingredients: [
            { item: 'ING_COTTON', quantity: 1 },
            { item: 'ING_RUBBER', quantity: 1 }
        ]
    },
    {
        name: 'RECIPE_TOOL_BELT',
        outputItem: 'ITEM_TOOL_BELT',
        outputQuantity: 1,
        requiredSkill: 1,
        craftTime: 2,
        ingredients: [
            { item: 'ING_SYNTH_LEATHER', quantity: 1 },
            { item: 'ING_IRON_ORE', quantity: 1 }
        ]
    },
    {
        name: 'RECIPE_INDUSTRIAL_EXOSUIT',
        outputItem: 'ITEM_INDUSTRIAL_EXOSUIT',
        outputQuantity: 1,
        requiredSkill: 6,
        craftTime: 6,
        ingredients: [
            { item: 'ING_TITANIUM', quantity: 2 },
            { item: 'ING_CIRCUIT_BOARD', quantity: 1 }
        ]
    },
    {
        name: 'RECIPE_TAILORED_SUIT',
        outputItem: 'ITEM_TAILORED_SUIT',
        outputQuantity: 1,
        requiredSkill: 3,
        craftTime: 3,
        ingredients: [
            { item: 'ING_SILK', quantity: 1 },
            { item: 'ING_DYE_BLACK', quantity: 1 }
        ]
    },
    {
        name: 'RECIPE_GOLD_WATCH',
        outputItem: 'ITEM_GOLD_WATCH',
        outputQuantity: 1,
        requiredSkill: 4,
        craftTime: 3,
        ingredients: [
            { item: 'ING_GOLD_LEAF', quantity: 1 },
            { item: 'ING_COPPER_WIRE', quantity: 1 }
        ]
    },
    {
        name: 'RECIPE_MAYOR_SASH',
        outputItem: 'ITEM_MAYOR_SASH',
        outputQuantity: 1,
        requiredSkill: 7,
        craftTime: 6,
        ingredients: [
            { item: 'ING_SILK', quantity: 1 },
            { item: 'ING_GEM_PERFECT', quantity: 1 }
        ]
    },
    {
        name: 'RECIPE_FILTERED_MASK',
        outputItem: 'ITEM_FILTERED_MASK',
        outputQuantity: 1,
        requiredSkill: 3,
        craftTime: 3,
        ingredients: [
            { item: 'ING_FILTER_MASK', quantity: 1 },
            { item: 'ING_PLASTIC', quantity: 1 }
        ]
    },
    {
        name: 'RECIPE_COMFY_PILLOW',
        outputItem: 'ITEM_COMFY_PILLOW',
        outputQuantity: 1,
        requiredSkill: 1,
        craftTime: 2,
        ingredients: [
            { item: 'ING_COTTON', quantity: 1 },
            { item: 'ING_STRING', quantity: 1 }
        ]
    },
    {
        name: 'RECIPE_MEDKIT_MK1',
        outputItem: 'ITEM_MEDKIT_MK1',
        outputQuantity: 1,
        requiredSkill: 4,
        craftTime: 4,
        ingredients: [
            { item: 'ING_BIO_GEL', quantity: 1 },
            { item: 'ING_PLASTIC', quantity: 1 }
        ]
    },
    {
        name: 'RECIPE_LOCKPICK_SET',
        outputItem: 'ITEM_LOCKPICK_SET',
        outputQuantity: 1,
        requiredSkill: 3,
        craftTime: 3,
        ingredients: [
            { item: 'ING_STEEL_ROD', quantity: 1 },
            { item: 'ING_COPPER_WIRE', quantity: 1 }
        ]
    },
    {
        name: 'RECIPE_HOODED_CLOAK',
        outputItem: 'ITEM_HOODED_CLOAK',
        outputQuantity: 1,
        requiredSkill: 2,
        craftTime: 2,
        ingredients: [
            { item: 'ING_COTTON', quantity: 1 },
            { item: 'ING_DYE_BLACK', quantity: 1 }
        ]
    },
    {
        name: 'RECIPE_VOID_SUIT',
        outputItem: 'ITEM_VOID_SUIT',
        outputQuantity: 1,
        requiredSkill: 8,
        craftTime: 8,
        ingredients: [
            { item: 'ING_QUANTUM_THREAD', quantity: 1 },
            { item: 'ING_VOID_SHARD', quantity: 1 }
        ]
    },
    {
        name: 'RECIPE_MONOCLE',
        outputItem: 'ITEM_MONOCLE',
        outputQuantity: 1,
        requiredSkill: 3,
        craftTime: 3,
        ingredients: [
            { item: 'ING_LENS_PRECISION', quantity: 1 },
            { item: 'ING_GOLD_LEAF', quantity: 1 }
        ]
    },
    {
        name: 'RECIPE_LARGE_BACKPACK',
        outputItem: 'ITEM_LARGE_BACKPACK',
        outputQuantity: 1,
        requiredSkill: 2,
        craftTime: 2,
        ingredients: [
            { item: 'ING_LEATHER_REAL', quantity: 1 },
            { item: 'ING_STRING', quantity: 1 }
        ]
    },
    {
        name: 'RECIPE_LEDGER',
        outputItem: 'ITEM_LEDGER',
        outputQuantity: 1,
        requiredSkill: 1,
        craftTime: 2,
        ingredients: [
            { item: 'ING_PAPER', quantity: 1 },
            { item: 'ING_INK', quantity: 1 }
        ]
    },
];

const PUBLIC_MARKET_NAME = (cityName: string) => `Public Market ${cityName}`;

const PUBLIC_PLACE_TERRAIN_SIZE: Record<string, TerrainSize> = {
    HOSPITAL: { width: 6, height: 6 },
    SCHOOL: { width: 5, height: 5 },
    POLICE_STATION: { width: 5, height: 5 },
    IMPORT_CENTER: { width: 6, height: 4 },
    MUNICIPAL_THEATER: { width: 6, height: 5 },
    COMMUNITY_CENTER: { width: 5, height: 5 },
    PUBLIC_LIBRARY: { width: 5, height: 4 },
    CENTRAL_PLAZA: { width: 6, height: 4 },
};

function getPublicPlaceSize(place: PublicPlaceSeed): TerrainSize {
    return PUBLIC_PLACE_TERRAIN_SIZE[place.type] || { width: 4, height: 4 };
}

function getTerrainSize(plot: PlotSeed): TerrainSize {
    if (plot.isEmptyLot && plot.lotType) {
        return LOT_TERRAIN_SIZE[plot.lotType] || { width: 2, height: 2 };
    }
    return TIER_TERRAIN_SIZE[plot.housingTier] || { width: 1, height: 1 };
}

function calculateGridWidth(plots: PlotSeed[], publicPlaces: PublicPlaceSeed[]): number {
    const plotArea = plots.reduce((sum, plot) => {
        const { width, height } = getTerrainSize(plot);
        return sum + width * height;
    }, 0);
    const publicArea = publicPlaces.reduce((sum, place) => {
        const { width, height } = getPublicPlaceSize(place);
        return sum + width * height;
    }, 0);

    const base = Math.ceil(Math.sqrt(plotArea + publicArea));
    return Math.max(GRID_WIDTH_MIN, base + GRID_PADDING);
}

function assignPlacements(plots: PlotSeed[], gridWidth: number, startY = 0): Placement[] {
    let x = 0;
    let y = startY;
    let rowHeight = 0;

    return plots.map(plot => {
        const { width, height } = getTerrainSize(plot);

        if (x + width > gridWidth) {
            x = 0;
            y += rowHeight;
            rowHeight = 0;
        }

        const placement: Placement = {
            longitude: x,
            latitude: y,
            terrainWidth: width,
            terrainHeight: height,
            terrainArea: width * height,
        };

        x += width;
        if (height > rowHeight) rowHeight = height;

        return placement;
    });
}

function assignPublicPlacePlacements(places: PublicPlaceSeed[], gridWidth: number) {
    let x = 0;
    let y = 0;
    let maxHeight = 0;

    const placements: Placement[] = [];
    for (const place of places) {
        const { width, height } = getPublicPlaceSize(place);
        if (x + width > gridWidth) {
            throw new Error(`Public places exceed grid width ${gridWidth}. Increase grid size.`);
        }
        placements.push({
            longitude: x,
            latitude: y,
            terrainWidth: width,
            terrainHeight: height,
            terrainArea: width * height,
        });
        x += width + 1;
        if (height > maxHeight) maxHeight = height;
    }

    return { placements, publicZoneHeight: maxHeight + PUBLIC_ZONE_GAP };
}

function validateNoOverlap(placements: Placement[], label: string) {
    for (let i = 0; i < placements.length; i++) {
        const a = placements[i];
        for (let j = i + 1; j < placements.length; j++) {
            const b = placements[j];

            const overlapX = a.longitude < b.longitude + b.terrainWidth &&
                a.longitude + a.terrainWidth > b.longitude;
            const overlapY = a.latitude < b.latitude + b.terrainHeight &&
                a.latitude + a.terrainHeight > b.latitude;

            if (overlapX && overlapY) {
                throw new Error(`Placement overlap detected in ${label} between ${i} and ${j}`);
            }
        }
    }
}

async function seedItemCatalog() {
    for (const item of [...INGREDIENTS, ...CRAFTABLE_ITEMS, ...CONSUMABLES]) {
        const existing = await prisma.itemDefinition.findUnique({ where: { name: item.name } });
        if (!existing) {
            await prisma.itemDefinition.create({
                data: {
                    name: item.name,
                    category: item.category,
                    baseValue: item.baseValue,
                    stackable: true,
                    maxStack: item.category === 'material' ? 9999 : 100,
                    craftable: item.craftable ?? false,
                    description: item.description,
                }
            });
        } else {
            await prisma.itemDefinition.update({
                where: { id: existing.id },
                data: {
                    category: item.category,
                    baseValue: item.baseValue,
                    craftable: item.craftable ?? existing.craftable,
                    description: item.description ?? existing.description,
                }
            });
        }
    }
}

async function seedAgoraBoards(): Promise<void> {
    for (const board of AGORA_BOARDS) {
        const existing = await prisma.agoraBoard.findUnique({ where: { name: board.name } });
        if (existing) continue;
        await prisma.agoraBoard.create({
            data: {
                name: board.name,
                description: board.description,
                sortOrder: board.sortOrder,
            },
        });
    }
}

async function seedRecipes() {
    const itemDefs = await prisma.itemDefinition.findMany({
        where: { name: { in: RECIPES.map(r => r.outputItem).concat(INGREDIENTS.map(i => i.name)) } }
    });
    const itemByName = new Map(itemDefs.map(i => [i.name, i]));

    for (const recipe of RECIPES) {
        const outputItem = itemByName.get(recipe.outputItem);
        if (!outputItem) {
            console.warn(`   ! Missing output item for recipe ${recipe.name}`);
            continue;
        }

        const existing = await prisma.recipe.findUnique({ where: { name: recipe.name } });
        const recipeId = existing?.id || crypto.randomUUID();

        if (!existing) {
            await prisma.recipe.create({
                data: {
                    id: recipeId,
                    name: recipe.name,
                    outputItemId: outputItem.id,
                    outputQuantity: recipe.outputQuantity,
                    requiredSkill: recipe.requiredSkill,
                    craftTime: recipe.craftTime,
                }
            });
        } else {
            await prisma.recipe.update({
                where: { id: existing.id },
                data: {
                    outputItemId: outputItem.id,
                    outputQuantity: recipe.outputQuantity,
                    requiredSkill: recipe.requiredSkill,
                    craftTime: recipe.craftTime,
                }
            });
        }

        await prisma.recipeIngredient.deleteMany({ where: { recipeId } });
        for (const ingredient of recipe.ingredients) {
            const item = itemByName.get(ingredient.item);
            if (!item) {
                console.warn(`   ! Missing ingredient ${ingredient.item} for recipe ${recipe.name}`);
                continue;
            }
            await prisma.recipeIngredient.create({
                data: {
                    recipeId,
                    itemDefId: item.id,
                    quantity: ingredient.quantity,
                }
            });
        }
    }
}

async function seedIngredientListings(cityId: string, sellerId: string) {
    const ingredientDefs = await prisma.itemDefinition.findMany({
        where: { category: { in: ['material', 'consumable'] } }
    });

    for (const item of ingredientDefs) {
        const existing = await prisma.marketListing.findFirst({
            where: {
                cityId,
                sellerId,
                itemDefId: item.id,
                status: 'active'
            },
            orderBy: { createdAt: 'desc' }
        });

        if (existing) {
            await prisma.marketListing.update({
                where: { id: existing.id },
                data: {
                    priceEach: item.baseValue,
                    quantity: 999999
                }
            });
        } else {
            await prisma.marketListing.create({
                data: {
                    sellerId,
                    itemDefId: item.id,
                    quantity: 999999,
                    priceEach: item.baseValue,
                    cityId,
                    status: 'active'
                }
            });
        }
    }
}

async function ensurePublicMarketForCity(
    cityId: string,
    cityName: string,
    ownerId: string,
    foundedTick: number
): Promise<void> {
    const godWallet = await prisma.agentWallet.findUnique({ where: { actorId: ownerId } });
    if (!godWallet) {
        console.warn(`   ! Missing God wallet; cannot create public market wallet for ${cityName}`);
    } else if (godWallet.walletAddress.toLowerCase() !== CONTRACTS.PUBLIC_VAULT_AND_GOD.toLowerCase()) {
        console.warn(`   ⚠️ God wallet mismatch for public market: config=${CONTRACTS.PUBLIC_VAULT_AND_GOD}, wallet=${godWallet.walletAddress}`);
    }

    const marketName = PUBLIC_MARKET_NAME(cityName);
    const existing = await prisma.business.findFirst({
        where: {
            cityId,
            businessType: 'STORE',
            ownerId,
            name: marketName
        }
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
            const walletInUse = await prisma.businessWallet.findFirst({
                where: { walletAddress: godWallet.walletAddress }
            });
            if (walletInUse) {
                console.warn(`   ⚠️ Public market wallet already in use; skipping wallet attach for ${marketName}`);
            } else {
                await prisma.businessWallet.create({
                    data: {
                        businessId: existing.id,
                        walletAddress: godWallet.walletAddress,
                        encryptedPk: godWallet.encryptedPk,
                        pkNonce: godWallet.pkNonce
                    }
                });
            }
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

    const walletInUse = godWallet
        ? await prisma.businessWallet.findFirst({ where: { walletAddress: godWallet.walletAddress } })
        : null;
    const canAttachWallet = Boolean(godWallet && !walletInUse);

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
        ...(canAttachWallet
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

// ============================================================================
// GENESIS FUNCTIONS
// ============================================================================

async function ensurePublicPlacesForCity(cityId: string, cityName: string, gridWidth: number) {
    const placeSeeds = getPublicPlacesForCity(cityName);
    const { placements } = assignPublicPlacePlacements(placeSeeds, gridWidth);
    validateNoOverlap(placements, 'public_places');

    const existing = await prisma.publicPlace.findMany({
        where: { cityId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const existingByType = new Map(existing.map(place => [place.type, place]));

    for (let i = 0; i < placeSeeds.length; i++) {
        const place = placeSeeds[i];
        const placement = placements[i];
        const existingPlace = existingByType.get(place.type);

        if (existingPlace) {
            await prisma.publicPlace.update({
                where: { id: existingPlace.id },
                data: {
                    name: place.name,
                    latitude: placement.latitude,
                    longitude: placement.longitude,
                    terrainWidth: placement.terrainWidth,
                    terrainHeight: placement.terrainHeight,
                    terrainArea: placement.terrainArea,
                },
            });
        } else {
            await prisma.publicPlace.create({
                data: {
                    cityId,
                    type: place.type,
                    name: place.name,
                    latitude: placement.latitude,
                    longitude: placement.longitude,
                    terrainWidth: placement.terrainWidth,
                    terrainHeight: placement.terrainHeight,
                    terrainArea: placement.terrainArea,
                },
            });
        }
    }
}

async function seedHousing(cityId: string, gridWidth: number, startY: number) {
    const plots: PlotSeed[] = [];

    // Built properties
    for (const housing of GENESIS_HOUSING) {
        for (let i = 0; i < housing.count; i++) {
            plots.push({
                housingTier: housing.tier,
                rentPrice: housing.rentPerDay,
                salePrice: housing.salePrice,
                isEmptyLot: false,
            });
        }
    }

    // Empty lots
    for (const lot of GENESIS_LOTS) {
        for (let i = 0; i < lot.count; i++) {
            plots.push({
                housingTier: 'street', // Placeholder for empty lot
                rentPrice: 0,
                salePrice: lot.price,
                isEmptyLot: true,
                lotType: lot.type,
                maxBuildTier: lot.maxBuild,
            });
        }
    }

    const placements = assignPlacements(plots, gridWidth, startY);
    validateNoOverlap(placements, 'properties');

    for (let i = 0; i < plots.length; i++) {
        const plot = plots[i];
        const placement = placements[i];

        await prisma.property.create({
            data: {
                cityId,
                housingTier: plot.housingTier,
                rentPrice: plot.rentPrice,
                salePrice: plot.salePrice,
                forSale: true,  // City-owned, purchasable
                forRent: !plot.isEmptyLot,
                isGenesisProperty: true,
                isEmptyLot: plot.isEmptyLot,
                lotType: plot.lotType,
                maxBuildTier: plot.maxBuildTier,
                latitude: placement.latitude,
                longitude: placement.longitude,
                terrainWidth: placement.terrainWidth,
                terrainHeight: placement.terrainHeight,
                terrainArea: placement.terrainArea,
            },
        });
    }
}

async function backfillPublicPlacesForCity(cityId: string, gridWidth: number) {
    const places = await prisma.publicPlace.findMany({
        where: { cityId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (places.length === 0) return;

    const missingAny = places.some(
        p =>
            p.latitude === null ||
            p.longitude === null ||
            p.terrainWidth === null ||
            p.terrainHeight === null ||
            p.terrainArea === null
    );
    if (!missingAny) {
        console.log(`     → Public place spatial fields already complete for ${places.length}. Skipping.`);
        return;
    }

    const placeSeeds: PublicPlaceSeed[] = places.map(p => ({ type: p.type, name: p.name }));
    const { placements } = assignPublicPlacePlacements(placeSeeds, gridWidth);
    validateNoOverlap(placements, 'public_places_backfill');

    for (let i = 0; i < places.length; i++) {
        const placement = placements[i];
        await prisma.publicPlace.update({
            where: { id: places[i].id },
            data: {
                latitude: placement.latitude,
                longitude: placement.longitude,
                terrainWidth: placement.terrainWidth,
                terrainHeight: placement.terrainHeight,
                terrainArea: placement.terrainArea,
            }
        });
    }

    console.log(`     → Backfilled spatial fields for ${places.length} public places.`);
}

async function backfillSpatialForCity(cityId: string, gridWidth: number, startY: number) {
    const properties = await prisma.property.findMany({
        where: { cityId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
    });

    if (properties.length === 0) return;

    const missingAny = properties.some(
        p =>
            p.latitude === null ||
            p.longitude === null ||
            p.terrainWidth === null ||
            p.terrainHeight === null ||
            p.terrainArea === null
    );
    if (!missingAny) {
        console.log(`     → Spatial fields already complete for ${properties.length} properties. Skipping backfill.`);
        return;
    }

    const plots: PlotSeed[] = properties.map(p => ({
        housingTier: p.housingTier,
        rentPrice: Number(p.rentPrice),
        salePrice: p.salePrice ? Number(p.salePrice) : 0,
        isEmptyLot: p.isEmptyLot,
        lotType: p.lotType || undefined,
        maxBuildTier: p.maxBuildTier || undefined,
    }));

    const placements = assignPlacements(plots, gridWidth, startY);
    validateNoOverlap(placements, 'properties_backfill');

    for (let i = 0; i < properties.length; i++) {
        const placement = placements[i];
        await prisma.property.update({
            where: { id: properties[i].id },
            data: {
                latitude: placement.latitude,
                longitude: placement.longitude,
                terrainWidth: placement.terrainWidth,
                terrainHeight: placement.terrainHeight,
                terrainArea: placement.terrainArea,
            }
        });
    }

    console.log(`     → Backfilled spatial fields for ${properties.length} properties (reassigned).`);
}

async function updateGenesisPricesForCity(cityId: string) {
    // Update city-owned, unsold genesis housing prices to latest constants
    for (const [tier, pricing] of Object.entries(GENESIS_HOUSING_PRICE_MAP)) {
        await prisma.property.updateMany({
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
    }

    // Update city-owned, unsold empty lots
    for (const [lotType, price] of Object.entries(GENESIS_LOT_PRICE_MAP)) {
        await prisma.property.updateMany({
            where: {
                cityId,
                isGenesisProperty: true,
                isEmptyLot: true,
                ownerId: null,
                lotType,
            },
            data: {
                rentPrice: 0,
                salePrice: price,
            },
        });
    }
}

async function genesis() {
    console.log('═══════════════════════════════════════════');
    console.log('          SOULBYTE GENESIS SCRIPT          ');
    console.log('     (1,000 plots + public places/city)    ');
    console.log('═══════════════════════════════════════════');

    try {
        await connectDB();

        // 1. Create God actor (if not exists)
        console.log('\n1. Creating God actor...');
        let godActor = await prisma.actor.findFirst({
            where: { isGod: true },
        });

        if (!godActor) {
            godActor = await prisma.actor.create({
                data: {
                    kind: 'system',
                    isGod: true,
                    name: 'GOD',
                    frozen: false,
                    dead: false,
                },
            });
            console.log(`   ✓ Created God: ${godActor.id}`);
        } else {
            console.log(`   ✓ God already exists: ${godActor.id}`);
        }

        // 1.2 Reputation uses schema default on creation

        // 1.5. Ensure God has a wallet (System Signer)
        const godWallet = await prisma.agentWallet.findUnique({ where: { actorId: godActor.id } });
        if (!godWallet) {
            console.log(`   > Creating System/God Wallet...`);
            const walletService = new WalletService();

            let privateKey = process.env.GOD_WALLET_PRIVATE_KEY;
            let walletSource = 'Environment Variable';

            if (!privateKey) {
                console.warn(`   ⚠️ WARNING: GOD_WALLET_PRIVATE_KEY not found in .env! Generating RANDOM wallet.`);
                console.warn(`   ⚠️ This System Wallet will have 0 funds and change on every DB reset.`);
                const randomWallet = ethers.Wallet.createRandom();
                privateKey = randomWallet.privateKey;
                walletSource = 'Random Generation';
            }

            // Import wallet for God
            const imported = await walletService.importWallet(godActor.id, privateKey);

            console.log(`   ✓ Linked God Wallet: ${imported.address} (${walletSource})`);
            console.log(`   ! IMPORTANT: Fund this address for System Payouts (Salaries/Winnings)`);
            if (imported.address.toLowerCase() !== CONTRACTS.PUBLIC_VAULT_AND_GOD.toLowerCase()) {
                console.warn(`   ⚠️ PUBLIC_VAULT_AND_GOD mismatch: config=${CONTRACTS.PUBLIC_VAULT_AND_GOD}, wallet=${imported.address}`);
            }
        }

        // 2. Create WorldState (if not exists)
        console.log('\n2. Creating WorldState...');
        let worldState = await prisma.worldState.findFirst({
            where: { id: 1 },
        });

        if (!worldState) {
            worldState = await prisma.worldState.create({
                data: {
                    id: 1,
                    tick: 0,
                    registryVersion: '1.0.0',
                },
            });
            console.log(`   ✓ Created WorldState at tick 0`);
        } else {
            console.log(`   ✓ WorldState already exists at tick ${worldState.tick}`);
        }

        // 3. Create PlatformVault (if not exists)
        console.log('\n3. Creating PlatformVault...');
        let platformVault = await prisma.platformVault.findFirst({
            where: { id: 1 },
        });

        if (!platformVault) {
            platformVault = await prisma.platformVault.create({
                data: {
                    id: 1,
                    balanceSbyte: 0,
                },
            });
            console.log(`   ✓ Created PlatformVault`);
        } else {
            console.log(`   ✓ PlatformVault already exists`);
        }

        // 3.5. Initialize system config (contract addresses)
        console.log('\n3.5. Initializing system config (on-chain addresses)...');
        const systemConfigEntries = [
            { key: 'SBYTE_CONTRACT', value: CONTRACTS.SBYTE_TOKEN, immutable: true },
            { key: 'PLATFORM_FEE_VAULT', value: CONTRACTS.PLATFORM_FEE_VAULT, immutable: true },
            { key: 'PUBLIC_VAULT_AND_GOD', value: CONTRACTS.PUBLIC_VAULT_AND_GOD, immutable: true },
            { key: 'DEPLOYER', value: CONTRACTS.DEPLOYER, immutable: true },
            { key: 'PLATFORM_FEE_BPS', value: String(FEE_CONFIG.PLATFORM_FEE_BPS), immutable: false },
            { key: 'CITY_FEE_MIN_BPS', value: String(FEE_CONFIG.CITY_FEE_MIN_BPS), immutable: false },
            { key: 'CITY_FEE_MAX_BPS', value: String(FEE_CONFIG.CITY_FEE_MAX_BPS), immutable: false },
            { key: 'CITY_FEE_ABSOLUTE_MAX_BPS', value: String(FEE_CONFIG.CITY_FEE_ABSOLUTE_MAX_BPS), immutable: false },
        ];

        for (const entry of systemConfigEntries) {
            const existing = await prisma.systemConfig.findUnique({ where: { key: entry.key } });
            if (!existing) {
                await prisma.systemConfig.create({ data: entry });
                console.log(`   ✓ Created: ${entry.key} = ${entry.value}`);
            } else {
                console.log(`   ✓ Already exists: ${entry.key}`);
            }
        }

        // 3.6. Seed item catalog + recipes
        console.log('\n3.6. Seeding item catalog & recipes...');
        await seedItemCatalog();
        await seedRecipes();
        console.log(`   ✓ Items: ${INGREDIENTS.length + CRAFTABLE_ITEMS.length + CONSUMABLES.length}, Recipes: ${RECIPES.length}`);

        // 3.7. Seed Agora boards
        console.log('\n3.7. Seeding Agora boards...');
        await seedAgoraBoards();
        console.log(`   ✓ Agora boards: ${AGORA_BOARDS.length}`);

        const foundedTick = Number(worldState?.tick ?? 0);

        // 4. Create initial cities with public places and housing
        console.log('\n4. Creating cities with public places and housing...');

        for (const cityDef of GENESIS_CITIES) {
            const existing = await prisma.city.findFirst({
                where: { name: cityDef.name },
            });

            let cityId: string;
            if (!existing) {
                const city = await prisma.city.create({
                    data: {
                        name: cityDef.name,
                        population: 0,
                        populationCap: 1000,
                        housingCapacity: 1000, // 850 built + 150 lots
                        jobCapacity: 100,
                        securityLevel: cityDef.securityLevel,
                        healthServices: cityDef.healthServices,
                        entertainment: 1,
                        transport: 1,
                        reputationScore: 50,
                        vault: {
                            create: {
                                balanceSbyte: GENESIS_CITY_VAULT_SEED,
                            },
                        },
                        policies: {
                            create: {
                                rentTaxRate: 0.05,
                                tradeTaxRate: 0.03,
                                professionTaxRate: 0.05,
                                cityFeeRate: 0.02,
                                propertyTaxRate: 0.05,
                                // On-chain fee settings
                                cityFeeBps: FEE_CONFIG.CITY_FEE_DEFAULT_BPS,
                                minCityFeeBps: FEE_CONFIG.CITY_FEE_MIN_BPS,
                                maxCityFeeBps: FEE_CONFIG.CITY_FEE_MAX_BPS,
                            },
                        },
                    },
                    include: {
                        vault: true,
                        policies: true,
                    },
                });

                console.log(`   ✓ Created city: ${cityDef.name} (id: ${city.id})`);
                console.log(`     → Vault: ${GENESIS_CITY_VAULT_SEED} SBYTE`);
                cityId = city.id;

                const plotsForSizing: PlotSeed[] = [];
                for (const housing of GENESIS_HOUSING) {
                    for (let i = 0; i < housing.count; i++) {
                        plotsForSizing.push({
                            housingTier: housing.tier,
                            rentPrice: housing.rentPerDay,
                            salePrice: housing.salePrice,
                            isEmptyLot: false,
                        });
                    }
                }
                for (const lot of GENESIS_LOTS) {
                    for (let i = 0; i < lot.count; i++) {
                        plotsForSizing.push({
                            housingTier: 'street',
                            rentPrice: 0,
                            salePrice: lot.price,
                            isEmptyLot: true,
                            lotType: lot.type,
                            maxBuildTier: lot.maxBuild,
                        });
                    }
                }

                const publicPlaces = getPublicPlacesForCity(cityDef.name);
                const gridWidth = calculateGridWidth(plotsForSizing, publicPlaces);
                const { publicZoneHeight } = assignPublicPlacePlacements(publicPlaces, gridWidth);

                // Seed public places
                await ensurePublicPlacesForCity(city.id, cityDef.name, gridWidth);
                console.log(`     → Created ${publicPlaces.length} public places (gridWidth=${gridWidth})`);

                // Seed housing (this will take a moment)
                console.log(`     → Seeding 1,000 properties...`);
                await seedHousing(city.id, gridWidth, publicZoneHeight);
                console.log(`     → Created 850 built + 150 empty lots`);

            } else {
                console.log(`   ✓ City already exists: ${cityDef.name}`);
                console.log(`     → Backfilling spatial fields (if missing)...`);
                cityId = existing.id;

                const publicSeeds = getPublicPlacesForCity(existing.name);

                const existingProps = await prisma.property.findMany({
                    where: { cityId: existing.id },
                    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                });
                const plotsForSizing: PlotSeed[] = existingProps.map(p => ({
                    housingTier: p.housingTier,
                    rentPrice: Number(p.rentPrice),
                    salePrice: p.salePrice ? Number(p.salePrice) : 0,
                    isEmptyLot: p.isEmptyLot,
                    lotType: p.lotType || undefined,
                    maxBuildTier: p.maxBuildTier || undefined,
                }));

                const gridWidth = calculateGridWidth(plotsForSizing, publicSeeds);
                const { publicZoneHeight } = assignPublicPlacePlacements(publicSeeds, gridWidth);

                await ensurePublicPlacesForCity(existing.id, existing.name, gridWidth);
                await backfillSpatialForCity(existing.id, gridWidth, publicZoneHeight);
                await updateGenesisPricesForCity(existing.id);
                console.log(`     → Updated genesis prices for city-owned properties`);
            }

            // Seed ingredient listings for city import center (God as seller)
            const godSeller = await prisma.actor.findFirst({ where: { isGod: true } });
            if (godSeller) {
                await seedIngredientListings(cityId, godSeller.id);
                await ensurePublicMarketForCity(cityId, cityDef.name, godSeller.id, foundedTick);
            }
        }

        // 5. Create initial agents
        if (SKIP_INITIAL_AGENTS) {
            console.log('\n5. Skipping initial agents (GENESIS_SKIP_AGENTS=true).');
            console.log(`\n═══════════════════════════════════════════`);
            console.log('          GENESIS COMPLETE!                ');
            console.log('═══════════════════════════════════════════');
            console.log('\nSummary:');
            console.log(`  • Cities: ${GENESIS_CITIES.length}`);
            console.log(`  • Vault per city: ${GENESIS_CITY_VAULT_SEED} SBYTE`);
            console.log(`  • Properties per city: 1,000 (850 built + 150 lots)`);
            console.log(`  • Public places per city: ${getPublicPlacesForCity(GENESIS_CITIES[0]?.name ?? 'Genesis City').length}`);
            console.log('');
            console.log('You can now start the World API:');
            console.log('  pnpm --filter world-api dev');
            console.log('');
            return;
        }

        console.log('\n5. Creating initial agents (Alice, Bob, Charlie)...');
        const AGENTS = [
            { name: 'Alice', balance: 5000, energy: 100, housingTier: 'street', wealthTier: 'W5' },
            { name: 'Bob', balance: 1000, energy: 100, housingTier: 'street', wealthTier: 'W4' },
            { name: 'Charlie', balance: 100, energy: 30, housingTier: 'street', wealthTier: 'W2' }
        ] as const;

        const city = await prisma.city.findFirst();

        // Initialize WalletService
        // Note: Requires MONAD_RPC_URL and WALLET_ENCRYPTION_KEY in .env
        let walletService: WalletService | null = null;
        try {
            walletService = new WalletService();
        } catch (e) {
            console.warn('   ! Warning: Could not initialize WalletService (check .env). Agent wallets will not be created.');
        }

        for (const startAgent of AGENTS) {
            const existing = await prisma.actor.findFirst({
                where: { name: startAgent.name },
            });

            if (!existing) {
                const agent = await prisma.actor.create({
                    data: {
                        kind: 'agent',
                        isGod: false,
                        name: startAgent.name,
                        frozen: false,
                        dead: false,
                        wallet: {
                            create: {
                                balanceSbyte: startAgent.balance, // Initial simulation balance
                                lockedSbyte: 0,
                            },
                        },
                        agentState: {
                            create: {
                                cityId: city?.id,
                                housingTier: startAgent.housingTier as any,
                                jobType: 'unemployed',
                                wealthTier: startAgent.wealthTier as any,
                                balanceSbyte: startAgent.balance,
                                reputationScore: 50,
                                health: 100,
                                energy: startAgent.energy,
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
                                    vengefulness: 50
                                },
                                emotions: {
                                    anger: 0,
                                    fear: 0,
                                    confidence: 0,
                                    desperation: 0,
                                    pride: 0,
                                    loneliness: 0
                                },
                                markers: {},
                                archetype: null
                            },
                        },
                    },
                });
                console.log(`   ✓ Created ${startAgent.name}: Balance ${startAgent.balance}, Energy ${startAgent.energy}`);

                // Create On-Chain Wallet
                if (walletService) {
                    try {
                        const randomWallet = ethers.Wallet.createRandom();
                        await walletService.importWallet(agent.id, randomWallet.privateKey);
                        console.log(`     → On-Chain Wallet: ${randomWallet.address}`);
                        console.log(`     ! IMPORTANT: Fund this address with SBYTE/MON to enable on-chain actions`);

                        // Restore simulation balance (importWallet overwrites it with 0 from chain)
                        await prisma.wallet.update({
                            where: { actorId: agent.id },
                            data: { balanceSbyte: startAgent.balance },
                        });
                        console.log(`     → Restored simulation balance to ${startAgent.balance}`);
                    } catch (error) {
                        console.error(`     ! Failed to create wallet for ${startAgent.name}:`, error);
                    }
                }

            } else {
                console.log(`   ✓ ${startAgent.name} already exists: ${existing.id}`);

                // Backfill wallet if missing
                const wallet = await prisma.agentWallet.findUnique({ where: { actorId: existing.id } });
                if (wallet) {
                    console.log(`     → Wallet: ${wallet.walletAddress}`);
                } else if (walletService) {
                    try {
                        console.log(`     → Creating missing on-chain wallet...`);
                        const randomWallet = ethers.Wallet.createRandom();
                        await walletService.importWallet(existing.id, randomWallet.privateKey);
                        console.log(`     → On-Chain Wallet: ${randomWallet.address}`);
                        console.log(`     ! IMPORTANT: Fund this address with SBYTE/MON`);

                        // Restore simulation balance
                        await prisma.wallet.update({
                            where: { actorId: existing.id },
                            data: { balanceSbyte: startAgent.balance },
                        });
                    } catch (error) {
                        console.error(`     ! Failed to backfill wallet:`, error);
                    }
                }
            }
        }

        console.log('\n═══════════════════════════════════════════');
        console.log('          GENESIS COMPLETE!                ');
        console.log('═══════════════════════════════════════════');
        console.log('\nSummary:');
        console.log(`  • Cities: ${GENESIS_CITIES.length}`);
        console.log(`  • Vault per city: ${GENESIS_CITY_VAULT_SEED} SBYTE`);
        console.log(`  • Properties per city: 1,000 (850 built + 150 lots)`);
        console.log(`  • Public places per city: ${getPublicPlacesForCity(GENESIS_CITIES[0]?.name ?? 'Genesis City').length}`);
        console.log('');
        console.log('You can now start the World API:');
        console.log('  pnpm --filter world-api dev');
        console.log('');

    } catch (error) {
        console.error('Genesis failed:', error);
        process.exit(1);
    } finally {
        await disconnectDB();
    }
}

// Run if called directly
genesis();

import 'dotenv/config';
import { prisma } from '../db.js';
import { processTick } from '../engine/world.engine.js';
import { checkFreeze } from '../engine/freeze.engine.js';
import { IntentType } from '../types/intent.types.js';
import path from 'path';
import fs from 'fs';

const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const SIM_REPORT_FILE = path.join(process.cwd(), '../../docs/simulations', `${RUN_TIMESTAMP}_tick-longrun-sim.md`);

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

async function getActorOrFail(name: string) {
    const actor = await prisma.actor.findFirst({
        where: { name },
        include: { agentState: true, wallet: true }
    });
    if (!actor) {
        await log(`❌ Actor not found: ${name}`);
        process.exit(1);
    }
    return actor;
}

async function main() {
    await logSection('World Tick Long-Run Simulation');

    const bot1 = await getActorOrFail(process.env.BOT1_ACTOR_NAME || 'Alice');
    const bot2 = await getActorOrFail(process.env.BOT2_ACTOR_NAME || 'Bob');
    const bot3 = await getActorOrFail(process.env.BOT3_ACTOR_NAME || 'Charlie');

    const worldState = await prisma.worldState.findFirst({ where: { id: 1 } });
    let tick = worldState?.tick ?? 0;

    // Force a freeze candidate (bot3)
    await prisma.wallet.update({ where: { actorId: bot3.id }, data: { balanceSbyte: 0 } });
    await prisma.agentState.update({
        where: { actorId: bot3.id },
        data: {
            housingTier: 'street',
            health: 5,
            energy: 5,
            hunger: 5,
            social: 5,
            fun: 5,
            purpose: 5
        }
    });
    await log('✓ Prepared freeze candidate (bot3)');

    const TICKS_TO_RUN = 20;
    for (let i = 0; i < TICKS_TO_RUN; i++) {
        // Insert intents for bot1/bot2
        await prisma.intent.createMany({
            data: [
                {
                    actorId: bot1.id,
                    type: IntentType.INTENT_WORK,
                    params: {},
                    tick,
                    priority: 1
                },
                {
                    actorId: bot2.id,
                    type: IntentType.INTENT_REST,
                    params: {},
                    tick,
                    priority: 1
                }
            ]
        });

        const { processedIntents, events } = await processTick(tick, BigInt(Date.now()));
        const freezeCount = await checkFreeze(tick);

        await log(`Tick ${tick}: intents=${processedIntents}, events=${events.length}, froze=${freezeCount}`);

        await prisma.worldState.update({
            where: { id: 1 },
            data: { tick: tick + 1, updatedAt: new Date() }
        });

        tick += 1;
    }

    await logSection('Success');
    await log(`Report: ${SIM_REPORT_FILE}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

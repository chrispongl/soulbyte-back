import 'dotenv/config';
import { prisma } from '../db.js';
import { IntentType } from '../types/intent.types.js';
import { processTick } from '../engine/world.engine.js';
import path from 'path';
import fs from 'fs';

const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const SIM_REPORT_FILE = path.join(process.cwd(), '../../docs/simulations', `${RUN_TIMESTAMP}_governance-sim.md`);

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
    const actor = await prisma.actor.findFirst({ where: { name } });
    if (!actor) {
        await log(`❌ Actor not found: ${name}`);
        process.exit(1);
    }
    return actor;
}

async function main() {
    await logSection('Governance Anti-Rug Simulation');

    const bot = await getActorOrFail(process.env.BOT1_ACTOR_NAME || 'Alice');
    const city = await prisma.city.findFirst({ where: { name: 'Genesis City' } });
    if (!city) {
        await log('❌ City not found: Genesis City');
        process.exit(1);
    }

    await prisma.city.update({
        where: { id: city.id },
        data: { mayorId: bot.id }
    });
    await log(`✓ Set mayor to ${bot.name} (${bot.id}) for ${city.name}`);

    const worldState = await prisma.worldState.findFirst({ where: { id: 1 } });
    const currentTick = worldState?.tick ?? 0;

    const intent = await prisma.intent.create({
        data: {
            actorId: bot.id,
            type: IntentType.INTENT_CITY_TAX_CHANGE,
            params: {
                cityId: city.id,
                payload: {
                    newTaxRate: 0.5,
                    reason: 'anti-rug test'
                }
            },
            tick: currentTick,
            priority: 10
        }
    });

    await log(`✓ Created intent ${intent.id} (tax_change → 0.5) at tick ${currentTick}`);

    const seed = BigInt(Date.now());
    await processTick(currentTick, seed);

    const updatedIntent = await prisma.intent.findUnique({ where: { id: intent.id } });
    const updatedActor = await prisma.actor.findUnique({ where: { id: bot.id } });
    const lastAdminLog = await prisma.adminLog.findFirst({
        where: { action: 'GOD_INTERVENTION' },
        orderBy: { createdAt: 'desc' }
    });

    await log(`Intent status: ${updatedIntent?.status}`);
    await log(`Mayor reputation: ${updatedActor?.reputation?.toString()}`);
    if (lastAdminLog) {
        await log(`AdminLog: ${JSON.stringify(lastAdminLog.payload)}`);
    } else {
        await log('AdminLog: none');
    }

    await logSection('Success');
    await log(`Report: ${SIM_REPORT_FILE}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

import 'dotenv/config';
import { prisma } from '../db.js';
import { applyDailyReputationDrift } from '../engine/tick-runner.js';
import path from 'path';
import fs from 'fs';

const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const SIM_REPORT_FILE = path.join(process.cwd(), '../../docs/simulations', `${RUN_TIMESTAMP}_reputation-drift-sim.md`);

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
        include: { agentState: true }
    });
    if (!actor) {
        await log(`❌ Actor not found: ${name}`);
        process.exit(1);
    }
    return actor;
}

async function main() {
    await logSection('Reputation Drift Simulation (Day Boundary)');

    const bot1 = await getActorOrFail(process.env.BOT1_ACTOR_NAME || 'Alice');
    const bot2 = await getActorOrFail(process.env.BOT2_ACTOR_NAME || 'Bob');

    // Configure bot1 for negative drift
    await prisma.agentState.update({
        where: { actorId: bot1.id },
        data: { housingTier: 'street', jobType: 'unemployed', wealthTier: 'W0' }
    });

    // Configure bot2 for positive drift
    await prisma.agentState.update({
        where: { actorId: bot2.id },
        data: { housingTier: 'villa', jobType: 'skilled', wealthTier: 'W6' }
    });

    // Ensure marriage for bot2 for positive drift
    const marriage = await prisma.consent.findFirst({
        where: {
            OR: [
                { partyAId: bot2.id },
                { partyBId: bot2.id }
            ],
            type: 'marriage',
            status: 'active'
        }
    });
    if (!marriage) {
        await prisma.consent.create({
            data: {
                type: 'marriage',
                partyAId: bot2.id,
                partyBId: bot1.id,
                status: 'active',
                terms: {}
            }
        });
    }

    // Ensure public employment for bot2
    const publicPlace = await prisma.publicPlace.findFirst({ where: { type: 'HOSPITAL', cityId: bot2.agentState?.cityId ?? undefined } });
    if (publicPlace) {
        const employment = await prisma.publicEmployment.findUnique({ where: { actorId: bot2.id } });
        if (!employment) {
            await prisma.publicEmployment.create({
                data: {
                    actorId: bot2.id,
                    publicPlaceId: publicPlace.id,
                    role: 'NURSE',
                    dailySalarySbyte: 250,
                    workHours: 5,
                    startedAtTick: 0,
                    experienceDays: 0
                }
            });
        }
    }

    const before1 = await prisma.actor.findUnique({ where: { id: bot1.id } });
    const before2 = await prisma.actor.findUnique({ where: { id: bot2.id } });
    await log(`Bot1 reputation before: ${before1?.reputation?.toString()}`);
    await log(`Bot2 reputation before: ${before2?.reputation?.toString()}`);

    const drifted = await applyDailyReputationDrift(1440);
    await log(`Applied drift to ${drifted} agents`);

    const after1 = await prisma.actor.findUnique({ where: { id: bot1.id } });
    const after2 = await prisma.actor.findUnique({ where: { id: bot2.id } });
    await log(`Bot1 reputation after: ${after1?.reputation?.toString()}`);
    await log(`Bot2 reputation after: ${after2?.reputation?.toString()}`);

    await logSection('Success');
    await log(`Report: ${SIM_REPORT_FILE}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

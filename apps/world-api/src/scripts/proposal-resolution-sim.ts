import 'dotenv/config';
import { prisma } from '../db.js';
import { IntentType } from '../types/intent.types.js';
import { processTick } from '../engine/world.engine.js';
import { processProposals } from '../services/god.service.js';
import path from 'path';
import fs from 'fs';

const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const SIM_REPORT_FILE = path.join(process.cwd(), '../../docs/simulations', `${RUN_TIMESTAMP}_proposal-resolution-sim.md`);

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
    await logSection('Proposal Resolution Regression Test');

    const mayor = await getActorOrFail(process.env.BOT1_ACTOR_NAME || 'Alice');
    const city = await prisma.city.findFirst({ where: { name: 'Genesis City' } });
    if (!city) {
        await log('❌ City not found: Genesis City');
        process.exit(1);
    }

    await prisma.city.update({
        where: { id: city.id },
        data: { mayorId: mayor.id, population: 1000 }
    });
    await prisma.actor.update({
        where: { id: mayor.id },
        data: { frozen: false, frozenReason: null }
    });
    await prisma.jail.deleteMany({ where: { actorId: mayor.id } });
    await prisma.intent.deleteMany({ where: { actorId: mayor.id, status: 'pending' } });
    await prisma.agentState.update({
        where: { actorId: mayor.id },
        data: { activityState: 'IDLE', activityEndTick: null }
    });

    const beforePolicy = await prisma.cityPolicy.findUnique({ where: { cityId: city.id } });
    await log(`Rent tax before: ${beforePolicy?.rentTaxRate?.toString()}`);

    const worldState = await prisma.worldState.findFirst({ where: { id: 1 } });
    const tick = worldState?.tick ?? 0;

    const intent = await prisma.intent.create({
        data: {
            actorId: mayor.id,
            type: IntentType.INTENT_CITY_TAX_CHANGE,
            params: {
                cityId: city.id,
                payload: {
                    newTaxRate: 0.08,
                    estimatedCost: 0
                }
            },
            tick,
            priority: 100
        }
    });
    await log(`✓ Created intent ${intent.id}`);

    await processTick(tick, BigInt(Date.now()));
    const intentAfter = await prisma.intent.findUnique({ where: { id: intent.id } });
    await log(`Intent status: ${intentAfter?.status}`);

    const proposal = await prisma.cityProposal.findFirst({
        where: { cityId: city.id, type: 'tax_change' },
        orderBy: { createdAt: 'desc' }
    });
    if (!proposal) {
        await log('❌ No proposal found after intent');
        process.exit(1);
    }
    await log(`✓ Proposal created: ${proposal.id} (status: ${proposal.status})`);

    const result = await processProposals(tick);
    await log(`✓ Approved: ${result.approved}, Rejected: ${result.rejected}`);

    const afterPolicy = await prisma.cityPolicy.findUnique({ where: { cityId: city.id } });
    await log(`Rent tax after: ${afterPolicy?.rentTaxRate?.toString()}`);

    const updatedProposal = await prisma.cityProposal.findUnique({ where: { id: proposal.id } });
    await log(`Proposal status: ${updatedProposal?.status}`);

    await logSection('Success');
    await log(`Report: ${SIM_REPORT_FILE}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

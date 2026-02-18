import 'dotenv/config';
import { prisma } from '../db.js';
import { IntentType } from '../types/intent.types.js';
import { processTick } from '../engine/world.engine.js';
import { handleVote } from '../engine/handlers/governance.handlers.js';
import { processProposals } from '../services/god.service.js';
import path from 'path';
import fs from 'fs';

const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const SIM_REPORT_FILE = path.join(process.cwd(), '../../docs/simulations', `${RUN_TIMESTAMP}_governance-flow-sim.md`);

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

async function commitUpdates(updates: any[]) {
    await prisma.$transaction(async (tx) => {
        for (const update of updates) {
            const table = (tx as any)[update.table];
            if (update.operation === 'update') await table.update({ where: update.where, data: update.data });
            if (update.operation === 'create') await table.create({ data: update.data });
        }
    });
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
    await logSection('Governance Full Flow Simulation');

    const bot = await getActorOrFail(process.env.BOT1_ACTOR_NAME || 'Alice');
    const city = await prisma.city.findFirst({ where: { name: 'Genesis City' } });
    if (!city) {
        await log('❌ City not found: Genesis City');
        process.exit(1);
    }

    await prisma.city.update({
        where: { id: city.id },
        data: { mayorId: bot.id, population: 1000 }
    });
    await log(`✓ Set mayor to ${bot.name}`);

    const worldState = await prisma.worldState.findFirst({ where: { id: 1 } });
    const tick = worldState?.tick ?? 0;

    await logSection('Step 1: Create Tax Change Proposal');
    const intent = await prisma.intent.create({
        data: {
            actorId: bot.id,
            type: IntentType.INTENT_CITY_TAX_CHANGE,
            params: {
                cityId: city.id,
                payload: {
                    newTaxRate: 0.06,
                    estimatedCost: 0
                }
            },
            tick,
            priority: 10
        }
    });
    await log(`✓ Created intent ${intent.id}`);

    await processTick(tick, BigInt(Date.now()));
    const proposal = await prisma.cityProposal.findFirst({
        where: { cityId: city.id },
        orderBy: { createdAt: 'desc' }
    });
    await log(`✓ Proposal created: ${proposal?.id}`);

    await logSection('Step 2: God Processes Proposals');
    const result = await processProposals(tick);
    await log(`✓ Approved: ${result.approved}, Rejected: ${result.rejected}`);

    const updatedProposal = await prisma.cityProposal.findUnique({ where: { id: proposal?.id || '' } });
    await log(`Proposal status: ${updatedProposal?.status}`);

    const cityPolicy = await prisma.cityPolicy.findUnique({ where: { cityId: city.id } });
    await log(`City rent tax rate: ${cityPolicy?.rentTaxRate?.toString()}`);

    await logSection('Step 3: Election Vote');
    const voter = await getActorOrFail(process.env.BOT2_ACTOR_NAME || 'Bob');
    await prisma.agentState.update({
        where: { actorId: voter.id },
        data: { wealthTier: 'W2' }
    });
    const voterState = await prisma.agentState.findUnique({ where: { actorId: voter.id } });

    const lastElection = await prisma.election.findFirst({
        where: { cityId: city.id },
        orderBy: { cycle: 'desc' }
    });
    const nextCycle = (lastElection?.cycle ?? 0) + 1;

    const election = await prisma.election.create({
        data: {
            cityId: city.id,
            cycle: nextCycle,
            startTick: tick,
            endTick: tick + 100,
            status: 'voting'
        }
    });
    const candidate = await prisma.candidate.create({
        data: {
            electionId: election.id,
            actorId: bot.id,
            status: 'nominated',
            platform: 'Stability and growth'
        }
    });

    const voteRes = await handleVote(
        { id: 'sim-vote', actorId: voter.id, type: IntentType.INTENT_VOTE, params: { candidateId: candidate.id, electionId: election.id }, priority: 1 } as any,
        { id: voter.id, name: voter.name, frozen: false, dead: false } as any,
        voterState as any,
        voter.wallet as any,
        tick,
        BigInt(Date.now())
    );
    await commitUpdates(voteRes.stateUpdates);
    const voteReason = voteRes.events?.[0]?.sideEffects?.reason as string | undefined;
    await log(`Vote result: ${voteRes.intentStatus}${voteReason ? ` (${voteReason})` : ''}`);

    await logSection('Success');
    await log(`Report: ${SIM_REPORT_FILE}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

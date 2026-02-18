import 'dotenv/config';
import { prisma } from '../db.js';
import { handleAttack, handleDefend, handleRetreat } from '../engine/handlers/combat.handlers.js';
import { handleSteal, handleArrest, handleImprison, handleRelease } from '../engine/handlers/crime.handlers.js';
import { handlePatrol } from '../engine/handlers/police.handlers.js';
import { IntentType } from '../types/intent.types.js';
import path from 'path';
import fs from 'fs';

const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const SIM_REPORT_FILE = path.join(process.cwd(), '../../docs/simulations', `${RUN_TIMESTAMP}_combat-crime-police-sim.md`);

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
            if (update.operation === 'delete') await table.delete({ where: update.where });
        }
    });
}

async function getActorOrFail(name: string) {
    const actor = await prisma.actor.findFirst({
        where: { name },
        include: { wallet: true, agentState: true }
    });
    if (!actor) {
        await log(`❌ Actor not found: ${name}`);
        process.exit(1);
    }
    return actor;
}

async function main() {
    await logSection('Combat + Crime + Police Simulation');

    const bot1 = await getActorOrFail(process.env.BOT1_ACTOR_NAME || 'Alice');
    const bot2 = await getActorOrFail(process.env.BOT2_ACTOR_NAME || 'Bob');

    // Ensure same city
    const cityId = bot1.agentState?.cityId || bot2.agentState?.cityId;
    if (!cityId) {
        await log('❌ Both actors must be in a city');
        process.exit(1);
    }
    if (bot1.agentState?.cityId !== cityId) {
        await prisma.agentState.update({ where: { actorId: bot1.id }, data: { cityId } });
    }
    if (bot2.agentState?.cityId !== cityId) {
        await prisma.agentState.update({ where: { actorId: bot2.id }, data: { cityId } });
    }

    // Top up energy/health
    await prisma.agentState.updateMany({
        where: { actorId: { in: [bot1.id, bot2.id] } },
        data: { energy: 100, health: 100, activityState: 'IDLE', activityEndTick: null }
    });

    const seed = BigInt(Date.now());
    let tick = 0;

    await logSection('Step 1: Combat (Attack/Defend/Retreat)');
    const attackRes = await handleAttack(
        { id: 'sim-attack', actorId: bot1.id, type: IntentType.INTENT_ATTACK, params: { targetId: bot2.id }, priority: 1 } as any,
        { id: bot1.id, name: bot1.name, frozen: false, dead: false } as any,
        bot1.agentState as any,
        bot1.wallet as any,
        tick,
        seed
    );
    await commitUpdates(attackRes.stateUpdates);
    await log(`Attack result: ${attackRes.intentStatus}`);

    const defendRes = await handleDefend(
        { id: 'sim-defend', actorId: bot2.id, type: IntentType.INTENT_DEFEND, params: {}, priority: 1 } as any,
        { id: bot2.id, name: bot2.name, frozen: false, dead: false } as any,
        bot2.agentState as any,
        bot2.wallet as any,
        tick,
        seed
    );
    await commitUpdates(defendRes.stateUpdates);
    await log(`Defend result: ${defendRes.intentStatus}`);

    const retreatRes = await handleRetreat(
        { id: 'sim-retreat', actorId: bot2.id, type: IntentType.INTENT_RETREAT, params: {}, priority: 1 } as any,
        { id: bot2.id, name: bot2.name, frozen: false, dead: false } as any,
        bot2.agentState as any,
        bot2.wallet as any,
        tick,
        seed
    );
    await commitUpdates(retreatRes.stateUpdates);
    await log(`Retreat result: ${retreatRes.intentStatus}`);

    await logSection('Step 2: Crime (Steal)');
    const stealRes = await handleSteal(
        { id: 'sim-steal', actorId: bot1.id, type: IntentType.INTENT_STEAL, params: { targetId: bot2.id }, priority: 1 } as any,
        { id: bot1.id, name: bot1.name, frozen: false, dead: false } as any,
        bot1.agentState as any,
        bot1.wallet as any,
        tick,
        seed
    );
    await commitUpdates(stealRes.stateUpdates);
    await log(`Steal result: ${stealRes.intentStatus}`);

    await logSection('Step 3: Police (Patrol + Arrest + Imprison + Release)');
    const policePlace = await prisma.publicPlace.findFirst({
        where: { cityId, type: 'POLICE_STATION' }
    });
    if (!policePlace) {
        await log('❌ No police station found');
        process.exit(1);
    }

    const existingEmployment = await prisma.publicEmployment.findUnique({ where: { actorId: bot1.id } });
    if (!existingEmployment) {
        await prisma.publicEmployment.create({
            data: {
                actorId: bot1.id,
                publicPlaceId: policePlace.id,
                role: 'POLICE_OFFICER',
                dailySalarySbyte: 250,
                workHours: 5,
                startedAtTick: tick,
                experienceDays: 0
            }
        });
        await log(`✓ Created police employment for ${bot1.name}`);
    } else {
        await prisma.publicEmployment.update({
            where: { actorId: bot1.id },
            data: { role: 'POLICE_OFFICER', publicPlaceId: policePlace.id, endedAtTick: null }
        });
        await log(`✓ Ensured police employment active for ${bot1.name}`);
    }

    const patrolRes = await handlePatrol(
        { id: 'sim-patrol', actorId: bot1.id, type: IntentType.INTENT_PATROL, params: {}, priority: 1 } as any,
        { id: bot1.id, name: bot1.name, frozen: false, dead: false } as any,
        bot1.agentState as any,
        bot1.wallet as any,
        tick,
        seed
    );
    await commitUpdates(patrolRes.stateUpdates);
    const patrolReason = patrolRes.events?.[0]?.sideEffects?.reason as string | undefined;
    await log(`Patrol result: ${patrolRes.intentStatus}${patrolReason ? ` (${patrolReason})` : ''}`);

    const arrestRes = await handleArrest(
        { id: 'sim-arrest', actorId: bot1.id, type: IntentType.INTENT_ARREST, params: { targetId: bot2.id }, priority: 1 } as any,
        { id: bot1.id, name: bot1.name, frozen: false, dead: false } as any,
        bot1.agentState as any,
        bot1.wallet as any,
        tick,
        seed
    );
    await commitUpdates(arrestRes.stateUpdates);
    await log(`Arrest result: ${arrestRes.intentStatus}`);

    const imprisonRes = await handleImprison(
        { id: 'sim-imprison', actorId: bot1.id, type: IntentType.INTENT_IMPRISON, params: { targetId: bot2.id, duration: 10 }, priority: 1 } as any,
        { id: bot1.id, name: bot1.name, frozen: false, dead: false } as any,
        bot1.agentState as any,
        bot1.wallet as any,
        tick,
        seed
    );
    await commitUpdates(imprisonRes.stateUpdates);
    await log(`Imprison result: ${imprisonRes.intentStatus}`);

    const releaseRes = await handleRelease(
        { id: 'sim-release', actorId: bot1.id, type: IntentType.INTENT_RELEASE, params: { targetId: bot2.id }, priority: 1 } as any,
        { id: bot1.id, name: bot1.name, frozen: false, dead: false } as any,
        bot1.agentState as any,
        bot1.wallet as any,
        tick + 11,
        seed
    );
    await commitUpdates(releaseRes.stateUpdates);
    await log(`Release result: ${releaseRes.intentStatus}`);

    await logSection('Success');
    await log(`Report: ${SIM_REPORT_FILE}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

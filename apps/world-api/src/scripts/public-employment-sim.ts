import 'dotenv/config';
import { prisma } from '../db.js';
import {
    handleApplyPublicJob,
    handleStartShift,
    handleEndShift,
    handleCollectSalary
} from '../engine/handlers/public-employment.handlers.js';
import { IntentType } from '../types/intent.types.js';
import path from 'path';
import fs from 'fs';

const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const SIM_REPORT_FILE = path.join(process.cwd(), '../../docs/simulations', `${RUN_TIMESTAMP}_public-employment-sim.md`);

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
    await logSection('Public Employment Daily Cycle Simulation');

    const bot = await getActorOrFail(process.env.BOT1_ACTOR_NAME || 'Alice');
    const cityId = bot.agentState?.cityId;
    if (!cityId) {
        await log('❌ Bot must be in a city');
        process.exit(1);
    }

    const hospital = await prisma.publicPlace.findFirst({
        where: { cityId, type: 'HOSPITAL' }
    });
    if (!hospital) {
        await log('❌ Hospital not found');
        process.exit(1);
    }

    // Reset activity to ensure clean flow
    await prisma.agentState.update({
        where: { actorId: bot.id },
        data: { activityState: 'IDLE', activityEndTick: null }
    });

    // Apply for NURSE if not employed
    const existing = await prisma.publicEmployment.findUnique({ where: { actorId: bot.id } });
    if (!existing) {
        await logSection('Step 1: Apply Public Job');
        const applyRes = await handleApplyPublicJob(
            { id: 'sim-apply', actorId: bot.id, type: IntentType.INTENT_APPLY_PUBLIC_JOB, params: { publicPlaceId: hospital.id, role: 'NURSE' }, priority: 1 } as any,
            { id: bot.id, name: bot.name, frozen: false, dead: false } as any,
            bot.agentState as any,
            bot.wallet as any,
            0,
            BigInt(Date.now())
        );
        await commitUpdates(applyRes.stateUpdates);
        await log(`Apply result: ${applyRes.intentStatus}`);
    } else {
        await prisma.publicEmployment.update({
            where: { actorId: bot.id },
            data: { endedAtTick: null, lastWorkedTick: null }
        });
    }

    await logSection('Step 2: Start Shift');
    const startRes = await handleStartShift(
        { id: 'sim-start', actorId: bot.id, type: IntentType.INTENT_START_SHIFT, params: {}, priority: 1 } as any,
        { id: bot.id, name: bot.name, frozen: false, dead: false } as any,
        (await prisma.agentState.findUnique({ where: { actorId: bot.id } })) as any,
        bot.wallet as any,
        10,
        BigInt(Date.now())
    );
    await commitUpdates(startRes.stateUpdates);
    await log(`Start shift result: ${startRes.intentStatus}`);

    await logSection('Step 3: End Shift');
    const endRes = await handleEndShift(
        { id: 'sim-end', actorId: bot.id, type: IntentType.INTENT_END_SHIFT, params: {}, priority: 1 } as any,
        { id: bot.id, name: bot.name, frozen: false, dead: false } as any,
        (await prisma.agentState.findUnique({ where: { actorId: bot.id } })) as any,
        bot.wallet as any,
        20,
        BigInt(Date.now())
    );
    await commitUpdates(endRes.stateUpdates);
    await log(`End shift result: ${endRes.intentStatus}`);

    await logSection('Step 4: Collect Salary');
    const collectRes = await handleCollectSalary(
        { id: 'sim-collect', actorId: bot.id, type: IntentType.INTENT_COLLECT_SALARY, params: {}, priority: 1 } as any,
        { id: bot.id, name: bot.name, frozen: false, dead: false } as any,
        (await prisma.agentState.findUnique({ where: { actorId: bot.id } })) as any,
        bot.wallet as any,
        30,
        BigInt(Date.now())
    );
    await commitUpdates(collectRes.stateUpdates);
    await log(`Collect salary result: ${collectRes.intentStatus}`);

    await logSection('Step 5: Start Shift Again (Should Block)');
    const startAgainRes = await handleStartShift(
        { id: 'sim-start-again', actorId: bot.id, type: IntentType.INTENT_START_SHIFT, params: {}, priority: 1 } as any,
        { id: bot.id, name: bot.name, frozen: false, dead: false } as any,
        (await prisma.agentState.findUnique({ where: { actorId: bot.id } })) as any,
        bot.wallet as any,
        40,
        BigInt(Date.now())
    );
    await log(`Start again result: ${startAgainRes.intentStatus}`);

    await logSection('Step 6: Start Shift Next Day');
    const startNextDayRes = await handleStartShift(
        { id: 'sim-start-next', actorId: bot.id, type: IntentType.INTENT_START_SHIFT, params: {}, priority: 1 } as any,
        { id: bot.id, name: bot.name, frozen: false, dead: false } as any,
        (await prisma.agentState.findUnique({ where: { actorId: bot.id } })) as any,
        bot.wallet as any,
        1500,
        BigInt(Date.now())
    );
    await log(`Start next day result: ${startNextDayRes.intentStatus}`);

    await logSection('Success');
    await log(`Report: ${SIM_REPORT_FILE}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

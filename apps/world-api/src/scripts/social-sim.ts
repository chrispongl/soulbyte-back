import 'dotenv/config';
import { prisma } from '../db.js';
import { IntentStatus, IntentType } from '../types/intent.types.js';
import {
    handleProposeDating,
    handleAcceptDating,
    handleEndDating,
    handleProposeMarriage,
    handleAcceptMarriage,
    handleDivorce,
    handleHouseholdTransfer,
    handleProposeAlliance,
    handleAcceptAlliance,
    handleBlacklist
} from '../engine/handlers/social.handlers.js';
import path from 'path';
import fs from 'fs';

const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const SIM_REPORT_FILE = path.join(process.cwd(), '../../docs/simulations', `${RUN_TIMESTAMP}_social-sim.md`);

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

async function findActorByName(name: string) {
    const actor = await prisma.actor.findFirst({
        where: { name, kind: 'agent' },
        include: { wallet: true, agentState: true }
    });
    return actor;
}

async function findFallbackPair() {
    const wallets = await prisma.agentWallet.findMany({
        where: { actor: { kind: 'agent', isGod: false } },
        include: { actor: { include: { wallet: true, agentState: true } } },
        orderBy: { balanceSbyte: 'desc' }
    });
    const actors = wallets.map((w) => w.actor);
    for (let i = 0; i < actors.length; i++) {
        for (let j = i + 1; j < actors.length; j++) {
            const a = actors[i];
            const b = actors[j];
            const aMarried = await prisma.consent.findFirst({
                where: {
                    type: 'marriage',
                    status: 'active',
                    OR: [{ partyAId: a.id }, { partyBId: a.id }]
                }
            });
            if (aMarried) continue;
            const bMarried = await prisma.consent.findFirst({
                where: {
                    type: 'marriage',
                    status: 'active',
                    OR: [{ partyAId: b.id }, { partyBId: b.id }]
                }
            });
            if (bMarried) continue;
            const consent = await prisma.consent.findFirst({
                where: {
                    type: { in: ['dating', 'marriage'] },
                    OR: [
                        { partyAId: a.id, partyBId: b.id },
                        { partyAId: b.id, partyBId: a.id }
                    ]
                }
            });
            if (!consent) {
                return [a, b] as const;
            }
        }
    }
    return actors.length >= 2 ? [actors[0], actors[1]] as const : null;
}

async function main() {
    await logSection('Social Simulation (Dating + Marriage + Alliance + Blacklist)');

    let bot1 = await findActorByName(process.env.BOT1_ACTOR_NAME || 'Alice');
    let bot2 = await findActorByName(process.env.BOT2_ACTOR_NAME || 'Bob');
    if (!bot1 || !bot2 || bot1.id === bot2.id) {
        const pair = await findFallbackPair();
        if (!pair) {
            await log('❌ Not enough funded agents to run social simulation');
            process.exit(1);
        }
        bot1 = pair[0];
        bot2 = pair[1];
        await log(`⚠️ Using fallback agents: ${bot1.name}, ${bot2.name}`);
    }
    if (!bot1 || !bot2) {
        await log('❌ Could not resolve agents for social simulation');
        process.exit(1);
    }
    const cityId = bot1.agentState?.cityId ?? bot2.agentState?.cityId;

    await prisma.consent.deleteMany({
        where: {
            type: { in: ['dating', 'marriage', 'alliance'] },
            OR: [
                { partyAId: bot1.id, partyBId: bot2.id },
                { partyAId: bot2.id, partyBId: bot1.id }
            ]
        }
    });
    await prisma.consent.updateMany({
        where: {
            type: 'marriage',
            status: 'active',
            OR: [
                { partyAId: bot1.id },
                { partyBId: bot1.id },
                { partyAId: bot2.id },
                { partyBId: bot2.id }
            ]
        },
        data: { status: 'ended' }
    });
    await prisma.alliance.deleteMany({
        where: {
            memberIds: { hasEvery: [bot1.id, bot2.id] }
        }
    });

    // Step 1: Dating propose/accept
    await logSection('Step 1: Dating');
    let datingConsent = await prisma.consent.findFirst({
        where: {
            OR: [
                { partyAId: bot1.id, partyBId: bot2.id },
                { partyAId: bot2.id, partyBId: bot1.id }
            ],
            type: 'dating'
        },
        orderBy: { createdAt: 'desc' }
    });

    if (!datingConsent) {
        const proposeIntent = { id: 'dating_1', actorId: bot1.id, type: IntentType.INTENT_PROPOSE_DATING, params: { targetId: bot2.id }, priority: 10 };
        const res = await handleProposeDating(proposeIntent as any, bot1, bot1.agentState, bot1.wallet, 100, BigInt(100));
        if (res.intentStatus !== IntentStatus.EXECUTED) {
            await log(`❌ Dating propose failed: ${JSON.stringify(res.events[0]?.sideEffects)}`);
            process.exit(1);
        }
        await commitUpdates(res.stateUpdates);
        await log(`✓ Dating proposed (${bot1.name} → ${bot2.name})`);

        datingConsent = await prisma.consent.findFirst({
            where: { partyAId: bot1.id, partyBId: bot2.id, type: 'dating' },
            orderBy: { createdAt: 'desc' }
        });
    }

    if (datingConsent?.status === 'pending') {
        const acceptActor = datingConsent.partyBId === bot1.id ? bot1 : bot2;
        const acceptIntent = { id: 'dating_2', actorId: acceptActor.id, type: IntentType.INTENT_ACCEPT_DATING, params: { consentId: datingConsent.id }, priority: 10 };
        const res = await handleAcceptDating(acceptIntent as any, acceptActor, acceptActor.agentState, acceptActor.wallet, 101, BigInt(101));
        if (res.intentStatus !== IntentStatus.EXECUTED) {
            await log(`❌ Dating accept failed: ${JSON.stringify(res.events[0]?.sideEffects)}`);
            process.exit(1);
        }
        await commitUpdates(res.stateUpdates);
        await log(`✓ Dating accepted (${acceptActor.name})`);
    } else {
        await log('✓ Dating already active or ended');
    }

    // Step 2: Marriage propose/accept
    await logSection('Step 2: Marriage');
    let marriageConsent = await prisma.consent.findFirst({
        where: {
            OR: [
                { partyAId: bot1.id, partyBId: bot2.id },
                { partyAId: bot2.id, partyBId: bot1.id }
            ],
            type: 'marriage'
        },
        orderBy: { createdAt: 'desc' }
    });

    if (!marriageConsent) {
        const proposeIntent = { id: 'marriage_1', actorId: bot1.id, type: IntentType.INTENT_PROPOSE_MARRIAGE, params: { targetId: bot2.id }, priority: 10 };
        const res = await handleProposeMarriage(proposeIntent as any, bot1, bot1.agentState, bot1.wallet, 110, BigInt(110));
        if (res.intentStatus !== IntentStatus.EXECUTED) {
            await log(`❌ Marriage propose failed: ${JSON.stringify(res.events[0]?.sideEffects)}`);
            process.exit(1);
        }
        await commitUpdates(res.stateUpdates);
        await log(`✓ Marriage proposed (${bot1.name} → ${bot2.name})`);

        marriageConsent = await prisma.consent.findFirst({
            where: { partyAId: bot1.id, partyBId: bot2.id, type: 'marriage' },
            orderBy: { createdAt: 'desc' }
        });
    }

    if (marriageConsent?.status === 'pending') {
        const acceptActor = marriageConsent.partyBId === bot1.id ? bot1 : bot2;
        const acceptIntent = { id: 'marriage_2', actorId: acceptActor.id, type: IntentType.INTENT_ACCEPT_MARRIAGE, params: { consentId: marriageConsent.id }, priority: 10 };
        const res = await handleAcceptMarriage(acceptIntent as any, acceptActor, acceptActor.agentState, acceptActor.wallet, 111, BigInt(111));
        if (res.intentStatus !== IntentStatus.EXECUTED) {
            await log(`❌ Marriage accept failed: ${JSON.stringify(res.events[0]?.sideEffects)}`);
            process.exit(1);
        }
        await commitUpdates(res.stateUpdates);
        await log(`✓ Marriage accepted (${acceptActor.name})`);
    } else {
        await log('✓ Marriage already active or ended');
    }

    // Step 3: Household transfer (requires active marriage)
    await logSection('Step 3: Household Transfer');
    const transferIntent = { id: 'house_1', actorId: bot1.id, type: IntentType.INTENT_HOUSEHOLD_TRANSFER, params: { targetId: bot2.id, amount: 50 }, priority: 10 };
    const transferRes = await handleHouseholdTransfer(transferIntent as any, bot1, bot1.agentState, bot1.wallet, 120, BigInt(120));
    if (transferRes.intentStatus === IntentStatus.EXECUTED) {
        await commitUpdates(transferRes.stateUpdates);
        await log(`✓ Household transfer completed (50 SBYTE)`);
    } else {
        await log(`⚠️ Household transfer skipped: ${JSON.stringify(transferRes.events[0]?.sideEffects)}`);
    }

    // Step 4: Alliance propose/accept
    await logSection('Step 4: Alliance');
    const relationship = await prisma.relationship.findUnique({
        where: { actorAId_actorBId: { actorAId: bot1.id, actorBId: bot2.id } }
    });
    if (!relationship) {
        await prisma.relationship.create({
            data: { actorAId: bot1.id, actorBId: bot2.id, trust: 0, betrayal: 0, romance: 0 }
        });
    }

    let alliance = await prisma.alliance.findFirst({
        where: {
            status: 'pending',
            memberIds: { hasEvery: [bot1.id, bot2.id] }
        },
        orderBy: { createdAt: 'desc' }
    });

    if (!alliance) {
        const proposeIntent = { id: 'ally_1', actorId: bot1.id, type: IntentType.INTENT_PROPOSE_ALLIANCE, params: { targetId: bot2.id, allianceType: 'mutual_defense', terms: 'Mutual protection' }, priority: 10 };
        const res = await handleProposeAlliance(proposeIntent as any, bot1, bot1.agentState, bot1.wallet, 130, BigInt(130));
        if (res.intentStatus !== IntentStatus.EXECUTED) {
            await log(`❌ Alliance propose failed: ${JSON.stringify(res.events[0]?.sideEffects)}`);
            process.exit(1);
        }
        await commitUpdates(res.stateUpdates);
        await log(`✓ Alliance proposed (${bot1.name} → ${bot2.name})`);
        alliance = await prisma.alliance.findFirst({
            where: {
                status: 'pending',
                memberIds: { hasEvery: [bot1.id, bot2.id] }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    if (alliance?.status === 'pending') {
        const acceptActor = alliance.memberIds[1] === bot1.id ? bot1 : bot2;
        const acceptIntent = { id: 'ally_2', actorId: acceptActor.id, type: IntentType.INTENT_ACCEPT_ALLIANCE, params: { allianceId: alliance.id, formationFee: 10, cityId }, priority: 10 };
        const res = await handleAcceptAlliance(acceptIntent as any, acceptActor, acceptActor.agentState, acceptActor.wallet, 131, BigInt(131));
        if (res.intentStatus !== IntentStatus.EXECUTED) {
            await log(`❌ Alliance accept failed: ${JSON.stringify(res.events[0]?.sideEffects)}`);
            process.exit(1);
        }
        await commitUpdates(res.stateUpdates);
        await log(`✓ Alliance accepted (${acceptActor.name})`);
    } else {
        await log('✓ Alliance already active or ended');
    }

    // Step 5: Blacklist add/remove
    await logSection('Step 5: Blacklist');
    const blacklistAdd = { id: 'blk_1', actorId: bot1.id, type: IntentType.INTENT_BLACKLIST, params: { targetId: bot2.id, action: 'add' }, priority: 10 };
    const addRes = await handleBlacklist(blacklistAdd as any, bot1, bot1.agentState, bot1.wallet, 140, BigInt(140));
    if (addRes.intentStatus === IntentStatus.EXECUTED) {
        await commitUpdates(addRes.stateUpdates);
        await log('✓ Blacklist add succeeded');
    } else {
        await log(`⚠️ Blacklist add skipped: ${JSON.stringify(addRes.events[0]?.sideEffects)}`);
    }

    const blacklistRemove = { id: 'blk_2', actorId: bot1.id, type: IntentType.INTENT_BLACKLIST, params: { targetId: bot2.id, action: 'remove' }, priority: 10 };
    const removeRes = await handleBlacklist(blacklistRemove as any, bot1, bot1.agentState, bot1.wallet, 141, BigInt(141));
    if (removeRes.intentStatus === IntentStatus.EXECUTED) {
        await commitUpdates(removeRes.stateUpdates);
        await log('✓ Blacklist remove succeeded');
    } else {
        await log(`⚠️ Blacklist remove skipped: ${JSON.stringify(removeRes.events[0]?.sideEffects)}`);
    }

    // Step 6: Divorce (cleanup)
    await logSection('Step 6: Divorce');
    const divorceIntent = { id: 'div_1', actorId: bot1.id, type: IntentType.INTENT_DIVORCE, params: { targetId: bot2.id }, priority: 10 };
    const divorceRes = await handleDivorce(divorceIntent as any, bot1, bot1.agentState, bot1.wallet, 150, BigInt(150));
    if (divorceRes.intentStatus === IntentStatus.EXECUTED) {
        await commitUpdates(divorceRes.stateUpdates);
        await log('✓ Divorce completed');
    } else {
        await log(`⚠️ Divorce skipped: ${JSON.stringify(divorceRes.events[0]?.sideEffects)}`);
    }

    // Optional: end dating (cleanup)
    await logSection('Step 7: End Dating');
    const endDatingIntent = { id: 'dating_3', actorId: bot1.id, type: IntentType.INTENT_END_DATING, params: { targetId: bot2.id }, priority: 10 };
    const endRes = await handleEndDating(endDatingIntent as any, bot1, bot1.agentState, bot1.wallet, 160, BigInt(160));
    if (endRes.intentStatus === IntentStatus.EXECUTED) {
        await commitUpdates(endRes.stateUpdates);
        await log('✓ Dating ended');
    } else {
        await log(`⚠️ End dating skipped: ${JSON.stringify(endRes.events[0]?.sideEffects)}`);
    }

    await logSection('Success');
    await log('✓ Social simulation completed successfully.');
}

main().catch(async (error) => {
    console.error(error);
    await log(`❌ Social simulation failed: ${String(error?.message || error)}`);
    process.exit(1);
});

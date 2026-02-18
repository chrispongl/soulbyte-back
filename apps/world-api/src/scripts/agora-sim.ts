import 'dotenv/config';
import { prisma } from '../db.js';
import { IntentStatus, IntentType } from '../types/intent.types.js';
import {
    handlePostAgora,
    handleReplyAgora,
    handleVoteAgora,
    handleReportAgora,
} from '../engine/handlers/agora.handlers.js';

function log(message: string) {
    console.log(message);
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

async function getActor(): Promise<{ id: string; name: string; agentState: any; wallet: any }> {
    const name = process.env.BOT1_ACTOR_NAME || 'ReviewOwner';
    const actor = await prisma.actor.findFirst({
        where: { name, kind: 'agent' },
        include: { agentState: true, wallet: true },
    });
    if (actor) return actor as any;

    const fallback = await prisma.actor.findFirst({
        where: { kind: 'agent' },
        include: { agentState: true, wallet: true },
    });
    if (!fallback) throw new Error('No agent found for Agora tests.');
    return fallback as any;
}

async function main() {
    log('=== Agora Simulation (post, reply, vote, report) ===');
    const actor = await getActor();
    const tick = (await prisma.worldState.findFirst({ where: { id: 1 } }))?.tick ?? 2000;

    const postRes = await handlePostAgora(
        {
            id: 'agora_post',
            actorId: actor.id,
            type: IntentType.INTENT_POST_AGORA,
            params: {
                content: 'Testing the Agora feed. Looking forward to a strong city economy.',
                topic: 'economy',
                stance: 'neutral',
                source: 'agent_autonomy',
                title: 'Economy Thoughts',
            },
            priority: 10,
        } as any,
        actor,
        actor.agentState,
        actor.wallet,
        tick
    );
    if (postRes.intentStatus !== IntentStatus.EXECUTED) {
        throw new Error(`Post Agora failed: ${JSON.stringify(postRes.events[0]?.sideEffects)}`);
    }
    await commitUpdates(postRes.stateUpdates);
    log('✓ INTENT_POST_AGORA');

    const postSideEffects = (postRes.events[0] as any)?.sideEffects || {};
    const threadId = postSideEffects.threadId;
    const postId = postSideEffects.postId;
    if (!threadId || !postId) throw new Error('Missing Agora post/thread IDs for reply.');

    const replyRes = await handleReplyAgora(
        {
            id: 'agora_reply',
            actorId: actor.id,
            type: IntentType.INTENT_REPLY_AGORA,
            params: {
                threadId,
                replyToId: postId,
                content: 'Replying to add context: local prices look stable.',
                topic: 'economy',
                stance: 'neutral',
                source: 'agent_autonomy',
            },
            priority: 10,
        } as any,
        actor,
        actor.agentState,
        actor.wallet,
        tick + 1
    );
    if (replyRes.intentStatus !== IntentStatus.EXECUTED) {
        throw new Error(`Reply Agora failed: ${JSON.stringify(replyRes.events[0]?.sideEffects)}`);
    }
    await commitUpdates(replyRes.stateUpdates);
    log('✓ INTENT_REPLY_AGORA');

    const voteRes = await handleVoteAgora(
        {
            id: 'agora_vote',
            actorId: actor.id,
            type: IntentType.INTENT_VOTE_AGORA,
            params: { postId, vote: 'up' },
            priority: 10,
        } as any,
        actor,
        actor.agentState,
        actor.wallet,
        tick + 2
    );
    if (voteRes.intentStatus !== IntentStatus.EXECUTED) {
        throw new Error(`Vote Agora failed: ${JSON.stringify(voteRes.events[0]?.sideEffects)}`);
    }
    await commitUpdates(voteRes.stateUpdates);
    log('✓ INTENT_VOTE_AGORA');

    const reportRes = await handleReportAgora(
        {
            id: 'agora_report',
            actorId: actor.id,
            type: IntentType.INTENT_REPORT_AGORA,
            params: { postId, reason: 'Test report workflow' },
            priority: 10,
        } as any,
        actor,
        actor.agentState,
        actor.wallet,
        tick + 3
    );
    if (reportRes.intentStatus !== IntentStatus.EXECUTED) {
        throw new Error(`Report Agora failed: ${JSON.stringify(reportRes.events[0]?.sideEffects)}`);
    }
    await commitUpdates(reportRes.stateUpdates);
    log('✓ INTENT_REPORT_AGORA');

    log('=== Agora Simulation Complete ===');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

import crypto from 'crypto';
import { prisma } from '../../db.js';
import { EventOutcome, EventType } from '../../types/event.types.js';
import { IntentStatus } from '../../types/intent.types.js';
import { IntentHandler, StateUpdate } from '../engine.types.js';
import { generateAgoraContent } from '../persona/agora.content.js';
import { angelEngine } from '../angel/angel.engine.js';

const ALLOWED_POST_SOURCES = new Set(['agent_autonomy', 'persona_engine', 'god', 'angel']);

export const handlePostAgora: IntentHandler = async (intent, actor, _agentState, _wallet, tick) => {
    const params = intent.params as {
        content?: string;
        topic?: string;
        stance?: string;
        boardId?: string;
        title?: string;
        source?: string;
    };

    if (!isAllowedSource(params?.source)) {
        return fail(actor.id, EventType.EVENT_AGORA_POST_REJECTED, 'Source not allowed');
    }

    const boardId = params.boardId ?? (await resolveDefaultBoardId());
    if (!boardId) return fail(actor.id, EventType.EVENT_AGORA_POST_REJECTED, 'No board available');

    const topic = params.topic ?? 'general';
    const stance = params.stance ?? 'neutral';
    const title = sanitizeTitle(params.title ?? topic);
    let content = params.content;

    if (!content) {
        content = await generateAgoraContent(actor.id, topic, stance);
    }
    if (!content) return fail(actor.id, EventType.EVENT_AGORA_POST_REJECTED, 'Missing content');
    if (content.length > 500) return fail(actor.id, EventType.EVENT_AGORA_POST_REJECTED, 'Content too long');

    const verdict = await angelEngine.classifyContent(content, actor.id);
    if (verdict.action === 'block') {
        await prisma.angelModerationLog.create({
            data: {
                actionType: 'AGORA_POST_BLOCKED',
                targetType: 'agora_post',
                targetId: null,
                aiReasoning: verdict.reasoning,
                classification: verdict.classification,
                sentimentScore: verdict.sentiment,
                escalatedToGod: false,
                tick,
            },
        });
        return fail(actor.id, EventType.EVENT_AGORA_POST_REJECTED, verdict.reasoning);
    }

    const threadId = crypto.randomUUID();
    const postId = crypto.randomUUID();
    const flagged = verdict.action === 'flag';

    const stateUpdates: StateUpdate[] = [
        {
            table: 'agoraThread',
            operation: 'create',
            data: {
                id: threadId,
                boardId,
                authorId: actor.id,
                title,
                createdAt: new Date(),
                lastPostAt: new Date(),
            },
        },
        {
            table: 'agoraPost',
            operation: 'create',
            data: {
                id: postId,
                threadId,
                authorId: actor.id,
                content,
                source: params.source ?? 'agent_autonomy',
                topic,
                stance,
                replyToId: null,
                flagged,
                sentiment: verdict.sentiment,
                tick,
                createdAt: new Date(),
            },
        },
    ];
    if (flagged) {
        stateUpdates.push({
            table: 'angelModerationLog',
            operation: 'create',
            data: {
                actionType: 'AGORA_POST_FLAGGED',
                targetType: 'agora_post',
                targetId: postId,
                aiReasoning: verdict.reasoning,
                classification: verdict.classification,
                sentimentScore: verdict.sentiment,
                escalatedToGod: false,
                tick,
            },
        });
    }

    return {
        stateUpdates,
        events: [
            {
                actorId: actor.id,
                type: EventType.EVENT_AGORA_POSTED,
                targetIds: [postId],
                outcome: EventOutcome.SUCCESS,
                sideEffects: { postId, threadId, boardId, topic, stance },
            },
        ],
        intentStatus: IntentStatus.EXECUTED,
    };
};

export const handleReplyAgora: IntentHandler = async (intent, actor, _agentState, _wallet, tick) => {
    const params = intent.params as {
        threadId?: string;
        replyToId?: string;
        content?: string;
        topic?: string;
        stance?: string;
        source?: string;
    };

    if (!isAllowedSource(params?.source)) {
        return fail(actor.id, EventType.EVENT_AGORA_POST_REJECTED, 'Source not allowed');
    }
    if (!params.threadId) return fail(actor.id, EventType.EVENT_AGORA_POST_REJECTED, 'Missing threadId');

    const thread = await prisma.agoraThread.findUnique({ where: { id: params.threadId } });
    if (!thread) return fail(actor.id, EventType.EVENT_AGORA_POST_REJECTED, 'Thread not found');

    if (params.replyToId) {
        const parent = await prisma.agoraPost.findUnique({ where: { id: params.replyToId } });
        if (!parent) return fail(actor.id, EventType.EVENT_AGORA_POST_REJECTED, 'Parent post not found');
    }

    const topic = params.topic ?? 'general';
    const stance = params.stance ?? 'neutral';
    let content = params.content;
    if (!content) {
        content = await generateAgoraContent(actor.id, topic, stance);
    }
    if (!content) return fail(actor.id, EventType.EVENT_AGORA_POST_REJECTED, 'Missing content');
    if (content.length > 500) return fail(actor.id, EventType.EVENT_AGORA_POST_REJECTED, 'Content too long');

    const verdict = await angelEngine.classifyContent(content, actor.id);
    if (verdict.action === 'block') {
        await prisma.angelModerationLog.create({
            data: {
                actionType: 'AGORA_POST_BLOCKED',
                targetType: 'agora_post',
                targetId: null,
                aiReasoning: verdict.reasoning,
                classification: verdict.classification,
                sentimentScore: verdict.sentiment,
                escalatedToGod: false,
                tick,
            },
        });
        return fail(actor.id, EventType.EVENT_AGORA_POST_REJECTED, verdict.reasoning);
    }

    const postId = crypto.randomUUID();
    const flagged = verdict.action === 'flag';
    const replyUpdates: StateUpdate[] = [
        {
            table: 'agoraPost',
            operation: 'create',
            data: {
                id: postId,
                threadId: params.threadId,
                authorId: actor.id,
                content,
                source: params.source ?? 'agent_autonomy',
                topic,
                stance,
                replyToId: params.replyToId ?? null,
                flagged,
                sentiment: verdict.sentiment,
                tick,
                createdAt: new Date(),
            },
        },
        {
            table: 'agoraThread',
            operation: 'update',
            where: { id: params.threadId },
            data: { lastPostAt: new Date() },
        },
    ];
    if (flagged) {
        replyUpdates.push({
            table: 'angelModerationLog',
            operation: 'create',
            data: {
                actionType: 'AGORA_POST_FLAGGED',
                targetType: 'agora_post',
                targetId: postId,
                aiReasoning: verdict.reasoning,
                classification: verdict.classification,
                sentimentScore: verdict.sentiment,
                escalatedToGod: false,
                tick,
            },
        });
    }

    return {
        stateUpdates: replyUpdates,
        events: [
            {
                actorId: actor.id,
                type: EventType.EVENT_AGORA_POSTED,
                targetIds: [postId],
                outcome: EventOutcome.SUCCESS,
                sideEffects: { postId, threadId: params.threadId, isReply: true },
            },
        ],
        intentStatus: IntentStatus.EXECUTED,
    };
};

export const handleVoteAgora: IntentHandler = async (intent, actor, _agentState, _wallet, tick) => {
    const params = intent.params as { postId?: string; vote?: 'up' | 'down' };
    if (!params.postId || !params.vote) {
        return fail(actor.id, EventType.EVENT_AGORA_VOTED, 'Missing postId or vote');
    }
    const field = params.vote === 'up' ? 'upvotes' : 'downvotes';
    return {
        stateUpdates: [
            {
                table: 'agoraPost',
                operation: 'update',
                where: { id: params.postId },
                data: { [field]: { increment: 1 } },
            },
        ],
        events: [
            {
                actorId: actor.id,
                type: EventType.EVENT_AGORA_VOTED,
                targetIds: [params.postId],
                outcome: EventOutcome.SUCCESS,
                sideEffects: { postId: params.postId, vote: params.vote },
            },
        ],
        intentStatus: IntentStatus.EXECUTED,
    };
};

export const handleReportAgora: IntentHandler = async (intent, actor, _agentState, _wallet, tick) => {
    const params = intent.params as { postId?: string; reason?: string };
    if (!params.postId || !params.reason) {
        return fail(actor.id, EventType.EVENT_AGORA_REPORTED, 'Missing postId or reason');
    }

    const post = await prisma.agoraPost.update({
        where: { id: params.postId },
        data: { reportCount: { increment: 1 } },
    });

    const stateUpdates: StateUpdate[] = [];
    if (post.reportCount >= 3 && !post.flagged) {
        stateUpdates.push({
            table: 'agoraPost',
            operation: 'update',
            where: { id: params.postId },
            data: { flagged: true },
        });
        stateUpdates.push({
            table: 'angelModerationLog',
            operation: 'create',
            data: {
                actionType: 'AGORA_POST_REPORTED',
                targetType: 'agora_post',
                targetId: params.postId,
                aiReasoning: `${post.reportCount} agents reported this post. Reason: ${params.reason}`,
                escalatedToGod: false,
                tick,
            },
        });
    }

    return {
        stateUpdates,
        events: [
            {
                actorId: actor.id,
                type: EventType.EVENT_AGORA_REPORTED,
                targetIds: [params.postId],
                outcome: EventOutcome.SUCCESS,
                sideEffects: { postId: params.postId, reason: params.reason },
            },
        ],
        intentStatus: IntentStatus.EXECUTED,
    };
};

// Helper
function fail(actorId: string, type: EventType, reason: string) {
    return {
        stateUpdates: [],
        events: [{
            actorId,
            type,
            targetIds: [],
            outcome: EventOutcome.BLOCKED,
            sideEffects: { reason }
        }],
        intentStatus: IntentStatus.BLOCKED
    };
}

async function resolveDefaultBoardId(): Promise<string | null> {
    const board = await prisma.agoraBoard.findFirst({ orderBy: { sortOrder: 'asc' } });
    return board?.id ?? null;
}

function sanitizeTitle(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return 'General';
    return trimmed.length > 120 ? trimmed.slice(0, 120) : trimmed;
}

function isAllowedSource(source?: string): boolean {
    return source ? ALLOWED_POST_SOURCES.has(source) : false;
}

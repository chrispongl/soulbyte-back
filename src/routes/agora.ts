import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db.js';

export async function agoraRoutes(app: FastifyInstance) {
    const fetchThreads = async (boardId: string, page: string, limit: string) => {
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);

        const threads = await prisma.agoraThread.findMany({
            where: { boardId },
            orderBy: { lastPostAt: 'desc' },
            skip: (pageNum - 1) * limitNum,
            take: limitNum,
            include: {
                author: { select: { id: true, name: true, reputation: true } },
                _count: { select: { posts: true } },
            },
        });

        const threadIds = threads.map((thread) => thread.id);
        const lastPosts = threadIds.length > 0
            ? await prisma.agoraPost.findMany({
                where: { threadId: { in: threadIds }, deleted: false },
                orderBy: { createdAt: 'desc' },
                distinct: ['threadId'],
                include: { author: { select: { name: true } } }
            })
            : [];
        const lastPostByThread = new Map(lastPosts.map((post) => [post.threadId, post]));

        return threads.map((thread) => {
            const lastPost = lastPostByThread.get(thread.id);
            return ({
                id: thread.id,
                boardId: thread.boardId,
                title: thread.title,
                authorId: thread.authorId,
                authorName: thread.author?.name ?? null,
                replyCount: Math.max((thread._count?.posts ?? 0) - 1, 0),
                viewCount: 0,
                lastPostAt: thread.lastPostAt,
                lastPostAuthorName: lastPost?.author?.name ?? null,
                pinned: thread.pinned,
                locked: thread.locked
            });
        });
    };

    app.get('/api/v1/agora/boards', async (_request: FastifyRequest, reply: FastifyReply) => {
        const boards = await prisma.agoraBoard.findMany({
            orderBy: { sortOrder: 'asc' },
            include: { _count: { select: { threads: true } } },
        });
        return reply.send(boards.map((board) => ({
            id: board.id,
            name: board.name,
            description: board.description ?? '',
            cityId: board.cityId,
            sortOrder: board.sortOrder,
        })));
    });

    app.get('/api/v1/agora/threads', async (request: FastifyRequest, reply: FastifyReply) => {
        const { boardId } = request.query as { boardId?: string };
        const { page = '1', limit = '20' } = request.query as { page?: string; limit?: string };
        if (!boardId) {
            return reply.code(400).send({ error: 'Missing boardId' });
        }
        const threads = await fetchThreads(boardId, page, limit);
        return reply.send({ threads });
    });

    app.get('/api/v1/agora/threads/:boardId', async (request: FastifyRequest, reply: FastifyReply) => {
        const { boardId } = request.params as { boardId: string };
        const { page = '1', limit = '20' } = request.query as { page?: string; limit?: string };
        const threads = await fetchThreads(boardId, page, limit);
        return reply.send(threads);
    });

    app.get('/api/v1/agora/thread/:threadId/posts', async (request: FastifyRequest, reply: FastifyReply) => {
        const { threadId } = request.params as { threadId: string };
        const { page = '1', limit = '50' } = request.query as { page?: string; limit?: string };
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);

        const posts = await prisma.agoraPost.findMany({
            where: { threadId, deleted: false },
            orderBy: { createdAt: 'asc' },
            skip: (pageNum - 1) * limitNum,
            take: limitNum,
            include: {
                author: { select: { id: true, name: true, reputation: true } },
            },
        });
        return reply.send(posts.map((post) => ({
            id: post.id,
            threadId: post.threadId,
            authorId: post.authorId,
            authorName: post.author?.name ?? null,
            content: post.content,
            source: post.source,
            topic: post.topic,
            stance: post.stance,
            upvotes: post.upvotes,
            downvotes: post.downvotes,
            deleted: post.deleted,
            deletedReason: post.deletedReason ?? null,
            flagged: post.flagged,
            sentiment: post.sentiment ? Number(post.sentiment) : null,
            createdAt: post.createdAt
        })));
    });

    app.get('/api/v1/agora/recent', async (request: FastifyRequest, reply: FastifyReply) => {
        const { limit = '20' } = request.query as { limit?: string };
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);

        const posts = await prisma.agoraPost.findMany({
            where: { deleted: false },
            orderBy: { createdAt: 'desc' },
            take: limitNum,
            include: {
                author: { select: { id: true, name: true } },
                thread: { select: { id: true, title: true, boardId: true } },
            },
        });
        return reply.send({ posts });
    });

    app.get('/api/v1/agora/agent/:actorId', async (request: FastifyRequest, reply: FastifyReply) => {
        const { actorId } = request.params as { actorId: string };
        const { limit = '20' } = request.query as { limit?: string };
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);

        const posts = await prisma.agoraPost.findMany({
            where: { authorId: actorId, deleted: false },
            orderBy: { createdAt: 'desc' },
            take: limitNum,
            include: {
                thread: { select: { id: true, title: true } },
            },
        });
        return reply.send({ posts });
    });
}

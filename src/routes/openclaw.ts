import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db.js';
import { ethers } from 'ethers';
import { generateApiKey, getKeyPrefix, hashApiKey } from '../utils/api-key.js';
import { authenticateApiKey } from '../middleware/openclaw-auth.js';

type AuthLinkBody = {
    wallet_address?: string;
    signature?: string;
    message?: string;
    openclaw_instance_id?: string;
};

type AuthLinkWithKeyBody = {
    wallet_private_key?: string;
    openclaw_instance_id?: string;
};

export async function openclawRoutes(app: FastifyInstance) {
    app.post('/api/v1/auth/link', async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as AuthLinkBody;
        if (!body?.wallet_address || !body?.signature) {
            return reply.code(400).send({ error: 'wallet_address and signature are required' });
        }

        let walletAddress: string;
        try {
            walletAddress = ethers.getAddress(body.wallet_address);
        } catch {
            return reply.code(400).send({ error: 'Invalid wallet_address' });
        }

        const message = body.message || `Soulbyte OpenClaw Link: ${walletAddress}`;
        const recovered = ethers.verifyMessage(message, body.signature);
        if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
            return reply.code(401).send({ error: 'Invalid signature' });
        }

        const agentWallet = await prisma.agentWallet.findFirst({
            where: { walletAddress },
        });

        if (!agentWallet) {
            return reply.code(404).send({ error: 'No agent linked to this wallet' });
        }

        const actor = await prisma.actor.findUnique({
            where: { id: agentWallet.actorId },
            include: { agentState: { include: { city: true } } },
        });

        if (!actor) {
            return reply.code(404).send({ error: 'Actor not found for wallet' });
        }

        const apiKey = generateApiKey('sk_agent_');
        await prisma.apiKey.create({
            data: {
                keyHash: hashApiKey(apiKey),
                keyPrefix: getKeyPrefix(apiKey),
                actorId: actor.id,
                role: 'agent',
                permissions: ['read_state', 'submit_intent', 'wallet_ops'],
                openclawInstanceId: body.openclaw_instance_id || null,
            },
        });

        const host = request.headers.host || 'localhost';
        const protocol = request.protocol || 'http';
        const rpcEndpoint = `${protocol}://${host}/rpc/agent`;

        return reply.code(200).send({
            actor_id: actor.id,
            actor_name: actor.name,
            city: actor.agentState?.city?.name ?? null,
            api_key: apiKey,
            rpc_endpoint: rpcEndpoint,
        });
    });

    app.post('/api/v1/auth/link-with-key', async (request: FastifyRequest, reply: FastifyReply) => {
        const allowUnsafe =
            process.env.ALLOW_OPENCLAW_LINK_WITH_KEY === 'true' || process.env.NODE_ENV !== 'production';
        if (!allowUnsafe) {
            return reply.code(403).send({ error: 'Link-with-key is disabled' });
        }

        const body = request.body as AuthLinkWithKeyBody;
        if (!body?.wallet_private_key) {
            return reply.code(400).send({ error: 'wallet_private_key is required' });
        }
        if (!body.wallet_private_key.match(/^(0x)?[0-9a-fA-F]{64}$/)) {
            return reply.code(400).send({ error: 'Invalid private key format' });
        }

        const wallet = new ethers.Wallet(body.wallet_private_key);
        const walletAddress = wallet.address;

        const agentWallet = await prisma.agentWallet.findFirst({
            where: { walletAddress },
        });

        if (!agentWallet) {
            return reply.code(404).send({ error: 'No agent linked to this wallet' });
        }

        const actor = await prisma.actor.findUnique({
            where: { id: agentWallet.actorId },
            include: { agentState: { include: { city: true } } },
        });

        if (!actor) {
            return reply.code(404).send({ error: 'Actor not found for wallet' });
        }

        const apiKey = generateApiKey('sk_agent_');
        await prisma.apiKey.create({
            data: {
                keyHash: hashApiKey(apiKey),
                keyPrefix: getKeyPrefix(apiKey),
                actorId: actor.id,
                role: 'agent',
                permissions: ['read_state', 'submit_intent', 'wallet_ops'],
                openclawInstanceId: body.openclaw_instance_id || null,
            },
        });

        const host = request.headers.host || 'localhost';
        const protocol = request.protocol || 'http';
        const rpcEndpoint = `${protocol}://${host}/rpc/agent`;

        return reply.code(200).send({
            actor_id: actor.id,
            actor_name: actor.name,
            city: actor.agentState?.city?.name ?? null,
            api_key: apiKey,
            rpc_endpoint: rpcEndpoint,
        });
    });

    app.get('/api/v1/actors/:actorId/events', async (request: FastifyRequest, reply: FastifyReply) => {
        const auth = await authenticateApiKey(request.headers.authorization as string | undefined);
        if (!auth) return reply.code(401).send({ error: 'Unauthorized' });

        const { actorId } = request.params as { actorId: string };
        if (auth.role === 'agent' && auth.actorId !== actorId) {
            return reply.code(403).send({ error: 'Forbidden' });
        }

        const { since_tick, limit = '20' } = request.query as { since_tick?: string; limit?: string };
        const take = Math.min(parseInt(limit, 10) || 20, 100);

        const events = await prisma.event.findMany({
            where: {
                actorId,
                tick: since_tick ? { gt: parseInt(since_tick, 10) } : undefined,
            },
            orderBy: { tick: 'desc' },
            take,
        });

        const worldState = await prisma.worldState.findFirst({ where: { id: 1 } });

        return reply.code(200).send({
            events: events.map((event) => ({
                event_id: event.eventId,
                type: event.type,
                tick: event.tick,
                created_at: event.createdAt,
                outcome: event.outcome,
                side_effects: event.sideEffects,
            })),
            latest_tick: worldState?.tick ?? 0,
            has_more: events.length === take,
        });
    });
}

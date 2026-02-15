/**
 * Wallet Routes
 * API endpoints for wallet management, deposits, and withdrawals
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { WalletService } from '../services/wallet.service.js';
import { WithdrawalService } from '../services/withdrawal.service.js';
import { BlockchainListenerService } from '../services/blockchain-listener.service.js';
import { isRateLimitError, isRetryableRpcError } from '../utils/rpc-retry.js';
import { prisma } from '../db.js';
import { ethers } from 'ethers';

/**
 * Wallet routes plugin
 */
export async function walletRoutes(app: FastifyInstance): Promise<void> {
    const walletService = new WalletService();
    const withdrawalService = new WithdrawalService();

    /**
     * Import wallet for agent
     * POST /api/v1/wallet/import
     */
    app.post('/api/v1/wallet/import', async (request: FastifyRequest, reply: FastifyReply) => {
        const { actor_id, private_key } = request.body as {
            actor_id: string;
            private_key: string;
        };

        if (!actor_id || !private_key) {
            return reply.code(400).send({ error: 'actor_id and private_key are required' });
        }

        try {
            // Verify actor exists
            const actor = await prisma.actor.findUnique({
                where: { id: actor_id },
            });
            if (!actor) {
                return reply.code(404).send({ error: 'Agent not found' });
            }

            const result = await walletService.importWallet(actor_id, private_key);

            // Refresh blockchain listener to monitor new wallet
            if (process.env.ENABLE_BLOCKCHAIN_LISTENER === 'true') {
                const listener = new BlockchainListenerService();
                await listener.refreshWalletList();
            }

            return reply.send({
                ok: true,
                address: result.address,
            });
        } catch (error: any) {
            console.error('Error importing wallet:', error);
            if (isRetryableRpcError(error)) {
                const statusCode = isRateLimitError(error) ? 429 : 503;
                return reply.code(statusCode).send({
                    error: 'RPC temporarily unavailable',
                    message: 'Wallet import failed after RPC retries. Try again later.',
                });
            }
            return reply.code(400).send({ error: error.message });
        }
    });

    /**
     * Get wallet info for agent
     * GET /api/v1/wallet/:actor_id
     */
    app.get('/api/v1/wallet/:actor_id', async (request: FastifyRequest, reply: FastifyReply) => {
        const { actor_id } = request.params as { actor_id: string };

        try {
            const wallet = await walletService.getWalletInfo(actor_id);

            if (!wallet) {
                return reply.code(404).send({ error: 'No wallet linked to this agent' });
            }

            return reply.send({
                ok: true,
                wallet: {
                    address: wallet.walletAddress,
                    balanceMon: wallet.balanceMon.toString(),
                    balanceSbyte: wallet.balanceSbyte.toString(),
                    lastSyncedAt: wallet.lastSyncedAt,
                    lastSyncedBlock: wallet.lastSyncedBlock?.toString(),
                },
            });
        } catch (error: any) {
            console.error('Error getting wallet:', error);
            return reply.code(500).send({ error: error.message });
        }
    });

    /**
     * Request withdrawal from agent
     * POST /api/v1/wallet/:actor_id/withdraw
     */
    app.post('/api/v1/wallet/:actor_id/withdraw', async (request: FastifyRequest, reply: FastifyReply) => {
        const { actor_id } = request.params as { actor_id: string };
        const { amount, recipient_address } = request.body as {
            amount: string;
            recipient_address: string;
        };

        if (!amount || !recipient_address) {
            return reply.code(400).send({ error: 'amount and recipient_address are required' });
        }

        try {
            try {
                ethers.parseUnits(amount, 18);
            } catch {
                return reply.code(400).send({ error: 'amount must be a valid decimal string' });
            }

            const result = await withdrawalService.requestWithdrawal(
                actor_id,
                recipient_address,
                amount
            );

            return reply.send({
                ok: true,
                requestId: result.requestId,
                status: result.status,
                expiresAt: result.expiresAt,
                message: 'Withdrawal request submitted. Agent will process it.',
            });
        } catch (error: any) {
            console.error('Error requesting withdrawal:', error);
            return reply.code(400).send({ error: error.message });
        }
    });

    /**
     * Get transaction history for agent
     * GET /api/v1/wallet/:actor_id/transactions
     */
    app.get('/api/v1/wallet/:actor_id/transactions', async (request: FastifyRequest, reply: FastifyReply) => {
        const { actor_id } = request.params as { actor_id: string };
        const { limit = '20', offset = '0' } = request.query as {
            limit?: string;
            offset?: string;
        };

        try {
            const transactions = await prisma.onchainTransaction.findMany({
                where: {
                    OR: [
                        { fromActorId: actor_id },
                        { toActorId: actor_id },
                    ],
                },
                orderBy: { createdAt: 'desc' },
                take: Number(limit),
                skip: Number(offset),
                select: {
                    id: true,
                    txHash: true,
                    blockNumber: true,
                    fromAddress: true,
                    toAddress: true,
                    amount: true,
                    txType: true,
                    platformFee: true,
                    cityFee: true,
                    status: true,
                    confirmedAt: true,
                    createdAt: true,
                },
            });

            return reply.send({
                ok: true,
                transactions: transactions.map(tx => ({
                    ...tx,
                    blockNumber: tx.blockNumber.toString(),
                    amount: tx.amount.toString(),
                    platformFee: tx.platformFee.toString(),
                    cityFee: tx.cityFee.toString(),
                })),
            });
        } catch (error: any) {
            console.error('Error getting transactions:', error);
            return reply.code(500).send({ error: error.message });
        }
    });

    /**
     * Get pending withdrawal requests for agent
     * GET /api/v1/wallet/:actor_id/withdrawals
     */
    app.get('/api/v1/wallet/:actor_id/withdrawals', async (request: FastifyRequest, reply: FastifyReply) => {
        const { actor_id } = request.params as { actor_id: string };

        try {
            const requests = await withdrawalService.getPendingRequests(actor_id);

            return reply.send({
                ok: true,
                withdrawals: requests.map(req => ({
                    id: req.id,
                    humanAddress: req.humanAddress,
                    amount: req.amount.toString(),
                    status: req.status,
                    expiresAt: req.expiresAt,
                    createdAt: req.createdAt,
                })),
            });
        } catch (error: any) {
            console.error('Error getting withdrawals:', error);
            return reply.code(500).send({ error: error.message });
        }
    });

    /**
     * Sync wallet balance (manual trigger)
     * POST /api/v1/wallet/:actor_id/sync
     */
    app.post('/api/v1/wallet/:actor_id/sync', async (request: FastifyRequest, reply: FastifyReply) => {
        const { actor_id } = request.params as { actor_id: string };

        try {
            await walletService.syncWalletBalances(actor_id);
            const wallet = await walletService.getWalletInfo(actor_id);

            return reply.send({
                ok: true,
                message: 'Balance synced',
                wallet: {
                    balanceMon: wallet?.balanceMon.toString(),
                    balanceSbyte: wallet?.balanceSbyte.toString(),
                    lastSyncedAt: wallet?.lastSyncedAt,
                },
            });
        } catch (error: any) {
            console.error('Error syncing wallet:', error);
            if (isRetryableRpcError(error)) {
                const statusCode = isRateLimitError(error) ? 429 : 503;
                return reply.code(statusCode).send({
                    error: 'RPC temporarily unavailable',
                    message: 'Balance sync failed after RPC retries. Try again later.',
                });
            }
            return reply.code(400).send({ error: error.message });
        }
    });
}

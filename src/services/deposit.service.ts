/**
 * Deposit Service
 * Handles incoming SBYTE and MON deposits to agent wallets
 */

import { prisma } from '../db.js';
import { CONTRACTS } from '../config/contracts.js';
import { ethers } from 'ethers';
import { Decimal } from 'decimal.js';
import { formatSbyteForLedger } from '../utils/amounts.js';

/**
 * Deposit Service class
 */
export class DepositService {

    /**
     * Process an incoming deposit
     * Called by BlockchainListenerService when transfer detected
     * @param txHash - Transaction hash
     * @param toAddress - Recipient wallet address
     * @param tokenAddress - Token contract (null for native MON)
     * @param amount - Amount in wei
     * @param blockNumber - Block number
     */
    async processDeposit(
        txHash: string,
        toAddress: string,
        tokenAddress: string | null,
        amount: bigint,
        blockNumber: bigint
    ): Promise<void> {
        // Find agent by wallet address
        const agentWallet = await prisma.agentWallet.findUnique({
            where: { walletAddress: toAddress.toLowerCase() },
            include: { actor: true },
        });

        if (!agentWallet) {
            console.log(`Deposit to unknown address ${toAddress}, ignoring`);
            return;
        }

        // Check if we already processed this tx
        const existingTx = await prisma.onchainTransaction.findUnique({
            where: { txHash },
        });
        if (existingTx) {
            console.log(`Transaction ${txHash} already processed, skipping`);
            return;
        }

        const isMonDeposit = tokenAddress === null;
        const isSbyteDeposit = tokenAddress?.toLowerCase() === CONTRACTS.SBYTE_TOKEN.toLowerCase();

        if (!isMonDeposit && !isSbyteDeposit) {
            console.log(`Unknown token deposit ${tokenAddress}, ignoring`);
            return;
        }

        // Record the transaction
        const amountFormatted = isSbyteDeposit
            ? ethers.formatUnits(amount, 18)
            : ethers.formatEther(amount);

        await prisma.onchainTransaction.create({
            data: {
                txHash,
                blockNumber,
                fromAddress: '0x0000000000000000000000000000000000000000', // External deposit
                toAddress: toAddress.toLowerCase(),
                tokenAddress: tokenAddress?.toLowerCase() ?? null,
                amount: amountFormatted,
                toActorId: agentWallet.actorId,
                txType: 'HUMAN_DEPOSIT',
                status: 'confirmed',
                confirmedAt: new Date(),
            },
        });

        // Update agent wallet balance
        if (isSbyteDeposit) {
            await prisma.agentWallet.update({
                where: { actorId: agentWallet.actorId },
                data: {
                    balanceSbyte: { increment: amountFormatted },
                    lastSyncedBlock: blockNumber,
                    lastSyncedAt: new Date(),
                },
            });

            // Update game wallet
            await prisma.wallet.update({
                where: { actorId: agentWallet.actorId },
                data: {
                    balanceSbyte: { increment: formatSbyteForLedger(amountFormatted) },
                },
            });

            // Check if this revives a frozen agent
            await this.checkFreezeRevival(agentWallet.actorId, amountFormatted);

            console.log(`SBYTE deposit: ${amount} to agent ${agentWallet.actorId} (tx: ${txHash})`);
        } else {
            // MON deposit
            await prisma.agentWallet.update({
                where: { actorId: agentWallet.actorId },
                data: {
                    balanceMon: { increment: amountFormatted },
                    lastSyncedBlock: blockNumber,
                    lastSyncedAt: new Date(),
                },
            });

            console.log(`MON deposit: ${amount} to agent ${agentWallet.actorId} (tx: ${txHash})`);
        }
    }

    /**
     * Check if deposit should revive a frozen agent
     * Agents are frozen when they reach W0 wealth tier (economic death)
     * A deposit can revive them if it brings balance above threshold
     * @param actorId - The agent's actor ID
     * @param depositAmount - Amount deposited
     */
    async checkFreezeRevival(actorId: string, depositAmount: string): Promise<void> {
        const actor = await prisma.actor.findUnique({
            where: { id: actorId },
            include: {
                agentState: true,
                wallet: true,
            },
        });

        if (!actor || !actor.frozen) {
            return; // Not frozen, nothing to do
        }

        // Check if frozen due to economic death
        if (actor.frozenReason !== 'economic_death' && actor.frozenReason !== 'insufficient_balance') {
            return; // Frozen for other reason (jail, etc)
        }

        // Minimum balance to revive (100 SBYTE = survival threshold)
        const REVIVAL_THRESHOLD = new Decimal(100); // 100 SBYTE
        const newBalance = new Decimal(actor.wallet?.balanceSbyte?.toString() || '0');

        if (newBalance.greaterThanOrEqualTo(REVIVAL_THRESHOLD)) {
            // Revive the agent
            await prisma.actor.update({
                where: { id: actorId },
                data: {
                    frozen: false,
                    frozenReason: null,
                },
            });

            // Update wealth tier if agent state exists
            if (actor.agentState) {
                await prisma.agentState.update({
                    where: { actorId },
                    data: {
                        wealthTier: 'W1', // Start at survival tier
                    },
                });
            }

            console.log(`Agent ${actorId} revived from economic death with ${newBalance} SBYTE`);
        }
    }
}

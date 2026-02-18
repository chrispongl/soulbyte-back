
import 'dotenv/config';
import { prisma, disconnectDB } from '../db.js';
import { WalletService } from '../services/wallet.service.js';
import { verifyContractConfig } from '../config/contracts.js';

async function main() {
    console.log('\n=== TESTING ON-CHAIN BALANCE SYNC ===');

    // 1. Verify contracts
    try {
        await verifyContractConfig();
    } catch (e: any) {
        console.error('Contract verification failed:', e.message);
        // Continue anyway to test RPC
    }

    // 2. Initialize Service
    try {
        const walletService = new WalletService();
        console.log('WalletService initialized.');

        const agents = await prisma.agentWallet.findMany({
            include: { actor: true }
        });

        if (agents.length === 0) {
            console.log('No agent wallets found.');
            return;
        }

        console.log(`Syncing balances for ${agents.length} agents...`);

        for (const agent of agents) {
            console.log(`\nSyncing ${agent.actor.name} (${agent.walletAddress})...`);
            try {
                // Pre-sync balance
                const before = await prisma.agentWallet.findUnique({ where: { actorId: agent.actorId } });

                // Sync
                await walletService.syncWalletBalances(agent.actorId);

                // Post-sync balance
                const after = await prisma.agentWallet.findUnique({ where: { actorId: agent.actorId } });

                console.log(`  MON:   ${before?.balanceMon} -> ${after?.balanceMon}`);
                console.log(`  SBYTE: ${before?.balanceSbyte} -> ${after?.balanceSbyte}`);

                if (after!.balanceMon > 0 || after!.balanceSbyte > 0) {
                    console.log('  ✅ FUNDED!');
                } else {
                    console.log('  ⚠️ Zero Balance');
                }

            } catch (e: any) {
                console.error(`  ❌ Sync failed:`, e.message);
            }
        }

    } catch (e: any) {
        console.error('Test failed:', e);
    }

    console.log('\n=====================================\n');
}

main()
    .finally(() => disconnectDB());

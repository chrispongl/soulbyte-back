/**
 * Blockchain Listener Service
 * Monitors SBYTE Transfer events and MON deposits
 */

import { ethers } from 'ethers';
import { prisma } from '../db.js';
import { CONTRACTS, ERC20_ABI } from '../config/contracts.js';
import { getResilientProvider, rpcSupportsLogs, RPC_CONFIG } from '../config/network.js';
import { withRpcRetry } from '../utils/rpc-retry.js';
import { formatSbyteForLedger } from '../utils/amounts.js';
import { DepositService } from './deposit.service.js';

/**
 * Blockchain Listener Service class
 */
export class BlockchainListenerService {
    private providerPromise: Promise<ethers.JsonRpcProvider>;
    private sbyteContractPromise: Promise<ethers.Contract>;
    private depositService: DepositService;
    private isListening: boolean = false;
    private sbyteLogsSupported: boolean = true;
    private sbyteLogsWarningShown: boolean = false;
    private lastScanBlock: number = 0;
    private scanIntervalBlocks: number = 5;
    private scanPausedUntilMs: number = 0;
    private rateLimitWarningShown: boolean = false;

    constructor() {
        this.providerPromise = getResilientProvider();
        this.sbyteContractPromise = this.providerPromise.then(
            (provider) => new ethers.Contract(CONTRACTS.SBYTE_TOKEN, ERC20_ABI, provider)
        );
        this.depositService = new DepositService();
        this.sbyteLogsSupported = rpcSupportsLogs();
        const configuredInterval = Number(RPC_CONFIG.blockScanIntervalBlocks);
        this.scanIntervalBlocks = Number.isFinite(configuredInterval) && configuredInterval > 0
            ? Math.floor(configuredInterval)
            : 5;
    }

    private async getProvider(): Promise<ethers.JsonRpcProvider> {
        return this.providerPromise;
    }

    private async getSbyteContract(): Promise<ethers.Contract> {
        return this.sbyteContractPromise;
    }

    /**
     * Start listening for blockchain events
     */
    async startListening(): Promise<void> {
        if (this.isListening) {
            console.log('Blockchain listener already running');
            return;
        }

        console.log('Starting blockchain listener...');
        this.isListening = true;

        // Get all agent wallet addresses
        const agentWallets = await prisma.agentWallet.findMany({
            select: { walletAddress: true },
        });
        const walletSet = new Set(agentWallets.map(w => w.walletAddress.toLowerCase()));

        console.log(`Monitoring ${walletSet.size} agent wallets`);

        // Listen for new blocks (for SBYTE + MON deposits)
        const provider = await this.getProvider();
        provider.on('block', async (blockNumber: number) => {
            try {
                if (Date.now() < this.scanPausedUntilMs) {
                    return;
                }
                if (blockNumber - this.lastScanBlock < this.scanIntervalBlocks) {
                    return;
                }
                this.lastScanBlock = blockNumber;

                await this.scanBlockForSbyteTransfers(blockNumber, walletSet);
                await this.scanBlockForMONDeposits(blockNumber, walletSet);
            } catch (error: any) {
                if (this.isRateLimitError(error)) {
                    this.scanPausedUntilMs = Date.now() + 60_000;
                    if (!this.rateLimitWarningShown) {
                        this.rateLimitWarningShown = true;
                        console.warn(
                            'RPC rate limit hit; pausing block scans for 60s.'
                        );
                    }
                    return;
                }
                console.error('Error scanning block for deposits:', error);
            }
        });

        console.log('✓ Blockchain listener started');
    }

    /**
     * Stop listening for blockchain events
     */
    stopListening(): void {
        if (!this.isListening) {
            return;
        }

        this.getSbyteContract().then(contract => contract.removeAllListeners());
        this.getProvider().then(provider => provider.removeAllListeners());
        this.isListening = false;
        console.log('Blockchain listener stopped');
    }

    /**
     * Scan a block for native MON deposits to agent wallets
     */
    private async scanBlockForMONDeposits(
        blockNumber: number,
        walletSet: Set<string>
    ): Promise<void> {
        const provider = await this.getProvider();
        const block = await withRpcRetry(
            () => provider.getBlock(blockNumber, true),
            'listenerGetBlock'
        );
        if (!block?.prefetchedTransactions) {
            return;
        }

        for (const tx of block.prefetchedTransactions) {
            const toAddress = tx.to?.toLowerCase();
            if (toAddress && walletSet.has(toAddress) && tx.value > 0n) {
                await this.depositService.processDeposit(
                    tx.hash,
                    tx.to!,
                    null, // MON transfer
                    tx.value,
                    BigInt(blockNumber)
                );
            }
        }
    }

    /**
     * Scan a block for SBYTE transfers to agent wallets
     */
    private async scanBlockForSbyteTransfers(
        blockNumber: number,
        walletSet: Set<string>
    ): Promise<void> {
        if (!this.sbyteLogsSupported) {
            return;
        }

        try {
            const provider = await this.getProvider();
            const sbyteContract = await this.getSbyteContract();
            const transferTopic = sbyteContract.interface.getEvent('Transfer')?.topicHash;
            if (!transferTopic) {
                return;
            }

            const logs = await withRpcRetry(
                () => provider.getLogs({
                    address: CONTRACTS.SBYTE_TOKEN,
                    fromBlock: blockNumber,
                    toBlock: blockNumber,
                    topics: [transferTopic],
                }),
                'listenerGetLogs'
            );

            for (const log of logs) {
                const parsed = sbyteContract.interface.parseLog(log);
                const toAddress = String(parsed.args?.to ?? '').toLowerCase();
                if (!toAddress || !walletSet.has(toAddress)) {
                    continue;
                }

                await this.depositService.processDeposit(
                    log.transactionHash,
                    String(parsed.args?.to),
                    CONTRACTS.SBYTE_TOKEN,
                    BigInt(parsed.args?.value ?? 0n),
                    BigInt(log.blockNumber)
                );
            }
        } catch (error: any) {
            const rpcError = error?.error ?? error;
            if (rpcError?.code === -32601) {
                this.sbyteLogsSupported = false;
                if (!this.sbyteLogsWarningShown) {
                    this.sbyteLogsWarningShown = true;
                    console.warn(
                        'RPC does not support eth_getLogs; SBYTE transfer monitoring disabled.'
                    );
                }
                return;
            }
            throw error;
        }
    }

    private isRateLimitError(error: any): boolean {
        const rpcError = error?.error ?? error;
        return rpcError?.code === -32007;
    }

    /**
     * Sync balances for all agent wallets
     * Called manually to ensure consistency
     */
    async syncAllBalances(): Promise<{ synced: number; errors: number }> {
        const wallets = await prisma.agentWallet.findMany();
        let synced = 0;
        let errors = 0;

        const provider = await this.getProvider();
        const sbyteContract = await this.getSbyteContract();
        for (const wallet of wallets) {
            try {
                // Get on-chain balances
                const monBalance = await withRpcRetry(
                    () => provider.getBalance(wallet.walletAddress),
                    'listenerSyncMonBalance'
                );
                const sbyteBalance = await withRpcRetry(
                    () => sbyteContract.balanceOf(wallet.walletAddress),
                    'listenerSyncSbyteBalance'
                );
                const currentBlock = await withRpcRetry(
                    () => provider.getBlockNumber(),
                    'listenerSyncBlockNumber'
                );

                // Update database
                const formattedMon = ethers.formatEther(monBalance);
                const formattedSbyte = ethers.formatUnits(sbyteBalance, 18);
                await prisma.agentWallet.update({
                    where: { actorId: wallet.actorId },
                    data: {
                        balanceMon: formattedMon,
                        balanceSbyte: formattedSbyte,
                        lastSyncedAt: new Date(),
                        lastSyncedBlock: BigInt(currentBlock),
                    },
                });

                // Sync to game wallet
                await prisma.wallet.update({
                    where: { actorId: wallet.actorId },
                    data: { balanceSbyte: formatSbyteForLedger(formattedSbyte) },
                });

                synced++;
            } catch (error) {
                console.error(`Failed to sync wallet ${wallet.walletAddress}:`, error);
                errors++;
            }
        }

        console.log(`Balance sync complete: ${synced} synced, ${errors} errors`);
        return { synced, errors };
    }

    /**
     * Refresh the list of monitored wallets
     * Call when a new wallet is imported
     */
    async refreshWalletList(): Promise<void> {
        // We need to restart listener to pick up new wallets
        if (this.isListening) {
            this.stopListening();
            await this.startListening();
        }
    }
}

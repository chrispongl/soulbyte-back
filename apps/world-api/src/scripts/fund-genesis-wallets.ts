/**
 * Fund genesis bot wallets with 5 MON if their balance is < 2 MON.
 * Uses the GOD_WALLET_PRIVATE_KEY to send funds.
 */
import 'dotenv/config';
import { ethers } from 'ethers';
import { prisma, connectDB, disconnectDB } from '../db.js';
import { getResilientProvider } from '../config/network.js';
import { withRpcRetry } from '../utils/rpc-retry.js';

const BOT_NAMES = [
    'jaxel7',
    'nicoRiot',
    'maverik22',
    'slyroam',
    'kade89',
    'roninx',
    'briqz',
    'zanevolt',
    'tycho77',
    'reeko5',
    'daxterr',
    'kyren',
    'lumaFox',
    'orion54',
    'vexley',
    'drayke',
    'calyx9',
    'rivenx',
    'junoir',
    'marz10',
    'zephyrion',
    'tannerx',
    'kairo8',
    'bramwell',
    'lucan7',
    'myloz',
    'renzoid',
    'corvin',
    'elricx',
    'ziven',
] as const;

const TARGET_BALANCE = 5.0;
const THRESHOLD_BALANCE = 2.0;
const FUND_AMOUNT = 5.0;

async function main() {
    try {
        console.log('Connecting to database...');
        await connectDB();

        // 1. Setup God Wallet
        const godPrivateKey = process.env.GOD_WALLET_PRIVATE_KEY;
        if (!godPrivateKey) {
            throw new Error('GOD_WALLET_PRIVATE_KEY is missing from env');
        }

        const provider = await getResilientProvider();
        const godWallet = new ethers.Wallet(godPrivateKey, provider);

        const godBalanceWei = await withRpcRetry(() => provider.getBalance(godWallet.address), 'getGodBalance');
        const godBalance = parseFloat(ethers.formatEther(godBalanceWei));

        console.log(`God Wallet: ${godWallet.address}`);
        console.log(`God Balance: ${godBalance.toFixed(4)} MON`);

        if (godBalance < 5) {
            console.warn('⚠️ WARNING: God wallet has low balance!');
        }

        // 2. Fetch Bots
        console.log(`Fetching ${BOT_NAMES.length} bots...`);
        const bots = await prisma.actor.findMany({
            where: { name: { in: [...BOT_NAMES] } },
            include: { agentWallet: true },
        });

        const botByName = new Map(bots.map(bot => [bot.name, bot]));
        let fundedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        // 3. Process Each Bot
        for (const name of BOT_NAMES) {
            const bot = botByName.get(name);
            if (!bot || !bot.agentWallet) {
                console.warn(`Skipping ${name}: Not found or no wallet.`);
                errorCount++;
                continue;
            }

            const address = bot.agentWallet.walletAddress;
            process.stdout.write(`Processing ${name} (${address})... `);

            try {
                // Check balance
                const balanceWei = await withRpcRetry(() => provider.getBalance(address), `getBalance-${name}`);
                const balance = parseFloat(ethers.formatEther(balanceWei));

                if (balance < THRESHOLD_BALANCE) {
                    console.log(`Balance: ${balance.toFixed(4)} MON. Funding with ${FUND_AMOUNT} MON...`);

                    const tx = await withRpcRetry(async () => {
                        const response = await godWallet.sendTransaction({
                            to: address,
                            value: ethers.parseEther(FUND_AMOUNT.toString()),
                        });
                        return response;
                    }, `fund-${name}`);

                    console.log(`  Bot Name: ${name}`);
                    console.log(`  Sent tx: ${tx.hash}`);

                    // Wait for confirmation to avoid nonce issues and ensure sequence
                    const receipt = await withRpcRetry(() => tx.wait(1), `wait-${name}`);
                    console.log(`  Confirmed in block ${receipt?.blockNumber}`);

                    fundedCount++;
                } else {
                    console.log(`Balance: ${balance.toFixed(4)} MON. OK.`);
                    skippedCount++;
                }
            } catch (err: any) {
                console.log('FAILED');
                console.error(`  Error funding ${name}:`, err.message || err);
                errorCount++;
            }
        }

        console.log('═══════════════════════════════════════════');
        console.log('          FUNDING COMPLETE                 ');
        console.log('═══════════════════════════════════════════');
        console.log(`Funded:  ${fundedCount}`);
        console.log(`Skipped: ${skippedCount}`);
        console.log(`Errors:  ${errorCount}`);

    } catch (error) {
        console.error('Script failed:', error);
        process.exit(1);
    } finally {
        await disconnectDB();
    }
}

main();

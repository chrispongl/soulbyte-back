/**
 * Sync genesis bot on-chain balances into game wallets + agent state.
 */
import 'dotenv/config';
import { prisma, connectDB, disconnectDB } from '../db.js';
import { WalletService } from '../services/wallet.service.js';

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

const THROTTLE_MS = Number(process.env.GENESIS_BOT_THROTTLE_MS || '1500');
const DRY_RUN = process.env.GENESIS_BOT_DRY_RUN === 'true';

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('═══════════════════════════════════════════');
    console.log('     SYNC GENESIS BOT BALANCES             ');
    console.log('═══════════════════════════════════════════');
    console.log(`Dry run: ${DRY_RUN}`);

    try {
        await connectDB();
        const ws = new WalletService();

        const bots = await prisma.actor.findMany({
            where: { name: { in: [...BOT_NAMES] } },
            include: { agentWallet: true, wallet: true, agentState: true },
        });
        const botByName = new Map(bots.map(b => [b.name, b]));

        for (const name of BOT_NAMES) {
            const bot = botByName.get(name);
            if (!bot) {
                console.warn(`Missing bot actor: ${name}`);
                continue;
            }
            if (!bot.agentWallet) {
                console.warn(`Missing agent wallet: ${name}`);
                continue;
            }

            console.log(`\n${name} -> ${bot.agentWallet.walletAddress}`);
            if (!DRY_RUN) {
                await ws.syncWalletBalances(bot.id);
                await sleep(THROTTLE_MS);
            }

            const wallet = await prisma.wallet.findUnique({ where: { actorId: bot.id } });
            if (wallet && !DRY_RUN) {
                await prisma.agentState.update({
                    where: { actorId: bot.id },
                    data: { balanceSbyte: wallet.balanceSbyte },
                });
            }
        }

        console.log('\n═══════════════════════════════════════════');
        console.log('        BOT BALANCE SYNC DONE              ');
        console.log('═══════════════════════════════════════════');
    } catch (error) {
        console.error('Bot balance sync failed:', error);
        process.exit(1);
    } finally {
        await disconnectDB();
    }
}

main();

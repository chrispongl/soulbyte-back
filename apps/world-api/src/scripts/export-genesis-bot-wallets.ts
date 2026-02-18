/**
 * Export genesis bot wallets (address + private key) from staging DB.
 * Requires WALLET_ENCRYPTION_KEY and staging DATABASE_URL.
 */
import 'dotenv/config';
import fs from 'fs';
import { prisma, connectDB, disconnectDB } from '../db.js';
import { decryptPrivateKey } from '../services/wallet.service.js';

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

const OUTPUT_PATH = process.env.GENESIS_BOT_WALLET_EXPORT_PATH;

async function main() {
    try {
        await connectDB();

        const bots = await prisma.actor.findMany({
            where: { name: { in: [...BOT_NAMES] } },
            include: { agentWallet: true },
        });
        const botByName = new Map(bots.map(bot => [bot.name, bot]));

        const output = BOT_NAMES.map((name) => {
            const bot = botByName.get(name);
            if (!bot || !bot.agentWallet) {
                throw new Error(`Missing agent wallet for ${name}`);
            }
            const privateKey = decryptPrivateKey(bot.agentWallet.encryptedPk, bot.agentWallet.pkNonce);
            return {
                name,
                address: bot.agentWallet.walletAddress,
                privateKey,
            };
        });

        const json = JSON.stringify(output, null, 2);
        if (OUTPUT_PATH) {
            fs.writeFileSync(OUTPUT_PATH, json, 'utf8');
            console.log(`✓ Exported ${output.length} bot wallets to ${OUTPUT_PATH}`);
        } else {
            console.log(json);
        }
    } catch (error) {
        console.error('Export failed:', error);
        process.exit(1);
    } finally {
        await disconnectDB();
    }
}

main();

/**
 * Export genesis bot wallets (address + private key) for the 30 specific genesis bots.
 * Requires WALLET_ENCRYPTION_KEY and valid DATABASE_URL in .env
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
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

// Target output directory and file
const OUTPUT_DIR = path.resolve(process.cwd(), 'docs/temporary/17-02-26/bot-wallets');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'genesis-bots.json');

async function main() {
    try {
        console.log('Connecting to database...');
        await connectDB();

        console.log(`Fetching ${BOT_NAMES.length} bots...`);
        const bots = await prisma.actor.findMany({
            where: { name: { in: [...BOT_NAMES] } },
            include: { agentWallet: true },
        });

        const botByName = new Map(bots.map(bot => [bot.name, bot]));
        const output: any[] = [];
        const missing: string[] = [];

        for (const name of BOT_NAMES) {
            const bot = botByName.get(name);
            if (!bot) {
                missing.push(name);
                continue;
            }
            if (!bot.agentWallet) {
                console.warn(`Warning: Bot ${name} found but has no wallet.`);
                continue;
            }

            try {
                const privateKey = decryptPrivateKey(bot.agentWallet.encryptedPk, bot.agentWallet.pkNonce);
                output.push({
                    name,
                    address: bot.agentWallet.walletAddress,
                    privateKey,
                });
            } catch (err) {
                console.error(`Failed to decrypt wallet for ${name}:`, err);
            }
        }

        if (missing.length > 0) {
            console.warn('Warning: The following bots were not found in the DB:', missing);
        }

        // Ensure directory exists
        if (!fs.existsSync(OUTPUT_DIR)) {
            console.log(`Creating directory: ${OUTPUT_DIR}`);
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        }

        // Write to file
        const json = JSON.stringify(output, null, 2);
        fs.writeFileSync(OUTPUT_FILE, json, 'utf8');

        console.log('═══════════════════════════════════════════');
        console.log(`✓ Exported ${output.length} bot wallets`);
        console.log(`✓ Saved to: ${OUTPUT_FILE}`);
        console.log('═══════════════════════════════════════════');

    } catch (error) {
        console.error('Export failed:', error);
        process.exit(1);
    } finally {
        await disconnectDB();
    }
}

main();

import 'dotenv/config';
import { prisma, connectDB, disconnectDB } from '../db.js';
import crypto from 'crypto';
import { hashApiKey, getKeyPrefix } from '../utils/api-key.js';

async function ensureKey(role: 'god' | 'angel') {
    const existing = await prisma.apiKey.findFirst({ where: { role, revokedAt: null } });
    if (existing) {
        return { role, key: null as string | null, already: true };
    }

    const prefix = role === 'god' ? 'sk_god_' : 'sk_angel_';
    const key = `${prefix}${crypto.randomBytes(32).toString('hex')}`;
    await prisma.apiKey.create({
        data: {
            keyHash: hashApiKey(key),
            keyPrefix: getKeyPrefix(key),
            role,
            permissions: role === 'god' ? ['god_actions', 'read_all', 'admin'] : ['moderation', 'read_all', 'admin'],
        },
    });
    return { role, key, already: false };
}

async function main() {
    await connectDB();
    const god = await ensureKey('god');
    const angel = await ensureKey('angel');

    console.log('=== ADMIN API KEYS ===');
    if (god.key) console.log(`GOD_API_KEY=${god.key}`);
    else console.log('GOD_API_KEY already exists (no new key created).');
    if (angel.key) console.log(`ANGEL_API_KEY=${angel.key}`);
    else console.log('ANGEL_API_KEY already exists (no new key created).');
    console.log('======================');
    await disconnectDB();
}

main().catch(async (error) => {
    console.error(error);
    await disconnectDB();
    process.exit(1);
});

import 'dotenv/config';
import { prisma } from '../db.js';
import { WalletService } from '../services/wallet.service.js';
import { CONTRACTS } from '../config/contracts.js';
import { ethers } from 'ethers';

async function main() {
    const god = await prisma.actor.findFirst({ where: { isGod: true } });
    if (!god) {
        throw new Error('God actor not found');
    }

    const pk = process.env.GOD_WALLET_PRIVATE_KEY;
    if (!pk) {
        throw new Error('GOD_WALLET_PRIVATE_KEY not set');
    }

    const expected = CONTRACTS.PUBLIC_VAULT_AND_GOD.toLowerCase();
    const derived = new ethers.Wallet(pk).address.toLowerCase();
    if (derived !== expected) {
        throw new Error(`GOD_WALLET_PRIVATE_KEY does not match PUBLIC_VAULT_AND_GOD. Derived=${derived}, expected=${expected}`);
    }

    const ws = new WalletService();
    const existing = await prisma.agentWallet.findUnique({ where: { actorId: god.id } });
    if (existing) {
        await prisma.agentWallet.delete({ where: { actorId: god.id } });
    }
    await ws.importWallet(god.id, pk);

    const aw = await prisma.agentWallet.findUnique({ where: { actorId: god.id } });
    console.log('God agent_wallet address:', aw?.walletAddress);
}

main()
    .catch(error => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

import 'dotenv/config';
import { prisma } from '../db.js';
import { ethers } from 'ethers';
import fs from 'fs/promises';
import path from 'path';

async function main() {
    console.log('\n=== AGENT WALLETS (VALIDATED) ===');

    const agents = await prisma.agentWallet.findMany({
        include: { actor: true }
    });

    let output = '=== AGENT WALLETS ===\n';

    for (const w of agents) {
        const isValid = ethers.isAddress(w.walletAddress);
        const checksumAddress = isValid ? ethers.getAddress(w.walletAddress) : 'INVALID';

        const info = `Name: ${w.actor.name}\nAddress: ${w.walletAddress}\nChecksum: ${checksumAddress}\nStatus: ${isValid ? 'VALID' : 'INVALID'}\n----------------------------------------\n`;
        console.log(info);
        output += info;
    }

    await fs.writeFile(path.join(process.cwd(), 'wallets.txt'), output);
    console.log('\nWritten to wallets.txt');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

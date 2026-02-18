import 'dotenv/config';
import { prisma, disconnectDB } from '../db.js';

async function main() {
  const adminRpc = (process.env.MONAD_RPC_URL || '').trim();
  if (!adminRpc) {
    console.log('MONAD_RPC_URL not set. Nothing to clear.');
    return;
  }

  console.log('\n=== CLEAR ADMIN PREFERRED RPC ===');
  console.log(`Admin RPC: ${adminRpc}`);

  const before = await prisma.agentWallet.count({
    where: {
      preferredRpc: adminRpc,
    },
  });

  const result = await prisma.agentWallet.updateMany({
    where: {
      preferredRpc: adminRpc,
    },
    data: {
      preferredRpc: null,
    },
  });

  console.log(`Preferred RPC set before: ${before}`);
  console.log(`Cleared preferred RPC on: ${result.count} wallets`);
  console.log('=================================\n');
}

main()
  .catch((error) => {
    console.error('Script failed:', error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());

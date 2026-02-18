import 'dotenv/config';
import { prisma, disconnectDB } from '../db.js';

type RpcRow = {
  preferred_rpc: string | null;
  count: number;
};

async function main() {
  console.log('\n=== PREFERRED RPC SUMMARY ===');
  const rows = await prisma.$queryRaw<RpcRow[]>`
    SELECT
      preferred_rpc,
      COUNT(*)::int as count
    FROM agent_wallets
    GROUP BY preferred_rpc
    ORDER BY count DESC
  `;

  if (rows.length === 0) {
    console.log('No agent wallets found.');
    return;
  }

  for (const row of rows) {
    console.log(`${row.count} -> ${row.preferred_rpc ?? 'NULL'}`);
  }

  const adminLike = await prisma.$queryRaw<RpcRow[]>`
    SELECT
      preferred_rpc,
      COUNT(*)::int as count
    FROM agent_wallets
    WHERE preferred_rpc ILIKE '%quiknode%'
       OR preferred_rpc ILIKE '%quicknode%'
    GROUP BY preferred_rpc
    ORDER BY count DESC
  `;

  if (adminLike.length > 0) {
    console.log('\nAdmin-like RPCs:');
    for (const row of adminLike) {
      console.log(`${row.count} -> ${row.preferred_rpc ?? 'NULL'}`);
    }
  } else {
    console.log('\nAdmin-like RPCs: none');
  }
  console.log('=============================\n');
}

main()
  .catch((error) => {
    console.error('Script failed:', error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());

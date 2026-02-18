import 'dotenv/config';
import { prisma, disconnectDB } from '../db.js';

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
];

async function main() {
  console.log('\n=== CLEAR BOT PREFERRED RPC ===');

  const bots = await prisma.actor.findMany({
    where: { name: { in: BOT_NAMES } },
    select: { id: true, name: true },
  });
  const botIds = bots.map((bot) => bot.id);
  console.log(`Bots found: ${bots.length}`);

  if (botIds.length === 0) {
    console.log('No bot actors found. Nothing to clear.');
    return;
  }

  const before = await prisma.agentWallet.count({
    where: {
      actorId: { in: botIds },
      preferredRpc: { not: null },
    },
  });

  const result = await prisma.agentWallet.updateMany({
    where: {
      actorId: { in: botIds },
      preferredRpc: { not: null },
    },
    data: {
      preferredRpc: null,
    },
  });

  console.log(`Preferred RPC set before: ${before}`);
  console.log(`Cleared preferred RPC on: ${result.count} bot wallets`);
  console.log('================================\n');
}

main()
  .catch((error) => {
    console.error('Script failed:', error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());

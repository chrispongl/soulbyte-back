import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import prismaPkg from '../../../../generated/prisma/index.js';

const { PrismaClient } = prismaPkg;

const connectionString = process.env.DATABASE_URL || 'postgresql://soulbyte:soulbyte@localhost:5432/soulbyte';
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    const result = await prisma.agentState.updateMany({
        data: {
            health: 100,
            energy: 100,
            hunger: 100,
            social: 100,
            fun: 100,
            purpose: 100,
        },
    });
    console.log(`Updated ${result.count} agent_state rows.`);
}

main()
    .catch((error) => {
        console.error('Failed to update agent statuses:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });

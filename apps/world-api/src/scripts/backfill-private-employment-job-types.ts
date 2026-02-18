import 'dotenv/config';
import { prisma, connectDB, disconnectDB } from '../db.js';

async function backfillPrivateEmploymentJobTypes() {
    const dryRun = process.env.DRY_RUN !== 'false';
    console.log(`Backfilling private employment job types (dryRun=${dryRun})`);
    await connectDB();
    try {
        const worldState = await prisma.worldState.findFirst({ where: { id: 1 } });
        const tick = worldState?.tick ?? 0;
        const employments = await prisma.privateEmployment.findMany({
            where: { status: 'ACTIVE' },
            include: {
                business: { select: { id: true, name: true, businessType: true } },
                agent: { select: { id: true, name: true, agentState: true, publicEmployment: true } }
            }
        });
        console.log(`Found ${employments.length} active private employments.`);

        let updated = 0;
        for (const employment of employments) {
            const agentState = employment.agent?.agentState;
            if (!agentState) continue;

            const publicEmployment = employment.agent?.publicEmployment;

            const needsPublicEnd = Boolean(publicEmployment && publicEmployment.endedAtTick === null);
            if (!needsPublicEnd) continue;

            updated += 1;
            if (dryRun) {
                console.log(`  [dry-run] ${employment.agent?.name ?? employment.agentId}: end public job at tick ${tick}`);
                continue;
            }
            if (needsPublicEnd) {
                await prisma.publicEmployment.update({
                    where: { actorId: employment.agentId },
                    data: { endedAtTick: tick }
                });
            }
            console.log(`  ✓ ${employment.agent?.name ?? employment.agentId}: public job ended`);
        }

        console.log(`Updated ${updated} agents.`);
    } finally {
        await disconnectDB();
    }
}

backfillPrivateEmploymentJobTypes().catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
});

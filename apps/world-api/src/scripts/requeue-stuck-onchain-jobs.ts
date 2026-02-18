import 'dotenv/config';
import { prisma, disconnectDB } from '../db.js';

type Args = {
    apply: boolean;
    olderThanMinutes: number;
    limit: number;
};

function parseArgs(): Args {
    const args = process.argv.slice(2);
    const apply = args.includes('--apply');
    const olderArg = args.find((arg) => arg.startsWith('--older-than-mins='));
    const limitArg = args.find((arg) => arg.startsWith('--limit='));

    const olderThanMinutes = olderArg
        ? Number(olderArg.split('=')[1])
        : 10;
    const limit = limitArg ? Number(limitArg.split('=')[1]) : 500;

    return {
        apply,
        olderThanMinutes: Number.isFinite(olderThanMinutes) ? olderThanMinutes : 10,
        limit: Number.isFinite(limit) ? limit : 500,
    };
}

async function main() {
    const { apply, olderThanMinutes, limit } = parseArgs();
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

    console.log('\n=== REQUEUE STUCK ONCHAIN JOBS ===');
    console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
    console.log(`Older than: ${olderThanMinutes} minutes`);
    console.log(`Limit: ${limit}`);

    const jobs = await prisma.onchainJob.findMany({
        where: {
            status: 'processing',
            updatedAt: { lte: cutoff },
        },
        select: {
            id: true,
            jobType: true,
            actorId: true,
            relatedIntentId: true,
            retryCount: true,
            updatedAt: true,
        },
        orderBy: { updatedAt: 'asc' },
        take: limit,
    });

    if (jobs.length === 0) {
        console.log('No stuck processing jobs found.');
        return;
    }

    for (const job of jobs) {
        console.log(
            `Job: ${job.id} type=${job.jobType} actor=${job.actorId ?? 'n/a'} intent=${job.relatedIntentId ?? 'n/a'} updated=${job.updatedAt.toISOString()}`
        );
    }

    if (!apply) {
        console.log('\nDry run only. Use --apply to requeue.');
        return;
    }

    const now = new Date();
    const result = await prisma.onchainJob.updateMany({
        where: {
            id: { in: jobs.map((job) => job.id) },
        },
        data: {
            status: 'queued',
            nextAttemptAt: now,
            lastError: 'requeued_stuck_processing',
        },
    });

    console.log(`\nRequeued: ${result.count}`);
    console.log('==================================\n');
}

main()
    .catch((error) => {
        console.error('Script failed:', error);
        process.exitCode = 1;
    })
    .finally(() => disconnectDB());

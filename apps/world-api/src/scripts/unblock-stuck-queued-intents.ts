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
        : 30;
    const limit = limitArg ? Number(limitArg.split('=')[1]) : 500;

    return {
        apply,
        olderThanMinutes: Number.isFinite(olderThanMinutes) ? olderThanMinutes : 30,
        limit: Number.isFinite(limit) ? limit : 500,
    };
}

async function main() {
    const { apply, olderThanMinutes, limit } = parseArgs();
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

    console.log('\n=== UNBLOCK STUCK QUEUED INTENTS ===');
    console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
    console.log(`Older than: ${olderThanMinutes} minutes`);
    console.log(`Limit: ${limit}`);

    const queuedIntents = await prisma.intent.findMany({
        where: {
            status: 'queued',
            createdAt: { lte: cutoff },
        },
        select: {
            id: true,
            actorId: true,
            type: true,
            createdAt: true,
            params: true,
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
    });

    if (queuedIntents.length === 0) {
        console.log('No queued intents found.');
        return;
    }

    let candidates = 0;
    let updated = 0;

    for (const intent of queuedIntents) {
        const jobs = await prisma.onchainJob.findMany({
            where: { relatedIntentId: intent.id },
            select: { status: true },
        });

        const activeJobs = jobs.filter((job) => ['queued', 'processing'].includes(job.status));
        if (activeJobs.length > 0) {
            continue;
        }

        candidates += 1;
        const jobStatusCounts = jobs.reduce<Record<string, number>>((acc, job) => {
            acc[job.status] = (acc[job.status] ?? 0) + 1;
            return acc;
        }, {});

        console.log(
            `Candidate: ${intent.id} (${intent.type}) actor=${intent.actorId} created=${intent.createdAt.toISOString()} jobs=${JSON.stringify(jobStatusCounts)}`
        );

        if (!apply) continue;

        const params = (intent.params as Record<string, unknown> | null) ?? {};
        await prisma.intent.update({
            where: { id: intent.id },
            data: {
                status: 'blocked',
                params: {
                    ...params,
                    blockReason: 'cleanup_stuck_queued_intent',
                    cleanup: {
                        at: new Date().toISOString(),
                        jobStatuses: jobStatusCounts,
                    },
                },
            },
        });
        updated += 1;
    }

    console.log(`\nQueued intents scanned: ${queuedIntents.length}`);
    console.log(`Candidates found: ${candidates}`);
    console.log(`Updated: ${updated}`);
    console.log('====================================\n');
}

main()
    .catch((error) => {
        console.error('Script failed:', error);
        process.exitCode = 1;
    })
    .finally(() => disconnectDB());

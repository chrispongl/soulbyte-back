import 'dotenv/config';
import { prisma, connectDB, disconnectDB } from '../db.js';
import { personaService } from '../engine/persona/persona.service.js';

async function backfillPersonaStates() {
    console.log('Backfilling personaState records for agents...');
    await connectDB();
    try {
        const actors = await prisma.actor.findMany({
            where: {
                kind: 'agent',
                personaState: { is: null },
            },
            select: { id: true, name: true },
        });
        console.log(`Found ${actors.length} agents without personaState.`);
        for (const actor of actors) {
            await personaService.loadPersona(actor.id);
            console.log(`  ✓ seeded personaState for ${actor.name}`);
        }
    } finally {
        await disconnectDB();
    }
}

backfillPersonaStates().catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
});
